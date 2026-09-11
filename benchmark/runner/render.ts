/**
 * Browser rendering for the gates that need pixels.
 *
 * Everything else in the compat suite runs on a parsed document. C3 and C4
 * cannot: the whole point of C3 is that HEO's correctness claim is now visual —
 * carriers make rendered `innerText` empty by construction, so the cheap
 * mechanical check on the spec's central invariant is gone and this is the
 * replacement. Treat a pixel-diff failure as a genuine defect until proven
 * otherwise.
 *
 * Documents are served through request interception rather than `setContent`.
 * A `<meta http-equiv="Content-Security-Policy">` and a relative stylesheet URL
 * both behave differently on `about:blank`, and the corpus has a document for
 * each — a harness that could not see a CSP blocking HEO's own stylesheet would
 * be missing the failure it exists to catch.
 */

import { type Browser, type ConsoleMessage, chromium, type Page } from "playwright";

/** Three viewports, light and dark. The matrix C3 is specified over. */
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1280, height: 900 },
] as const;

const SCHEMES = ["light", "dark"] as const;

const ORIGIN = "http://corpus.heo.invalid";

export interface Capture {
  /** `<viewport>/<scheme>`, matched pairwise between the two renders. */
  key: string;
  png: Buffer;
}

/**
 * The sentinel `text` of a rendered replaced box.
 *
 * A carrier occupies a position in the reading order and has no text at all, so
 * a collector that only saw text nodes would report the page as having lost a
 * word rather than as having drawn one. Publisher `<svg>` elements collect the
 * same way and appear identically on both sides of a comparison.
 */
export const REPLACED = "\u0000replaced";

/** One rendered word, addressed by where the browser actually put it. */
export interface WordBox {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Base direction of the containing block, so a line can be read the right way. */
  dir: "ltr" | "rtl";
}

export interface RenderResult {
  captures: Capture[];
  /** Word geometry per capture key. The layout half of C3. */
  layout: Record<string, WordBox[]>;
  /** Console errors and warnings, plus uncaught page errors. */
  messages: string[];
}

export interface Renderer {
  render(html: string): Promise<RenderResult>;
  close(): Promise<void>;
}

/**
 * Every rendered word and where it sits, read with `Range` so the numbers come
 * from the browser's own layout rather than from a model of it.
 *
 * This is what makes "no visible difference" checkable instead of approximated.
 * A pixel count cannot tell a line break from antialiasing: measured on this
 * corpus, a chaff sentence painting in full view produced 971 differing pixels
 * and a sub-pixel glyph shift produced 305, which no ratio separates. Word
 * geometry does: a moved line changes `y`, a reflow changes `x` by pixels, and
 * splitting a shaped run changes it by hundredths.
 */
const COLLECT_WORDS = `(() => {
  const out = [];
  const walk = (node) => {
    if (node.nodeType === 3) {
      const text = node.nodeValue;
      const re = /\\S+/g;
      let match;
      while ((match = re.exec(text)) !== null) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const rect = range.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const host = node.parentElement;
          out.push({
            text: match[0],
            x: Math.round((rect.left + window.scrollX) * 100) / 100,
            y: Math.round((rect.top + window.scrollY) * 100) / 100,
            width: Math.round(rect.width * 100) / 100,
            height: Math.round(rect.height * 100) / 100,
            dir: host === null ? "ltr" : getComputedStyle(host).direction,
          });
        }
      }
      return;
    }
    if (node.nodeType !== 1) return;
    if (node.tagName === "STYLE" || node.tagName === "SCRIPT" || node.tagName === "TEMPLATE") return;
    if (node.tagName.toLowerCase() === "svg") {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        out.push({
          text: "\u0000replaced",
          x: Math.round((rect.left + window.scrollX) * 100) / 100,
          y: Math.round((rect.top + window.scrollY) * 100) / 100,
          width: Math.round(rect.width * 100) / 100,
          height: Math.round(rect.height * 100) / 100,
          dir: getComputedStyle(node).direction,
        });
      }
      return;
    }
    for (const child of node.childNodes) walk(child);
  };
  walk(document.body);
  return out;
})()`;

function interesting(message: ConsoleMessage): boolean {
  return message.type() === "error" || message.type() === "warning";
}

/**
 * Requests other than the document itself are answered with a 404 rather than
 * left to fail resolution. The corpus references assets that do not exist, and
 * a failed lookup is noisier and slower than an honest miss — the same on both
 * sides of the comparison either way, since C4 compares against the input's own
 * baseline rather than against silence.
 */
async function load(page: Page, html: string): Promise<void> {
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url === `${ORIGIN}/`) {
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
      return;
    }
    await route.fulfill({ status: 404, contentType: "text/plain", body: "" });
  });
  await page.goto(`${ORIGIN}/`, { waitUntil: "load" });
  // Web fonts and lazily-decoded images settle after `load`, and a screenshot
  // taken before they do differs from one taken after for reasons that have
  // nothing to do with the transformation.
  await page.evaluate(() => document.fonts.ready);
}

export async function createRenderer(): Promise<Renderer> {
  const browser: Browser = await chromium.launch();

  return {
    async render(html: string): Promise<RenderResult> {
      const captures: Capture[] = [];
      const layout: Record<string, WordBox[]> = {};
      const messages: string[] = [];

      for (const viewport of VIEWPORTS) {
        for (const scheme of SCHEMES) {
          const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height },
            colorScheme: scheme,
            deviceScaleFactor: 1,
          });
          const page = await context.newPage();
          page.on("console", (message) => {
            if (interesting(message)) messages.push(`${message.type()}: ${message.text()}`);
          });
          page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));

          await load(page, html);
          const key = `${viewport.name}/${scheme}`;
          captures.push({ key, png: await page.screenshot({ fullPage: true }) });
          layout[key] = (await page.evaluate(COLLECT_WORDS)) as WordBox[];
          await context.close();
        }
      }

      return { captures, layout, messages };
    },

    async close(): Promise<void> {
      await browser.close();
    },
  };
}

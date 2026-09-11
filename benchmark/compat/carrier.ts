/**
 * Carrier fidelity.
 *
 * Not a per-document gate, for the same reason concealment is not one. Whether
 * a carrier lands on the baseline at the right advance is a property of the
 * generator's metrics and of one CSS declaration, and the honest way to check
 * it is to render the same face two ways and compare — not to hope a corpus
 * page exposes the mismatch.
 *
 * There is a second reason here, and it is the harder one. A carrier is drawn
 * from **the publisher's own font file**, which the engine is handed as bytes.
 * A corpus document has no such file: the browser renders it in whatever face
 * the machine has, and the generator would be drawing a different one. Running
 * carriers across the corpus would therefore measure the distance between two
 * fonts on whichever machine happened to run it. So this check embeds one font
 * in the page as a `data:` URL and hands the generator the same bytes, and the
 * corpus keeps testing what it is good at.
 *
 * **What it gates.**
 *
 * - *Alignment.* The output's boxes must line up with the input's token for
 *   token: same count, same order, each within half a pixel in x, y and width.
 *   This is the check that catches the failure the whole exercise exists to
 *   avoid — a carrier set at the wrong size or placed on the wrong baseline,
 *   which is visible on the line and which no text-level test can see. Measured
 *   worst case on this font: 0.05 px horizontally, 0.19 px vertically, 0.03 px
 *   of width. The vertical residue is Chromium rounding a font's ascent to
 *   whole pixels for the inline box while the SVG uses the exact metric; the
 *   ink is placed from the baseline and is unaffected, which the paint check is
 *   what actually establishes.
 * - *Paint.* Painted ink within 2% and the page the same size, which is C3's
 *   rule and its thresholds, applied to the pages C3 cannot be run on.
 * - *Fallback, then refusal.* A glyph the publisher's font has no outline for
 *   is drawn by a fallback face, because a carrier in the wrong face still
 *   takes the value out of the DOM and is only cosmetically imperfect —
 *   invariant 7 forbids falling back to readable *text*, not to another font.
 *   With nothing left that can draw the run, the page goes down: served as
 *   text it would be a configuration error a publisher would never see.
 * - *A strict policy.* The baseline shift is a class in the injected
 * stylesheet, so a policy that blocks that stylesheet unaligns every carrier on
 * the page. The nonce negotiation is what stops that, and this is where it is
 * checked with a carrier actually present.
 *
 * It needs the generator, which is a cargo artifact and is not committed. Where
 * it is missing the check reports itself as skipped rather than passing
 * silently: a check that is not run is not a gate, and saying so is the whole
 * of the difference.
 */

import { transformHtml } from "@heo/core";
import { createCarrierRenderer } from "@heo/generator/host";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import type { Renderer, WordBox } from "../runner/render.ts";
import type { Violation } from "../runner/types.ts";
import { buildTestFont, COVERAGE, fontFaceRule } from "./testfont.ts";

/** Half a pixel: an order of magnitude above the measured residue, and far */
/** below the smallest size or baseline error a reader would notice. */
const MAX_OFFSET_PX = 0.5;

/** C3's ceiling, and for the same reason: ink separates where a ratio cannot. */
const MAX_INK_DELTA = 0.02;

const FAMILY = "HeoRect";

/**
 * A second face, differing from the primary in exactly one glyph.
 *
 * It used to be the font `@heo/middleware` bundled. The package ships none now
 * — a middleware is not a font distributor — so a publisher who wants a
 * fallback configures one, and this is the shape of that. Built rather than
 * fetched for the same reason as the primary: one extra glyph of coverage is
 * the whole variable under test, and a real face would bring several thousand
 * others along with a licence.
 */
const FALLBACK_COVERAGE = `${COVERAGE}¤`;

/**
 * Marked the way a publisher marks: the spans that become carriers are the
 * `<heo-protect>` elements, and their substitutes are the publisher's own.
 * Nothing else on the page is touched.
 */
const BODY =
  `<section><p><heo-protect alt='["Group revenue reached 3.6"]'>Group revenue ` +
  `reached 4.2</heo-protect> in the second quarter, <heo-protect alt='["up from 2.7"]'>up from ` +
  `3.1</heo-protect> a year earlier and <heo-protect>margin improved to 18.4</heo-protect> ` +
  `across the period.</p>` +
  `<p><heo-protect alt='["The board approved 9.4"]'>The board approved 12.5</heo-protect> of ` +
  `spending and expects <heo-protect>no revision before 14 December 2026</heo-protect>.` +
  `<heo-chaff>Segment margins tracked ahead of the internal plan.</heo-chaff></p>` +
  `</section>`;

/**
 * The same page with nothing in the text channel: `alt` is what produces a
 * decoy, so a mark without one is a carrier and nothing else. The alignment
 * cases use this, because they compare token boxes position for position and a
 * decoy node is a second box the original does not have.
 */
const BODY_PLAIN = BODY.replaceAll(/ alt='\[[^\]]*\]'/g, "").replace(
  /<heo-chaff>[^<]*<\/heo-chaff>/,
  "",
);

/**
 * The publisher's own stylesheet carries the publisher's own nonce.
 *
 * Without one, a `style-src 'self'` page has *its* styles blocked as well as
 * HEO's — the font never loads, the input renders in a fallback face, and the
 * check measures the browser's default font against the generator's. That is
 * not the failure mode a strict policy actually produces on a real site, where
 * the publisher's CSS is either external or nonced. The first run of this check
 * did exactly that and reported an 11 px width error; the shape of the test
 * page was what was wrong.
 */
const PUBLISHER_NONCE = "publisherstylesheet1";

function page(font: Uint8Array, body: string, policy = ""): string {
  const meta =
    policy === "" ? "" : `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  const nonce = policy === "" ? "" : ` nonce="${PUBLISHER_NONCE}"`;
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Carrier</title>${meta}` +
    `<style${nonce}>${fontFaceRule(font, FAMILY)}` +
    `body{margin:0;background:#fff;color:#000}` +
    // The one rule a publisher writes for the content form of `heo-chaff`: its
    // prose is ordinary text until HEO conceals it, so any route that can serve
    // the page untransformed shows it.
    `heo-chaff{display:none}` +
    `p{font:16px/1.5 ${FAMILY},monospace;margin:0 0 12px}</style></head>` +
    `<body>${body}</body></html>`
  );
}

export interface CarrierResult {
  name: string;
  passed: boolean;
  detail: string;
  measures: Record<string, number>;
}

/** Non-background pixels, counted exactly as C3 counts them. */
function inkOf(png: PNG): number {
  let ink = 0;
  for (let index = 0; index < png.data.length; index += 4) {
    if (
      (png.data[index] as number) < 200 ||
      (png.data[index + 1] as number) < 200 ||
      (png.data[index + 2] as number) < 200
    ) {
      ink++;
    }
  }
  return ink;
}

/**
 * Compares two token streams position by position.
 *
 * Token-for-token rather than as a subsequence, which is stricter than C3 and
 * can be: a carrier replaces exactly the words it draws, one box per word, so
 * the two streams have the same length or the substitution moved something.
 */
function compareTokens(before: WordBox[], after: WordBox[]): { detail: string; worst: number[] } {
  if (before.length !== after.length) {
    return { detail: `token count changed from ${before.length} to ${after.length}`, worst: [] };
  }
  let worstX = 0;
  let worstY = 0;
  let worstWidth = 0;
  for (let index = 0; index < before.length; index++) {
    const left = before[index] as WordBox;
    const right = after[index] as WordBox;
    // A carrier is a box with no text, so a token that still has text must be
    // the same text: a word that changed is a word HEO rewrote in plain sight.
    if (right.text !== left.text && right.text.charCodeAt(0) !== 0) {
      return {
        detail: `${JSON.stringify(left.text)} became ${JSON.stringify(right.text)}`,
        worst: [],
      };
    }
    worstX = Math.max(worstX, Math.abs(right.x - left.x));
    worstY = Math.max(worstY, Math.abs(right.y - left.y));
    worstWidth = Math.max(worstWidth, Math.abs(right.width - left.width));
    if (Math.max(worstX, worstY, worstWidth) > MAX_OFFSET_PX) {
      return {
        detail:
          `${JSON.stringify(left.text)} moved by ` +
          `${(right.x - left.x).toFixed(2)},${(right.y - left.y).toFixed(2)} px ` +
          `and changed width by ${(right.width - left.width).toFixed(2)} px`,
        worst: [worstX, worstY, worstWidth],
      };
    }
  }
  return { detail: "", worst: [worstX, worstY, worstWidth] };
}

export async function checkCarriers(
  renderer: Renderer,
): Promise<{ results: CarrierResult[]; violations: Violation[] }> {
  const font = buildTestFont(FAMILY);
  let carrier: ReturnType<typeof createCarrierRenderer>;
  try {
    carrier = createCarrierRenderer({ font });
  } catch (error) {
    // The module is derivable and deliberately untracked, so a tree that has
    // not run `pnpm --filter @heo/generator build` cannot run this. Skipped and
    // said out loud, never quietly counted as a pass.
    return {
      results: [
        {
          name: "generator",
          passed: false,
          detail: `skipped, no generator module: ${(error as Error).message}`,
          measures: {},
        },
      ],
      violations: [],
    };
  }

  const results: CarrierResult[] = [];
  const violations: Violation[] = [];
  const record = (result: CarrierResult): void => {
    results.push(result);
    if (!result.passed)
      violations.push({ gate: "carrier", detail: `${result.name}: ${result.detail}` });
  };

  const config = {
    seed: "cp0:carrier",
    carrier: { renderer: carrier, fontSizePx: 16 },
  };

  /** One case: transform, render both, compare. */
  const measure = async (name: string, source: string, strict: boolean): Promise<void> => {
    const output = transformHtml(source, config);
    const before = await renderer.render(source);
    const after = await renderer.render(output.html);

    const problems: string[] = [];
    let worstX = 0;
    let worstY = 0;
    let worstWidth = 0;
    let worstInk = 0;
    let worstRatio = 0;

    for (const [key, tokens] of Object.entries(before.layout)) {
      const now = after.layout[key];
      if (now === undefined) continue;
      if (strict) {
        const { detail, worst } = compareTokens(tokens, now);
        if (detail !== "") problems.push(`${key}: ${detail}`);
        worstX = Math.max(worstX, worst[0] ?? 0);
        worstY = Math.max(worstY, worst[1] ?? 0);
        worstWidth = Math.max(worstWidth, worst[2] ?? 0);
      }
    }

    for (const capture of before.captures) {
      const other = after.captures.find((candidate) => candidate.key === capture.key);
      if (other === undefined) continue;
      const left = PNG.sync.read(capture.png);
      const right = PNG.sync.read(other.png);
      if (left.width !== right.width || left.height !== right.height) {
        problems.push(
          `${capture.key}: page size changed from ${left.width}x${left.height} to ` +
            `${right.width}x${right.height}`,
        );
        continue;
      }
      const differing = pixelmatch(left.data, right.data, undefined, left.width, left.height, {
        threshold: 0.1,
      });
      worstRatio = Math.max(worstRatio, differing / (left.width * left.height));
      const inkBefore = inkOf(left);
      const delta = inkBefore === 0 ? 0 : Math.abs(inkOf(right) - inkBefore) / inkBefore;
      worstInk = Math.max(worstInk, delta);
      if (delta > MAX_INK_DELTA) {
        problems.push(`${capture.key}: painted ink changed by ${(delta * 100).toFixed(1)}%`);
      }
    }

    record({
      name,
      passed: problems.length === 0,
      detail: problems.join("; "),
      measures: {
        carriers: output.stats.carriers,
        bytes: output.stats.outputBytes / output.stats.inputBytes,
        worstOffsetXPx: worstX,
        worstOffsetYPx: worstY,
        worstWidthDeltaPx: worstWidth,
        worstInkDelta: worstInk,
        worstRatio,
      },
    });
  };

  await measure("alignment", page(font, BODY_PLAIN), true);
  // Chaff and decoys add boxes of their own, which the concealment check
  // already proves are paint- and layout-neutral. What is left to establish
  // here is that neither paints, and that is a question about ink.
  await measure("decoy", page(font, BODY), false);

  // A policy the nonce has to negotiate before the baseline class can apply.
  // `font-src` is left alone on purpose: the point is the stylesheet.
  await measure(
    "strict-csp",
    page(font, BODY_PLAIN, `style-src 'self' 'nonce-${PUBLISHER_NONCE}'`),
    true,
  );

  // `¤` is outside the rectangle font's coverage, so the primary face returns
  // null. Two cases follow from that and they are opposite.
  const undrawable = page(
    font,
    `<section><p>Group revenue <heo-protect>reached ¤4.2 this ` +
      `quarter</heo-protect>.</p></section>`,
  );

  // With nothing to fall back to, the page goes down. Served as text it would
  // publish the value HEO was asked to protect, and nothing in the response
  // would say so.
  let refused = "";
  try {
    transformHtml(undrawable, config);
  } catch (error) {
    refused = (error as Error).name;
  }
  record({
    name: "undrawable-refuses",
    passed: refused === "HeoCoverageError",
    detail:
      refused === ""
        ? "a page no configured face could draw was served instead of refused"
        : `refused with ${refused}`,
    measures: {},
  });

  // With one, the word is drawn in the fallback face and the page is served —
  // and the substitution is counted, because a silent fallback is a page that
  // looks right to us and reads wrong to somebody else.
  const withFallback = createCarrierRenderer({
    font,
    fallbacks: [buildTestFont("HeoFallback", FALLBACK_COVERAGE)],
  });
  let served: { carriers: number; fallbacks: number } | null = null;
  let fallbackDetail = "";
  try {
    const output = transformHtml(undrawable, {
      ...config,
      carrier: { ...config.carrier, renderer: withFallback },
    });
    served = {
      carriers: output.stats.carriers,
      fallbacks: output.stats.carrierFallbacks,
    };
  } catch (error) {
    fallbackDetail = `refused with ${(error as Error).name} despite a fallback face`;
  }
  record({
    name: "undrawable-falls-back",
    passed: served !== null && served.fallbacks === 1 && served.carriers === 4,
    detail:
      fallbackDetail !== ""
        ? fallbackDetail
        : served === null
          ? "no output"
          : `carriers=${served.carriers} fallbacks=${served.fallbacks}`,
    measures: {},
  });

  return { results, violations };
}

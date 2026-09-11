/**
 * Fixtures, the stub generator, and the test-side reader.
 *
 * The browser model itself lives in `browser.mjs` and is shared with
 * `scripts/live-check.mjs`, which used to carry a drifting copy of it.
 */

import { isConcealed } from "../src/chaff/concealment.js";
import { type Document, parseDocument } from "../src/parser/dom.js";
import type { CarrierRenderer } from "../src/types.js";
import { createReader } from "./browser.mjs";

const reader = createReader(isConcealed);

/** What a person reads: painted text, in painted order, whitespace collapsed. */
export function readingText(html: string | Document): string {
  return reader.readingText(typeof html === "string" ? parseDocument(html) : html);
}

/**
 * The original as HEO will render it, minus what it draws.
 *
 * Two elements are dropped. A `heo-protect` becomes a carrier, which paints ink
 * and holds no text, so no text-level model can read it — which is why C2
 * stopped comparing rendered text and C3's pixel diff took over. A `heo-chaff`
 * holds prose that a browser shows in the *untransformed* source and that HEO
 * conceals, so it is not part of what a reader gets either.
 *
 * The honest comparison for invariant 1 is therefore against the page with both
 * removed: everything else must read identically, and the carriers are asserted
 * separately.
 */
export function asRendered(html: string): Document {
  const document = parseDocument(html);
  const visit = (node: { childNodes?: unknown[] }): void => {
    const children = node.childNodes as { tagName?: string; childNodes?: unknown[] }[] | undefined;
    if (children === undefined) return;
    for (let index = children.length - 1; index >= 0; index--) {
      const child = children[index] as { tagName?: string };
      if (child.tagName === "heo-protect" || child.tagName === "heo-chaff")
        children.splice(index, 1);
      else visit(child as { childNodes?: unknown[] });
    }
  };
  visit(document as unknown as { childNodes?: unknown[] });
  return document;
}

/**
 * A stub generator, and deliberately so.
 *
 * What the engine owns is where a carrier goes, what is left behind, and what
 * happens when one cannot be drawn — none of which needs a real font, and all of
 * which is testable without a Rust toolchain in the tree that runs it. Whether
 * the outlines actually land on the baseline is a rendering question, and it is
 * answered against the real generator and a real browser in
 * `benchmark/compat/carrier.ts`.
 *
 * Metrics are shaped like a face at 1000 units per em. The advance is a function
 * of the text so that a wrong substitution shows up as a wrong width, and the
 * seed is echoed into the markup so that a test can see that carriers are seeded
 * independently rather than all drawn the same. The requested weight is echoed
 * too, because drawing the default instance whatever the page asked for is a
 * defect that leaves no other trace.
 */
export const stubRenderer: CarrierRenderer = {
  render(text, params, seed) {
    // Anything outside printable ASCII stands for "no configured face has an
    // outline for this". A host with a fallback face would have tried it
    // already; null means nothing could draw the run.
    if (/[^\x20-\x7e]/u.test(text)) return null;
    const advance = Math.round(text.length * params.sizePx * 6);
    const ascent = Math.round(params.sizePx * 8);
    const descent = -Math.round(params.sizePx * 2);
    return {
      advance,
      ascent,
      descent,
      svg:
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${-ascent} ${advance} ` +
        `${ascent - descent}" width="${advance / 10}" height="${(ascent - descent) / 10}" ` +
        `fill="currentColor" data-seed="${seed}" ` +
        `data-wght="${params.variations.wght ?? "default"}"><path d="m0 0l10 10z"/></svg>`,
    };
  },
};

/** The configuration a publisher who installed the toolkit actually gets. */
export const CONFIG = {
  seed: "test-seed",
  carrier: { renderer: stubRenderer, fontSizePx: 16 },
} as const;

/**
 * The figures this page carries, as an extractor would look for them. Every one
 * of them sits inside a `heo-protect`.
 */
export const FIGURES = ["$4.2M", "$3.1M", "18.4%", "$12.5M", "7.2%", "3.5%"];

/**
 * A publisher page with its own figures marked.
 *
 * Three elements and nothing else: `heo-protect` around a value, `heo-shuffle`
 * around a clause worth permuting, `heo-chaff` wherever a noise node belongs.
 * The page deliberately mixes a mark inside a shuffle with marks outside one,
 * because those are the two rungs and they compose.
 */
export const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Results</title></head>
<body>
<p id="outside">Untouched prose that sits outside every marked element.</p>
<section>
  <p><heo-shuffle><heo-protect alt='["Group revenue reached $3.6M","Group revenue reached $5.1M"]'>Group revenue reached $4.2M</heo-protect> in the second quarter,</heo-shuffle> <heo-protect alt='["up from $2.7M"]'>up from $3.1M</heo-protect> a year
  earlier. <heo-protect>Operating margin improved to 18.4%</heo-protect> and the board approved <heo-protect alt='["a further $9.4M of capital"]'>a further $12.5M of capital</heo-protect> expenditure for the 2027 financial year.</p>
  <p>The industrial segment <heo-protect>did not meet its target</heo-protect>: <heo-shuffle><heo-protect alt='["intake fell 4.6%"]'>intake fell 7.2%</heo-protect> against a plan</heo-shuffle> <heo-protect>assuming 3.5% growth</heo-protect>, and no revision is <heo-protect>expected before 14 September 2026</heo-protect>.</p>
  <heo-chaff>Regional performance was broadly in line with the prior period.</heo-chaff>
  <heo-chaff>Capital expenditure remained within the approved envelope.</heo-chaff>
  <heo-chaff options='["The board reviewed the hedging policy during the period.","Working capital absorbed a further amount, largely timing."]'></heo-chaff>
  <heo-chaff options='["The refinancing completed without drawing on the revolving facility.","Headcount in the services segment was broadly flat."]'></heo-chaff>
  <heo-chaff>Currency movements were immaterial at the group level.</heo-chaff>
  <heo-chaff>Segment margins tracked slightly ahead of the internal plan.</heo-chaff>
  <heo-chaff>The audit committee met twice during the reporting period.</heo-chaff>
  <heo-chaff>Supplier terms were renegotiated across the industrial base.</heo-chaff>
  <pre><code>margin = (revenue - cost) / revenue</code></pre>
  <form><input name="email" placeholder="you@example.com"><button>Go</button></form>
</section>
</body></html>`;

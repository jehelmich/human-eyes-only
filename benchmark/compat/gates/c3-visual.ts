/**
 * C3 — visual fidelity.
 *
 * The gate the project's central invariant now rests on. Invariant 1 says
 * human-visible content is authoritative, and carriers make rendered
 * `innerText` empty by construction, so the cheap mechanical check on that
 * invariant is gone and this replaced it.
 *
 * **The rule it encodes: reordering must not be visible.** Reordering is a
 * DOM-level cost mechanism; if it changes what the reader sees it has failed at
 * the only thing it was supposed to be free at. A visible difference is
 * acceptable only where a carrier has replaced text with a rendering of it.
 *
 * Three assertions per capture, and the first version of this gate had only the
 * last one, which was not enough. A pixel count cannot answer the question:
 * measured on this corpus, a chaff sentence painting in full view produced
 * 0.084% differing pixels and a sub-pixel glyph shift produced 0.349%. Any
 * threshold that admits the second admits the first.
 *
 * 1. **Page width.** Unchanged. Growing sideways is a horizontal scrollbar on a
 *    document that did not have one, which is not a reflow, it is a broken page.
 * 2. **Reading order**, from the browser's own `Range` geometry sorted into
 *    visual order. Every word the original rendered must appear in the
 *    transformed page in the same sequence. Chaff adds entries, so this is a
 *    subsequence test rather than an equality one — and an entry appearing in
 *    the wrong place still fails it.
 * 3. **Ink**, the count of non-background pixels. This catches something new
 *    painting, or something ceasing to. It separates cleanly where the raw
 *    ratio does not: the concealment defect that put a fabricated sentence on
 *    the page measured **+114% ink** against under 0.6% for every case here
 *    that only moved.
 *
 * Page height, the worst horizontal word displacement and the raw pixel ratio
 * are **reported and not gated**. They are how a rewrap shows up in the report
 * without being called a defect, and how a regression in one of them stays
 * visible. The pixel ratio in particular cannot distinguish anything on its
 * own: a chaff sentence in full view measured 0.084% of pixels and a sub-pixel
 * glyph shift measured 0.349%.
 *
 * Concealment is not checked here. Whether a chaff node costs layout is a
 * property of eleven declarations, not of twenty-five documents, and it is
 * asserted directly — see `compat/concealment.ts`.
 *
 * **Carriers are not checked here either**, and cannot be. A carrier is drawn
 * from the publisher's own font file and a corpus document has none, so a
 * carrier run over the corpus would compare the browser's fallback face against
 * whatever the generator was given. `compat/carrier.ts` embeds one font and
 * hands the generator the same bytes. Reading order is why this matters here:
 * the words a carrier replaced leave no text node behind, so they would read as
 * missing to `firstOutOfOrder` rather than as drawn. Replaced boxes do enter the
 * stream — a publisher `<svg>` collects the same way on both sides — but nothing
 * in this gate maps a vanished word onto the carrier standing in its place.
 */

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import type { Capture, WordBox } from "../../runner/render.ts";
import type { Gate, GateResult, RenderedSubject, Subject, Violation } from "../../runner/types.ts";

/**
 * Three orders of magnitude below the defect it exists to catch and an order
 * above the largest sub-pixel case measured. Tighten it when the corpus has
 * real pages in it; never raise it to accommodate a technique.
 */
const MAX_INK_DELTA = 0.02;

/** Non-background pixels. Threshold chosen to count antialiased glyph edges. */
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
 * Visual reading order: top to bottom, then along the line in its own direction.
 * This is the order a person reads in and the order `innerText` does not follow,
 * which is the whole of what reordering exploits.
 *
 * The direction term is not a nicety. Sorting every line left to right reports
 * a right-to-left paragraph backwards, and comparing two pages that are both
 * backwards still fails the moment one word's box moves a fraction across
 * another's — which is how the Arabic document first appeared to have lost its
 * reading order while rendering pixel-identically.
 */
function readingOrder(words: WordBox[]): WordBox[] {
  if (words.length === 0) return [];

  // Lines are clustered rather than bucketed on an exact `y`. A word inside an
  // inline flex container sits a fraction of a pixel off its neighbours' box
  // top, and bucketing on the rounded value put it on a line of its own — which
  // is how the Arabic document appeared to lose its reading order while
  // rendering to within 0.02 px of the original.
  const heights = words.map((word) => word.height).sort((a, b) => a - b);
  const tolerance = Math.max(2, (heights[Math.floor(heights.length / 2)] as number) / 2);

  const sorted = [...words].sort((a, b) => a.y - b.y);
  const lines: WordBox[][] = [];
  let current: WordBox[] = [];
  let anchor = Number.NEGATIVE_INFINITY;

  for (const word of sorted) {
    if (word.y - anchor > tolerance) {
      if (current.length > 0) lines.push(current);
      current = [];
      anchor = word.y;
    }
    current.push(word);
  }
  if (current.length > 0) lines.push(current);

  const order: WordBox[] = [];
  for (const line of lines) {
    const rtl = line.filter((word) => word.dir === "rtl").length * 2 > line.length;
    line.sort((a, b) => (rtl ? b.x - a.x : a.x - b.x));
    for (const word of line) order.push(word);
  }
  return order;
}

/**
 * Whether two boxes are painted with no gap between them, so that a reader sees
 * one run of glyphs rather than two words.
 *
 * Words are collected per text node, so a text node boundary splits a rendered
 * word: `…50 seats` followed by a `.` in a separate node is two entries where
 * the page paints one. HEO removes the publisher's elements and the text nodes
 * on either side fuse, which changes nothing a reader sees and everything about
 * where that boundary falls. This is what lets the comparison below see through
 * it without seeing through anything else.
 */
function abuts(left: WordBox, right: WordBox): boolean {
  if (Math.abs(left.y - right.y) > 1) return false;
  if (left.dir === "rtl") return Math.abs(left.x - (right.x + right.width)) < 0.5;
  return Math.abs(right.x - (left.x + left.width)) < 0.5;
}

/**
 * Whether every word the original rendered still appears, in order. Chaff adds
 * entries to the transformed page, so this is a subsequence test; a word that
 * has moved relative to its neighbours breaks it anyway.
 */
function firstOutOfOrder(before: WordBox[], after: WordBox[]): string | null {
  const texts = after.map((word) => word.text);
  let cursor = 0;

  for (let index = 0; index < before.length; index++) {
    // Words the original painted with no gap between them may arrive as one
    // token, and only those: the run has to be contiguous in the *input*, so a
    // transformation that deleted a real space still fails here.
    let width = 1;
    let found = -1;
    let token = (before[index] as WordBox).text;
    while (found === -1) {
      found = texts.indexOf(token, cursor);
      if (found !== -1) break;
      const next = before[index + width];
      if (next === undefined || !abuts(before[index + width - 1] as WordBox, next)) break;
      token += next.text;
      width++;
    }
    if (found === -1) return (before[index] as WordBox).text;
    cursor = found + 1;
    index += width - 1;
  }
  return null;
}

/** How far a word moved horizontally, for the report. Not a gate. */
function worstShiftOf(before: WordBox[], after: WordBox[]): number {
  const byText = new Map<string, WordBox[]>();
  for (const word of after) {
    const bucket = byText.get(word.text);
    if (bucket === undefined) byText.set(word.text, [word]);
    else bucket.push(word);
  }
  let worst = 0;
  for (const word of before) {
    const candidates = byText.get(word.text);
    if (candidates === undefined || candidates.length === 0) continue;
    let best = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) best = Math.min(best, Math.abs(candidate.x - word.x));
    if (Number.isFinite(best)) worst = Math.max(worst, best);
  }
  return worst;
}

export const c3Visual: Gate = {
  id: "C3",
  name: "visual fidelity",
  absolute: true,

  check(subject: Subject, rendered: RenderedSubject | null): GateResult {
    const violations: Violation[] = [];
    if (rendered === null || subject.refusal !== null) {
      return { gate: "C3", passed: true, violations };
    }

    let worstShift = 0;
    for (const [key, before] of Object.entries(rendered.input.layout)) {
      const after = rendered.output.layout[key];
      if (after === undefined) continue;

      const missing = firstOutOfOrder(readingOrder(before), readingOrder(after));
      if (missing !== null) {
        violations.push({
          gate: "C3",
          detail: `${key}: ${JSON.stringify(missing)} is missing or out of reading order`,
        });
      }
      worstShift = Math.max(worstShift, worstShiftOf(before, after));
    }

    let worstRatio = 0;
    let worstInk = 0;
    let worstHeightDelta = 0;
    for (const before of rendered.input.captures) {
      const after = rendered.output.captures.find((capture: Capture) => capture.key === before.key);
      if (after === undefined) {
        violations.push({ gate: "C3", detail: `${before.key}: no matching render` });
        continue;
      }

      const left = PNG.sync.read(before.png);
      const right = PNG.sync.read(after.png);

      if (left.width !== right.width) {
        violations.push({
          gate: "C3",
          detail: `${before.key}: page width changed from ${left.width} to ${right.width}`,
        });
        continue;
      }

      worstHeightDelta = Math.max(worstHeightDelta, Math.abs(right.height - left.height));

      if (left.height === right.height) {
        const differing = pixelmatch(left.data, right.data, undefined, left.width, left.height, {
          threshold: 0.1,
        });
        worstRatio = Math.max(worstRatio, differing / (left.width * left.height));
      }

      const inkBefore = inkOf(left);
      const delta = inkBefore === 0 ? 0 : Math.abs(inkOf(right) - inkBefore) / inkBefore;
      worstInk = Math.max(worstInk, delta);

      if (delta > MAX_INK_DELTA) {
        violations.push({
          gate: "C3",
          detail: `${before.key}: painted ink changed by ${(delta * 100).toFixed(1)}%`,
        });
      }
    }

    return {
      gate: "C3",
      passed: violations.length === 0,
      violations,
      measures: {
        worstRatio,
        worstShiftPx: worstShift,
        worstInkDelta: worstInk,
        worstHeightDeltaPx: worstHeightDelta,
      },
    };
  },
};

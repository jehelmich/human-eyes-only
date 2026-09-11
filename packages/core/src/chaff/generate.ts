/**
 * Chaff.
 *
 * Chaff is not semantic protection. Its job is to make unusual DOM ambiguous, so
 * that "find the reordered runs" does not equal "find the protected values", and
 * so that the set an attacker must resolve scales with N+M rather than N.
 *
 * A node varies on two axes: its *concealment*, which is the question an
 * extractor must ask to notice it is hidden (`concealment.ts`), and its
 * *shape*, permuted like a real reordered run or a plain text node. Both are
 * drawn from the seeded stream.
 *
 * **Volume and placement are not settings.** Chaff says what the publisher
 * wrote in a `<heo-chaff>` element, and that element is where the node goes, so
 * how much there is and where it sits are both answered by the markup. Dilution
 * therefore scales with the publisher's appetite for writing prose. That is
 * worse than a generator and better than the honest description of what the
 * generator produced; the cost is accepted and recorded.
 *
 * Three constraints, and they are constraints rather than preferences: no
 * visible layout effect, no interactive elements, reproducible from a seed. And
 * none of this survives an attacker who renders the page and compares pixels —
 * only carriers change that.
 */

import type { RunStylesheet } from "../assembler/stylesheet.js";
import { type ChildNode, createElement, createTextNode } from "../parser/dom.js";
import type { ChaffMark } from "../parser/marks.js";
import type { Rng } from "../random/prng.js";
import type { RenderContext } from "../renderers/types.js";
import { type Concealment, pickConcealment } from "./concealment.js";

/** The node that replaces one `<heo-chaff>`. */
export function renderChaff(chaff: ChaffMark, ctx: RenderContext): ChildNode {
  // One drawn per load where the publisher wrote a list, so the same element
  // says something different on the next fetch and a multi-fetch intersection
  // does not separate the fabricated sentences by their stability (M14).
  const sentence = ctx.rng.pick(chaff.options);
  const words = sentence.split(/\s+/u).filter((word) => word !== "");
  const units = words.map((word, index) => (index === words.length - 1 ? word : `${word} `));

  const concealment = pickConcealment(ctx.rng);
  // Most chaff mimics a real reordered run. Some is a plain text node, so that
  // "has permuted children" does not identify the real ones either.
  return concealedContainer(ctx.rng, ctx.sheet, units, concealment, ctx.rng.bool(0.75));
}

/**
 * The container every fabricated node in the output is built from.
 *
 * Chaff and decoys share it deliberately rather than by coincidence. A decoy
 * shaped even slightly differently from chaff — one more class, a different
 * container tag, an attribute chaff does not carry — would be findable by that
 * difference, and the dilution chaff exists to provide would collapse to
 * nothing. One function is the only way to keep two node kinds identical as
 * both change.
 */
export function concealedContainer(
  rng: Rng,
  sheet: RunStylesheet,
  units: string[],
  concealment: Concealment,
  permuted = false,
): ChildNode {
  let domOrder: number[] = [];
  let children: ChildNode[];

  if (permuted && units.length > 1) {
    domOrder = rng.shuffle([...Array(units.length).keys()]);
    children = domOrder.map((visualIndex) =>
      createElement("span", {}, [createTextNode(units[visualIndex] as string)]),
    );
  } else {
    children = [createTextNode(units.join(""))];
  }

  // Concealment is a class, not a `style` attribute. Two things follow and both
  // are the point. A nonce can authorise the one `<style>` element it lives in,
  // so a strict CSP is no longer a refusal; and a chaff node is now shaped
  // exactly like a real reordered run — one opaque class pair, no `style`
  // attribute — so there is no attribute to filter on.
  const runClass = sheet.add(domOrder, concealment.declarations ?? "");

  const attrs: Record<string, string> = {
    class: `heo-g ${runClass}`,
    // Only where the concealment leaves the node in the accessibility tree.
    // Injecting invented text into a screen reader's output is a different
    // category of harm from making a page hard to scrape, and HEO accepts
    // losing assistive output rather than corrupting it — but `aria-hidden` is
    // also a default discard rule in trafilatura and Readability.js, so adding
    // it where it does nothing is a signature for free.
    ...(concealment.inAccessibilityTree ? { "aria-hidden": "true" } : {}),
    ...(concealment.attrs ?? {}),
  };

  return createElement("span", attrs, children);
}

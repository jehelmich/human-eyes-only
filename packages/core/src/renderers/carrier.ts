/**
 * Carriers, and the decoy that occupies the channel a carrier vacates.
 *
 * A carrier replaces a span with vector outlines of its own text: the reader
 * gets the value, the DOM does not get it at all. This is the project's only
 * **subtraction** primitive and the only mechanism that can satisfy the
 * property the rest of the design is written around — that the value is not in
 * the response. It is what `<heo-protect>` means, and it is the only thing it
 * means: there is no toggle that turns a mark into something weaker.
 *
 * Four choices worth knowing before changing anything here.
 *
 * **One SVG per word by default, spaces left as text nodes.** The per-word rule
 * is not decoration: an inline SVG is an atomic replaced box, so a multi-word
 * carrier could not break across lines and would reproduce the line-breaking
 * regression reordering already has (ROADMAP.md, M7). Per word, the line breaks
 * at the spaces exactly as it did before. It leaks word lengths, which was
 * accepted from the start.
 *
 * `<heo-protect unit="phrase">` draws the whole mark as one box instead, which
 * publishes neither the word boundaries nor the word count and lays out wrong
 * the moment the mark has to wrap. It is the publisher's trade to make against
 * their own column width, and nothing here can check it.
 *
 * **Inline SVG with `fill="currentColor"`, never a CSS mask**. A mask over
 * a `data:` URL is an image fetch governed by `img-src`, which is the directive
 * strict policies forbid and the whole reason vector delivery was made
 * mandatory. Inline markup engages no directive at all.
 *
 * **The baseline shift is a class, never a `style` attribute**. An
 * inline SVG's baseline is its bottom margin edge, so the glyphs sit
 * `-descent` above where they belong and the element has to be pushed down by
 * exactly its own descent. Every carrier on a page at one size shares one class,
 * because ascent and descent are properties of the face and the size rather than
 * of the run.
 *
 * **A word the publisher's font cannot draw is drawn by another face**, and only
 * a word *no* face can draw reaches `onUnprotectable`. Invariant 7 forbids a
 * span failing back to readable text, which is the bypass a scraper triggers by
 * declining to fetch an asset; it does not forbid a different face, because a
 * carrier in the wrong font still takes the value out of the DOM and is only
 * cosmetically imperfect. The host owns the fallback chain and flags what it
 * used; this module counts it.
 */

import { pickSilentConcealment } from "../chaff/concealment.js";
import { concealedContainer } from "../chaff/generate.js";
import { carrierSizeMissing, carrierUnavailable, carrierUndrawable } from "../guards/carrier.js";
import { HeoCoverageError } from "../guards/coverage.js";
import { type ChildNode, createTextNode, type Element, fragmentNodes } from "../parser/dom.js";
import type { Mark } from "../parser/marks.js";
import type { RenderContext } from "./types.js";

/**
 * Formats tenths of a pixel as a CSS length, the same way the generator's
 * `tenths_to_px` does. Integers on both sides of the boundary, because
 * float-to-decimal formatting differs between Rust and JavaScript and invariant
 * 5 is a byte-identity claim.
 */
export function tenthsToPx(tenths: number): string {
  const whole = Math.trunc(tenths / 10);
  const frac = Math.abs(tenths % 10);
  if (frac === 0) return String(whole);
  if (tenths < 0 && whole === 0) return `-0.${frac}`;
  return `${whole}.${frac}`;
}

/** Words and the whitespace between them, in order, keeping both. */
function splitOnWhitespace(text: string): string[] {
  return text.split(/(\s+)/u).filter((part) => part !== "");
}

/**
 * Draws one word.
 *
 * Returns the `<svg>` element, or — when no configured face has an outline for
 * the word and the publisher chose `onUnprotectable: "warn"` — the word itself
 * as text, counted so `stats.unprotected` reports it. Under the default
 * `refuse` it throws, as every uncoverable span does.
 *
 * The class and `aria-hidden` are shuffled in among the generator's own
 * attributes rather than appended. Attribute order is one of the generator's
 * randomization axes, and two attributes always arriving last would be a fixed
 * shape at the end of every carrier.
 */
function carrierNode(word: string, mark: Mark, ctx: RenderContext): ChildNode {
  // Unreachable through `transformHtml`, which refuses a page with marks and no
  // generator before it gets here. Kept because the alternative to a refusal on
  // this path is text (invariant 7), and that must not become reachable by
  // accident.
  const source = ctx.carrier;
  if (source === null) throw carrierUnavailable(1);
  // Same shape and the same reason: a size nobody set is a refusal, never a
  // guess. `transformHtml` refuses such a configuration before it gets here.
  const sizePx = mark.sizePx ?? ctx.fontSizePx;
  if (sizePx === null) throw carrierSizeMissing(1);

  const glyphs = source.next(word, sizePx);
  const nodes = glyphs === null ? [] : fragmentNodes(glyphs.svg);
  const element = nodes.find(
    (node): node is Element => "tagName" in node && node.nodeName === "svg",
  );
  if (glyphs === null || element === undefined) {
    // Thrown one span at a time rather than collected with the rest: whether a
    // face can draw a run is only known once the generator has been asked, and
    // by then the document is half rewritten.
    const undrawable = carrierUndrawable(word);
    if (ctx.onUnprotectable === "refuse") throw new HeoCoverageError([undrawable]);
    ctx.counts.undrawn++;
    return createTextNode(word);
  }

  // `display:inline` is not redundant. A publisher reset of `svg{display:block}`
  // is common enough that inheriting it would put every carrier on its own
  // line, and a class beats a type selector.
  const declarations = `display:inline;vertical-align:${tenthsToPx(glyphs.descent)}px`;
  const runClass = ctx.sheet.add([], declarations);

  element.attrs.push({ name: "class", value: runClass });
  // Silence rather than a nameless graphic. Protected spans are unavailable to
  // assistive technology by design, and announcing an unlabelled image where a
  // figure used to be is worse than announcing nothing.
  element.attrs.push({ name: "aria-hidden", value: "true" });
  if (ctx.debug) {
    element.attrs.push({ name: "data-heo-mark-id", value: mark.id });
    if (glyphs.fallback === true) {
      element.attrs.push({ name: "data-heo-carrier-fallback", value: "1" });
    }
  }
  ctx.rng.shuffle(element.attrs);
  return element;
}

/**
 * One entry per carrier unit: the drawn word, and whether whitespace followed
 * it inside the mark.
 *
 * This is the shape `heo-shuffle` needs, because a permutation moves units past
 * each other and a carrier is one of them. With `unit="phrase"` the whole mark
 * is a single unit, which is the same trade it makes against layout.
 *
 * With no generator configured the units are the words themselves. That path
 * exists only under `onUnprotectable: "warn"`, and it is what lets the
 * compatibility corpus exercise reordering on pages that have no font.
 */
export function markUnits(
  mark: Mark,
  ctx: RenderContext,
): { nodes: ChildNode[]; space: boolean }[] {
  if (mark.unit === "phrase") {
    const phrase = mark.text.replace(/\s+/gu, " ");
    const nodes: ChildNode[] =
      ctx.carrier === null ? [createTextNode(phrase)] : [carrierNode(phrase, mark, ctx)];
    return [{ nodes, space: false }];
  }

  const parts = splitOnWhitespace(mark.text);
  const units: { nodes: ChildNode[]; space: boolean }[] = [];
  for (const part of parts) {
    if (/^\s+$/u.test(part)) {
      const last = units[units.length - 1];
      if (last !== undefined) last.space = true;
      continue;
    }
    units.push({
      nodes: [ctx.carrier === null ? createTextNode(part) : carrierNode(part, mark, ctx)],
      space: false,
    });
  }
  return units;
}

/**
 * The nodes that replace a standalone `<heo-protect>`.
 *
 * The whitespace the publisher wrote around and inside the mark is preserved
 * verbatim, because the mark's element is what leaves the document and the
 * surrounding text nodes are not HEO's to normalise.
 */
export function renderMark(mark: Mark, ctx: RenderContext): ChildNode[] {
  const nodes: ChildNode[] = [];
  const decoy = decoyNode(mark, ctx);
  // In front of the carrier, so an extractor reading DOM text in document order
  // finds the fabricated value in the position the real one held.
  if (decoy !== null) nodes.push(decoy);

  if (mark.unit === "phrase") {
    const lead = mark.raw.slice(0, mark.raw.length - mark.raw.trimStart().length);
    const tail = mark.raw.slice(mark.raw.trimEnd().length);
    if (lead !== "") nodes.push(createTextNode(lead));
    nodes.push(carrierNode(mark.text.replace(/\s+/gu, " "), mark, ctx));
    if (tail !== "") nodes.push(createTextNode(tail));
    return nodes;
  }

  for (const part of splitOnWhitespace(mark.raw)) {
    if (/^\s+$/u.test(part)) nodes.push(createTextNode(part));
    else nodes.push(carrierNode(part, mark, ctx));
  }
  return nodes;
}

/**
 * A replacement value for the mark, or null when the publisher supplied none.
 *
 * Every candidate here was written by the publisher. HEO used to assemble one
 * from a magnitude-preserving arithmetic perturbation and words lifted off the
 * page; that produced something distributionally convincing and semantically
 * nothing, and the ceiling could not be raised from inside the middleware. So
 * the answer where nothing was supplied is no decoy rather than an invented
 * one: a carrier with an empty text channel is missing data, which is worse for
 * an extractor than being told nothing at all and is honest about what HEO
 * knows.
 */
export function decoyFor(mark: Mark, ctx: RenderContext): string | null {
  for (const candidate of ctx.rng.shuffle([...mark.substitutes])) {
    const trimmed = candidate.trim();
    if (trimmed === "" || trimmed === mark.text) continue;
    // A decoy that happens to be another protected value republishes it in a
    // channel nothing else inspects, which is the one place a real figure must
    // never reappear, and it is the same rule chaff obeys.
    if (ctx.forbidden.has(trimmed)) continue;
    return trimmed;
  }
  return null;
}

/**
 * The decoy node for a mark, or null.
 *
 * **Shaped exactly like a chaff node.** Same `heo-g` container, same two opaque
 * classes, same concealment vocabulary, built by the same function. If it were
 * shaped differently, "which concealed span is the decoy" would be a selector,
 * and the N+M dilution chaff exists to provide would collapse to N.
 *
 * **Its concealment is drawn from the kinds already outside the accessibility
 * tree.** Chaff picks from all eleven and adds `aria-hidden` where it needs to;
 * a decoy cannot, because `aria-hidden` is a default discard rule in
 * trafilatura and Readability.js, and a decoy those two delete is a decoy that
 * does nothing. Restricting the pool gets the same silence without the
 * attribute. The cost is a smaller pool than chaff's, recorded rather than
 * hidden.
 */
export function decoyNode(mark: Mark, ctx: RenderContext): ChildNode | null {
  // A carrier is what vacates the text channel. With no generator there is
  // nothing to stand in for, and a decoy beside the true value would be an
  // inconsistency the publisher did not ask for.
  if (ctx.carrier === null) return null;
  const decoy = decoyFor(mark, ctx);
  if (decoy === null) return null;
  ctx.counts.decoys++;
  return concealedContainer(ctx.rng, ctx.sheet, [decoy], pickSilentConcealment(ctx.rng));
}

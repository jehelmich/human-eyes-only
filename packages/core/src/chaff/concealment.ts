/**
 * Concealment kinds — five, one per question an extractor has to ask.
 *
 * - **attribute** — is it concealed without any CSS at all? (`hiddenAttr`)
 * - **render tree** — is the box in the rendered document? (`undisplayed`)
 * - **skipped contents** — is the box there but its contents not rendered?
 *   (`inert`)
 * - **paint** — is the box painted? (`invisible`)
 * - **clip** — is it painted, and clipped away? (`clipped`)
 *
 * There were eleven, spread across the same axes with two to three spellings
 * each. The spread was argued before the ladder existed, and against the ladder
 * most of it does nothing: chaff is rung one, whose job is to survive a raw
 * tag-strip, and a tag-stripper evaluates no CSS at all — so at chaff's own
 * rung every kind is the same kind. One rung up, `aria-hidden` is a default
 * discard rule in trafilatura and Readability.js, and HEO adds it wherever the
 * kind leaves the node in the accessibility tree, so the five kinds that needed
 * it were also one kind there.
 *
 * What did not survive the collapse, and is why this is five rather than four:
 * `aria-hidden` must not partition `.heo-g` containers into real and
 * fabricated. A permuted run always carries it (reading a permutation aloud is
 * worse than silence) and a decoy never can, so chaff is the only thing that
 * can sit on both sides — and it can only do that while at least one
 * concealment leaves the node in the accessibility tree. `clipped` is that one.
 * It is also the `.sr-only` idiom real pages use to expose text to screen
 * readers, so "drop clipped nodes" is not a rule an extractor gets for free.
 *
 * The four silent kinds are the decoy pool: a decoy has to be invisible to a
 * person and legible to a machine, and `aria-hidden` would have the two
 * extractors most likely to read it delete the wrong answer it exists to
 * supply. Chaff draws from all five, which is what stops the concealment itself
 * saying which concealed span is the decoy.
 *
 * The declaration-carrying kinds are delivered as a class rather than a `style`
 * attribute. That is about where the declaration is written rather than what
 * the browser does with it, so the axes are unaffected — and one is sharper for
 * it, because the cascade now has to be resolved before four of the five can be
 * answered at all.
 *
 * None of this survives an attacker who renders the page and compares pixels.
 * That is what carriers are for.
 */

import type { Rng } from "../random/prng.js";

export type ConcealmentKind = "hiddenAttr" | "undisplayed" | "inert" | "invisible" | "clipped";

export interface Concealment {
  kind: ConcealmentKind;
  /**
   * CSS declarations for the container, or null when the kind needs none.
   *
   * These are emitted into the per-load stylesheet under an opaque class, never
   * as a `style` attribute. A nonce cannot authorise a `style` attribute under
   * a strict CSP, and Readability.js reads the attribute rather than the
   * cascade, so the attribute was both what forced a refusal and what made a
   * hidden node *less* ingested than a class-hidden one.
   */
  declarations: string | null;
  /** Attributes carrying the concealment, for kinds that are not a declaration. */
  attrs?: Record<string, string>;
  /**
   * Whether the concealment leaves the node in the accessibility tree.
   *
   * `aria-hidden` is added only where this is true. Where it is false the node
   * is already silent, and the attribute would not be free: it is a default
   * discard rule in trafilatura and Readability.js, so adding it where it does
   * nothing deletes the node from the two extractors chaff most wants to
   * dilute.
   */
  inAccessibilityTree: boolean;
}

/**
 * The 1 px box on three of these is not decoration. A chaff container carries
 * `heo-g` so that it is not separable from a real run by class, and `heo-g` is
 * an inline flex box; left unconstrained, an absolutely positioned one lays out
 * at the width of its own sentence and grows the document's scroll width.
 * Measured on a 1280 px viewport: 1583 px. Found by C3's pixel diff, not by
 * anything in the engine — `isConcealed()` models what the declarations mean
 * and agreed with itself throughout.
 */
const CONCEALMENTS: Concealment[] = [
  // Concealed by attribute, so an extractor that has resolved the stylesheet
  // still has to ask a second, different question — and the only kind whose
  // concealment is legible with no CSS at all.
  {
    kind: "hiddenAttr",
    declarations: null,
    attrs: { hidden: "" },
    inAccessibilityTree: false,
  },
  // Looks like a collapsed panel or an unselected tab — the kind of hidden
  // content real pages are full of, which is what stops "drop hidden nodes"
  // being a free rule for an extractor to apply everywhere else.
  {
    kind: "undisplayed",
    declarations: "display:none",
    inAccessibilityTree: false,
  },
  // The box exists and its contents are not rendered, which is a different
  // question from `display` and the one a naive computed-style filter misses.
  // Unrelated to the HTML `inert` attribute, which is rejected on its support
  // floor — ignored on Chrome before 102, Safari before 15.5 and Firefox before
  // 112, where a screen reader would then read the chaff aloud.
  // `content-visibility` has its own floor: an engine that does not implement
  // it leaves a clipped 1 px box that is still in the accessibility tree.
  {
    kind: "inert",
    declarations:
      "content-visibility:hidden;position:absolute;width:1px;height:1px;overflow:hidden",
    inAccessibilityTree: false,
  },
  {
    kind: "invisible",
    declarations: "visibility:hidden;position:absolute;width:1px;height:1px;overflow:hidden",
    inAccessibilityTree: false,
  },
  // The one kind a computed-style check calls visible: nothing is hiding it,
  // the clip is. It is also `.sr-only`, so it carries `aria-hidden` and is the
  // reason that attribute does not separate real runs from chaff.
  {
    kind: "clipped",
    declarations: "position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)",
    inAccessibilityTree: true,
  },
];

/** Chaff draws from every kind. Its job is to be hard to separate. */
export function pickConcealment(rng: Rng): Concealment {
  return rng.pick(CONCEALMENTS);
}

/**
 * The concealments that leave a node out of the accessibility tree by
 * themselves, without `aria-hidden`. This is the pool a decoy draws from, and
 * it is four of the five.
 */
export function pickSilentConcealment(rng: Rng): Concealment {
  return rng.pick(SILENT);
}

const SILENT: readonly Concealment[] = CONCEALMENTS.filter(
  (concealment) => !concealment.inAccessibilityTree,
);

export const ALL_CONCEALMENTS: readonly Concealment[] = CONCEALMENTS;

/**
 * Whether a set of resolved declarations carries one of the concealments above.
 *
 * The caller supplies the declarations that reach the node, which means looking
 * them up in the injected stylesheet by class rather than reading a `style`
 * attribute. That is more work for the caller and it is the honest amount of
 * work: it is what a browser does, and what an extractor now has to.
 *
 * Exported because the test oracle and the live check both need to model what a
 * browser paints, and a second hand-written list of these declarations would
 * drift from this one silently. It is not a substitute for checking against a
 * real browser — a concealment that does not work is a bug this predicate would
 * happily agree with. That check is the compat gate's pixel diff.
 */
export function isConcealed(node: { declarations?: string | null; hidden?: boolean }): boolean {
  if (node.hidden === true) return true;
  const declarations = node.declarations;
  if (declarations === null || declarations === undefined) return false;
  return ALL_CONCEALMENTS.some(
    (concealment) =>
      concealment.declarations !== null && declarations.includes(concealment.declarations),
  );
}

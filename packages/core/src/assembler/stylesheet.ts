/**
 * Per-load container stylesheet.
 *
 * The permutation used to ship as `style="--p:3"` on every unit, which made
 * recovering it a sort over an attribute — measured at 0.31 ms per page against
 * a 13 ms transform, a forty-fold asymmetry in the attacker's favour, and it
 * retired the only justification reordering had left.
 *
 * The order values now live in the document stylesheet, selected by an opaque
 * per-load class and `nth-child`, so the units themselves carry nothing. This
 * does not make the permutation secret and nothing can: the content ships and
 * the rule set is a table, and a table is dumpable. What it changes is the tier
 * of tool required — an attacker must parse CSS and resolve `nth-child` against
 * the DOM rather than read an attribute with a regex. Reordering is a cost
 * mechanism; this is the cost.
 *
 * **Chaff concealment lives here too**. It was a `style` attribute, which
 * a nonce cannot authorise under a strict CSP and which Readability.js reads
 * directly — so the attribute was both the thing that forced a refusal and the
 * one channel that made a hidden node *less* ingested than a class-hidden one.
 *
 * ## Two classes, not one
 *
 * Every `heo-g` container carries exactly two opaque classes and no `style`
 * attribute, whether it is a real reordered run or chaff. The uniformity is the
 * point: if chaff alone carried an attribute, or one more class, "has a `style`
 * attribute" or "has three classes" would be a one-selector filter separating
 * the fabricated nodes from the real ones, and the N+M dilution argument would
 * collapse to N.
 *
 * The two are keyed independently, which is what keeps the sheet small and is
 * also the shape the `style` attribute already had:
 *
 * - a **shape** class holds the permutation, and is shared by every container
 * with that permutation — real run and chaff alike. That sharing is
 * load-bearing: it is the reason class identity does not partition the real
 * containers from the fabricated ones.
 * - a **presentation** class holds the concealment declarations, and is shared
 *   by every container concealed the same way.
 *
 * Keying the pair together instead — one class per (permutation, concealment) —
 * was measured and rejected, and it is worth knowing that it was rejected
 * *against* the weight argument rather than with it. Measured over the corpus,
 * 380 renders on 140,140 input bytes: the pair keying emits 604,105 bytes and
 * this split emits 613,230, so the split costs 24 bytes per render more. Both
 * are lighter than the `style` attribute they replace, which emitted 629,068.
 *
 * What the split buys for those 24 bytes is that a class can belong to a real
 * run and to a chaff node at once. Under the pair keying it cannot, for any of
 * the nine declaration-carrying concealments, so class identity partitions the
 * real containers from the fabricated ones given one labelled example and no
 * CSS parser at all — which is exactly the separation that sharing exists to
 * deny. A regression test asserts the sharing and fails under the pair keying.
 *
 * One class per kind per load rather than one per node, for the same reason and
 * with nothing lost: an attacker who can resolve `.ab3{display:none}` to a node
 * resolves it the same way whether one node or twenty carry the class, and an
 * attacker who cannot parse CSS gains nothing from either shape.
 *
 * A container that needs no rules on one axis — a real run has no concealment, a
 * plain chaff node has no permutation — gets a benign class carrying `--n`
 * rather than no class. `--n` is the custom property that used to sit in the
 * `style` attribute for the same purpose, in its new home. What it does not fix,
 * and did not fix before, is that the benign presentation class is shared by
 * every real run: a frequency count over class attributes still leans real. That
 * is unchanged by this decision rather than introduced by it.
 *
 * Class names are drawn from the seeded stream, so they are stable within a
 * load and different across loads. A stable class per concealment kind would be
 * a rule an attacker writes once and reuses forever, which is the defect `--p`
 * had.
 */

import type { Rng } from "../random/prng.js";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

export interface RunStylesheet {
  /**
   * Records the rules for one container and returns the classes that select it.
   *
   * `order[i]` is the CSS `order` of the i-th DOM child; an empty array is a
   * container with no permutation. `declarations` are the concealment's, empty
   * for a container that is not concealed.
   */
  add(order: number[], declarations: string): string;
  /** The accumulated rules, appended to the runtime stylesheet. */
  rules(): string;
  /** Distinct classes minted. */
  readonly size: number;
}

export function createRunStylesheet(rng: Rng): RunStylesheet {
  // A per-load prefix, so class names are not a stable fingerprint across loads
  // and cannot be matched by a rule an attacker wrote once.
  const prefix =
    (ALPHABET[rng.int(ALPHABET.length)] as string) + (ALPHABET[rng.int(ALPHABET.length)] as string);
  const parts: string[] = [];
  const shapes = new Map<string, string>();
  const presentations = new Map<string, string>();
  let counter = 0;

  const mint = (): string => {
    const name = `${prefix}${counter.toString(36)}`;
    counter++;
    return name;
  };

  const shapeClass = (order: number[]): string => {
    const signature = order.join(",");
    const existing = shapes.get(signature);
    if (existing !== undefined) return existing;

    const name = mint();
    shapes.set(signature, name);
    // Every class gets a declaration block, so that a container with nothing to
    // declare is not the one carrying a class that has none.
    parts.push(`.${name}{--n:${rng.int(1000)}}`);
    for (let index = 0; index < order.length; index++) {
      // `nth-child` rather than a class per unit: the unit elements then carry
      // no attribute at all, so there is nothing on them to key a filter on.
      parts.push(`.${name}>:nth-child(${index + 1}){order:${order[index]}}`);
    }
    return name;
  };

  const presentationClass = (declarations: string): string => {
    const existing = presentations.get(declarations);
    if (existing !== undefined) return existing;

    const name = mint();
    presentations.set(declarations, name);
    parts.push(`.${name}{--n:${rng.int(1000)}${declarations === "" ? "" : `;${declarations}`}}`);
    return name;
  };

  return {
    get size() {
      return counter;
    },
    add(order, declarations) {
      return `${shapeClass(order)} ${presentationClass(declarations)}`;
    },
    rules() {
      return parts.join("");
    },
  };
}

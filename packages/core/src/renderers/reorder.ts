/**
 * `heo-shuffle` — reordered DOM.
 *
 * Word units are emitted in one order and read in another; CSS `order` restores
 * the human reading order. A scraper must resolve the stylesheet rather than
 * trust document order.
 *
 * It does not hide the words and it is not claimed to. Reordering is a **cost**
 * mechanism, not a corruption one: a reader that inverts the permutation
 * recovers the true value, so what this buys is the tier of tool required and
 * nothing else. Carriers are what force vision.
 *
 * Because the value stays in the response, this is the mechanism the publisher
 * asks for by name. `<heo-shuffle>` permutes **its own content** rather than
 * modifying how a mark is protected: the element bounds the permutation, which
 * is the one job a container genuinely has, and a `<heo-protect>` inside it
 * contributes its carriers as units like any word. That is what makes the two
 * rungs compose on one span instead of competing for it.
 *
 * Word boundaries only. Character-level reordering is deferred: it breaks
 * shaping, kerning and hyphenation, and compatibility is a gate.
 */

import { type ChildNode, createElement, createTextNode, type Element } from "../parser/dom.js";
import type { ShuffleMark } from "../parser/marks.js";
import { decoyNode, markUnits } from "./carrier.js";
import type { RenderContext } from "./types.js";

/**
 * Below the minimum there is nothing to permute. The maximum is a typography
 * limit, not a protection one: an inline flex container cannot break across
 * lines, so a long run forces an early line break and an ugly ragged edge.
 */
export const MIN_UNITS = 3;
const MAX_UNITS = 5;

interface Unit {
  nodes: ChildNode[];
  /** Whether whitespace followed this unit in the publisher's source. */
  space: boolean;
}

/**
 * The shuffle's content as units, plus the whitespace that sits outside them.
 *
 * Whitespace is normalised to one space between units, which is what a browser
 * does to the original anyway, and is required rather than cosmetic: units
 * render under `white-space:pre` so that a trailing space is not dropped as
 * hanging whitespace, and under `pre` the source indentation an HTML author
 * never meant to be visible would render literally. Whitespace the publisher
 * wrote *before* the first unit and *after* the last is emitted outside the
 * container untouched, because it is not part of anything being permuted.
 */
function unitsOf(
  shuffle: ShuffleMark,
  ctx: RenderContext,
): {
  units: Unit[];
  lead: string;
  tail: string;
} {
  const units: Unit[] = [];
  let lead = "";
  let tail = "";

  const space = (): void => {
    const last = units[units.length - 1];
    if (last === undefined) lead = " ";
    else last.space = true;
  };

  for (const part of shuffle.parts) {
    if (part.kind === "text") {
      for (const token of part.value.split(/(\s+)/u)) {
        if (token === "") continue;
        if (/^\s+$/u.test(token)) space();
        else units.push({ nodes: [createTextNode(token)], space: false });
      }
      continue;
    }
    const drawn = markUnits(part.mark, ctx);
    const decoy = decoyNode(part.mark, ctx);
    const first = drawn[0];
    if (decoy !== null && first !== undefined) first.nodes.unshift(decoy);
    units.push(...drawn);
  }

  const last = units[units.length - 1];
  if (last?.space) {
    last.space = false;
    tail = " ";
  }
  return { units, lead, tail };
}

/**
 * A permutation with no fixed points, so every unit actually moves. A shuffle
 * that leaves half the run in place leaves half the run readable in source
 * order.
 */
function derangement(length: number, pick: (max: number) => number): number[] {
  const order = [...Array(length).keys()];
  for (let attempt = 0; attempt < 16; attempt++) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = pick(i + 1);
      const left = order[i] as number;
      order[i] = order[j] as number;
      order[j] = left;
    }
    if (order.every((value, index) => value !== index)) return order;
  }
  // Fall back to a rotation, which is a derangement for any length above one.
  return [...Array(length).keys()].map((index) => (index + 1) % length);
}

/**
 * One flex container over a run of units, permuted.
 *
 * The unit elements carry no attribute at all. `order` is keyed by an opaque
 * per-load class in the stylesheet, so recovering the permutation needs a CSS
 * parser rather than one regex over the markup.
 */
function container(units: Unit[], shuffleId: string, ctx: RenderContext): Element {
  const domOrder = derangement(units.length, (max) => ctx.rng.int(max));
  const children = domOrder.map((visualIndex) => {
    const unit = units[visualIndex] as Unit;
    const nodes = unit.space ? [...unit.nodes, createTextNode(" ")] : unit.nodes;
    return createElement("span", {}, nodes);
  });
  const runClass = ctx.sheet.add(domOrder, "");

  // No `style` attribute, on either this or a chaff container. Chaff's
  // concealment lives in the same stylesheet, so whatever attribute shape one
  // carries, the other carries.
  const attrs: Record<string, string> = {
    class: `heo-g ${runClass}`,
    // Silence rather than scrambled audio. Protected spans are unavailable to
    // screen readers by design; reading a permutation aloud would be worse than
    // reading nothing, and it also stops `aria-hidden` separating real
    // containers from chaff.
    "aria-hidden": "true",
  };
  if (ctx.debug) attrs["data-heo-shuffle-id"] = shuffleId;

  return createElement("span", attrs, children);
}

/**
 * The nodes that replace one `<heo-shuffle>`.
 *
 * A run longer than the renderer accepts is chunked into consecutive
 * containers rather than refused: refusing would publish the whole run, and the
 * chunks are even so that none falls below the minimum. The cost is adjacent
 * containers where the publisher wrote one.
 */
export function renderShuffle(shuffle: ShuffleMark, id: string, ctx: RenderContext): ChildNode[] {
  const { units, lead, tail } = unitsOf(shuffle, ctx);
  const nodes: ChildNode[] = [];
  if (lead !== "") nodes.push(createTextNode(lead));

  // Even chunks, so none falls below the minimum: `ceil(n / MAX)` containers
  // with the remainder spread one unit at a time. Taking MAX units until the
  // run runs out is what leaves a final chunk of one, which is not a
  // permutation at all.
  const chunks = Math.max(1, Math.ceil(units.length / MAX_UNITS));
  const base = Math.floor(units.length / chunks);
  const remainder = units.length % chunks;
  let cursor = 0;
  for (let chunk = 0; chunk < chunks; chunk++) {
    const size = base + (chunk < remainder ? 1 : 0);
    nodes.push(container(units.slice(cursor, cursor + size), id, ctx));
    cursor += size;
  }

  if (tail !== "") nodes.push(createTextNode(tail));
  return nodes;
}

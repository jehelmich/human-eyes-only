/**
 * Stage 5 - what a renderer is handed.
 *
 * There is no `Renderer` interface and no registry. Both existed to ask a
 * strategy whether it would take a span and then choose among the ones that
 * said yes; the publisher names the mechanism now, so the question has no
 * asker. What is left is one context, shared by the two mechanisms that draw
 * anything.
 */

import type { RunStylesheet } from "../assembler/stylesheet.js";
import type { UnprotectablePolicy } from "../config.js";
import type { CarrierSource } from "../guards/carrier.js";
import type { Rng } from "../random/prng.js";

export interface RenderContext {
  rng: Rng;
  /** Emits `data-heo-*` attributes. Production output must not carry them. */
  debug: boolean;
  /** Where a run's `order` values and a concealment's declarations go. */
  sheet: RunStylesheet;
  /**
   * The generator, or null when the host supplied none. A page with marks and
   * no generator is refused before reaching here, unless the publisher chose
   * `onUnprotectable: "warn"`.
   */
  carrier: CarrierSource | null;
  /**
   * The document's carrier type size in CSS pixels, which a mark's own `size`
   * overrides. Null only where every mark carries its own.
   */
  fontSizePx: number | null;
  /** Protected values, which a decoy and a chaff node must never republish. */
  forbidden: ReadonlySet<string>;
  /**
   * What to do about a word no configured face can draw.
   *
   * Discovered here rather than up front: whether a face has an outline for a
   * run is only known once the generator has been asked. It is the same
   * question `transformHtml` asks of every other uncoverable mark and it gets
   * the same answer, which is the publisher's.
   */
  onUnprotectable: UnprotectablePolicy;
  /**
   * Counters the renderers bump as they go. A decoy is emitted where a mark has
   * a usable substitute and suppressed where every candidate is another
   * protected value, so the number is a property of the run rather than of the
   * markup, and `transformHtml` cannot compute it up front. `undrawn` is the
   * same shape: a word nothing could draw, served as text under `warn`.
   */
  counts: { decoys: number; undrawn: number };
}

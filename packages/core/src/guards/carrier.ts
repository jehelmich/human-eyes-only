/**
 * The carrier source, and the refusals around it.
 *
 * One thing is fail-closed here and it is invariant 7 — *no plaintext fallback
 * path, ever*. A page carrying `<heo-protect>` with no generator configured is
 * a refusal rather than a quiet downgrade to text, because a downgrade produces
 * a page that looks protected and is not. That is a configuration fault, wrong
 * for every request, and the publisher sees it as a 500 on the first one.
 *
 * **A glyph the publisher's font cannot draw is not that failure**, and it used
 * to be treated as if it were. The host tries a fallback face first: a carrier
 * drawn in a different font is still a carrier, the value is still absent from
 * the DOM, and what is lost is that one word is set in the wrong face. Only
 * when nothing available can draw the run at all does it become a span HEO was
 * pointed at and could not take — which is `onUnprotectable`'s question, the
 * same one every other uncoverable mark asks, and the publisher's to answer.
 */

import { CARRIER_JITTER_PX } from "../config.js";
import type { Unprotectable } from "../parser/marks.js";
import type { CarrierGlyphs, CarrierRenderer } from "../types.js";

/**
 * Draws carriers for one document.
 *
 * Seeds are `<document seed>/carrier <n>` over a counter that advances in the
 * order carriers are placed. That keeps carrier randomization out of the render
 * stream — adding a carrier does not reshuffle the chaff — and keeps invariant
 * 5 intact, since the placement order is itself a function of the seed.
 */
export interface CarrierSource {
  /**
   * The next carrier for `text` at `sizePx`, or null when the font cannot draw
   * it. The size is per call because it is per span: `carrier.fontSizePx` is
   * the document's, and `<heo-protect size>` overrides it wherever one number
   * is wrong.
   */
  next(text: string, sizePx: number): CarrierGlyphs | null;
  /** Carriers a fallback face drew because the publisher's could not. */
  readonly fallbacks: number;
  /** Carriers drawn so far. */
  readonly count: number;
}

export function createCarrierSource(
  renderer: CarrierRenderer,
  variations: Readonly<Record<string, number>>,
  seed: string,
): CarrierSource {
  let counter = 0;
  let fallbacks = 0;
  return {
    get count() {
      return counter;
    },
    get fallbacks() {
      return fallbacks;
    },
    next(text, sizePx) {
      const glyphs = renderer.render(
        text,
        { sizePx, jitterPx: CARRIER_JITTER_PX, variations },
        `${seed}/carrier ${counter}`,
      );
      if (glyphs === null) return null;
      counter++;
      if (glyphs.fallback === true) fallbacks++;
      return glyphs;
    },
  };
}

export class HeoCarrierError extends Error {
  /**
   * True when the fault is in the configuration rather than in the page.
   *
   * An adapter must never pass a page through on one of these. A missing
   * generator or a missing type size is wrong for every request, so `onError:
   * "passthrough"` over it is not "serve this page unprotected" but "serve
   * every page unprotected, permanently, without saying so" — which is the
   * failure core refuses by never loading a generator itself, arriving through
   * the adapter instead.
   */
  readonly configuration: boolean;

  constructor(message: string, configuration = false) {
    super(`HEO refused to serve: ${message}`);
    this.name = "HeoCarrierError";
    this.configuration = configuration;
  }
}

export function carrierUnavailable(marks: number): HeoCarrierError {
  return new HeoCarrierError(
    `the page carries ${marks} <heo-protect> element(s) and no carrier generator was supplied. ` +
      "Pass one as carrier.renderer, or remove the marks. A <heo-protect> is a request for a " +
      "carrier and nothing else, and falling back to text would publish the value HEO was " +
      "asked to protect.",
    true,
  );
}

export function carrierSizeMissing(marks: number): HeoCarrierError {
  return new HeoCarrierError(
    `${marks} marked span(s) have no type size and carrier.fontSizePx is not set. A carrier is ` +
      "drawn at an absolute size and there is no layout engine here to infer the computed one, " +
      "so no default can be right: set carrier.fontSizePx to the type size of the protected " +
      'text, and write size="…" on a mark where one number is not enough.',
    true,
  );
}

/**
 * What a run no available face can draw is reported as.
 *
 * Phrased as a coverage problem rather than a carrier refusal because that is
 * what it is: HEO was pointed at a span and could not take it, exactly like a
 * `<heo-shuffle>` with one word in it, and `onUnprotectable` is where the
 * publisher says what should happen. The default is still `refuse`.
 */
export function carrierUndrawable(text: string): Unprotectable {
  return {
    where: JSON.stringify(text),
    reason:
      "no configured face has an outline for it — not the publisher's font and not the " +
      "fallback — so it cannot be drawn as a carrier at all. Configure a font that covers " +
      "the protected spans.",
  };
}

/**
 * Shared vocabulary for the transformation pipeline.
 *
 * Stage boundaries are defined by these types: the parser produces directives
 * from the publisher's own `heo-*` elements and the renderers consume them. See
 * docs/design.md for the pipeline.
 *
 * There is no `StrategyName` and no `MarkPlan`. A strategy used to be something
 * drawn for a candidate span, seeded, from an enabled set; under elements the
 * publisher names the mechanism in the markup and there is nothing left to
 * draw. What the seed still decides is everything inside a mechanism — which
 * permutation, which substitute, which concealment, which jitter.
 */

/**
 * One run of text drawn as vector outlines, as returned by the generator.
 *
 * Metrics are in tenths of a CSS pixel, the same user space the path data uses,
 * so a caller can place the element on the surrounding baseline without
 * reparsing the `viewBox`.
 */
export interface CarrierGlyphs {
  /** The `<svg>` element, as markup. */
  svg: string;
  /** Total advance width: what the run would have occupied as native text. */
  advance: number;
  /** Baseline to the top of the box. */
  ascent: number;
  /** Baseline to the bottom of the box. Negative. */
  descent: number;
  /**
   * True when the run was drawn by a face other than the publisher's, because
   * theirs had no outline for it.
   *
   * Not a plaintext fallback and not an invariant-7 question: the carrier
   * exists, the value is out of the DOM, and the loss is that the word is set
   * in a different face. It is reported so the publisher can see it — in
   * `stats.carrierFallbacks` and in the adapter's log — because a silent
   * substitution is a page that looks right to us and wrong to a reader.
   */
  fallback?: boolean;
}

export interface CarrierParams {
  /**
   * Type size in CSS pixels. Must match the surrounding native text: a carrier
   * set at 17 px inside a paragraph at 15.2 px visibly jumps on the line.
   */
  sizePx: number;
  /**
   * Where in the font's variation space to draw, in user coordinates, keyed by
   * OpenType axis tag: `{ wght: 400 }`, `{ wght: 600, wdth: 87.5 }`.
   *
   * The same quantities CSS `font-variation-settings` names, because a carrier
   * has to match the page rather than the page the carrier. An empty map is the
   * face's own default instance, which for a variable font is whatever the
   * designer chose and not necessarily the weight anyone would set — Public
   * Sans defaults to `wght` 100.
   *
   * A tag the face has no axis for is ignored, so one call can serve a variable
   * face and a static fallback.
   */
  variations: Readonly<Record<string, number>>;
  /**
   * Control-point jitter amplitude in CSS pixels.
   *
   * Part of the generator ABI and not part of the publisher's configuration.
   * The amplitude is chosen so that jitter perturbs the rounding and moves no
   * coordinate by more than one unit of user space; a larger one moves ink and
   * spends invariant 1 for a defence that does not transfer — published
   * gradient-based glyph perturbation reaches 0–19.6% targeted transfer, and
   * jitter is a named augmentation in the recognisers' own training pipelines.
   */
  jitterPx: number;
}

/**
 * The generator, supplied by the host.
 *
 * `@human-eyes-only/core` never loads it: the engine is a `.wasm` artifact and core is a
 * synchronous, framework-neutral, toolchain-neutral pure function, so the
 * module and the publisher's font file are both the host's to provide — the
 * same reasoning that keeps font bytes out of the generator binary.
 * `@human-eyes-only/middleware` does that wiring on the publisher's behalf, which is what
 * makes carriers work on install without putting a `.wasm` loader inside core.
 *
 * Implementations must be **deterministic in the seed**: the same text, params
 * and seed must produce byte-identical markup, or invariant 5 does not hold for
 * a page carrying a carrier.
 *
 * Returning `null` means **no** face available to the host can draw this text.
 * A host that carries fallback faces is expected to have tried them first and
 * to flag the result: falling back to a different *font* still produces a
 * carrier and still takes the value out of the DOM, and it is only invariant 7
 * if it falls back to readable text.
 */
export interface CarrierRenderer {
  render(text: string, params: CarrierParams, seed: string): CarrierGlyphs | null;
}

/**
 * What HEO did about a Content-Security-Policy, for the adapter to finish.
 *
 * Core is handed a string, so it can rewrite a `<meta http-equiv>` itself and
 * cannot touch a response header. The nonce it chose is reported here so the
 * adapter can authorise the same one element in the header half of the policy.
 */
export interface CspResult {
  /** The nonce stamped on HEO's `<style>` element. */
  nonce: string;
  /**
   * The rewritten `Content-Security-Policy` response header, when the adapter
   * supplied one that needed the nonce. Null when the policy came only from a
   * `<meta http-equiv>`, which core has already rewritten in place.
   */
  headerPolicy: string | null;
}

export interface TransformStats {
  /** `heo-protect` elements the publisher wrote. */
  marks: number;
  /** `heo-shuffle` elements permuted. */
  shuffles: number;
  /** Noise nodes placed: one per `heo-chaff`, plus one per decoy. */
  chaffNodes: number;
  /** Words drawn as vector outlines. Page weight is what M1 is watching. */
  carriers: number;
  /**
   * Carriers of those that the publisher's own font could not draw and a
   * fallback face did. Cosmetic rather than a protection failure, and reported
   * because nothing else in the response would say so.
   */
  carrierFallbacks: number;
  /** Marks whose substitute went into the channel the carrier vacated. */
  decoys: number;
  /**
   * Spans HEO was pointed at and served as text anyway. Non-zero only under
   * `onUnprotectable: "warn"`; otherwise the page is refused.
   */
  unprotected: number;
  inputBytes: number;
  outputBytes: number;
  durationMs: number;
  /** Resolved seed, so a debug run can be replayed byte-for-byte. */
  seed: string;
  /**
   * Set only when the response carried a policy that needed a nonce. Null
   * otherwise, which is what keeps a page without a CSP byte-identical for a
   * fixed seed (invariant 5).
   */
  csp: CspResult | null;
}

export interface TransformResult {
  html: string;
  stats: TransformStats;
}

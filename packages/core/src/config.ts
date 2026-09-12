/**
 * Configuration surface and defaults.
 *
 * **There is no `strategies`.** The markup is the configuration:
 * `<heo-protect>` requests a carrier, `<heo-shuffle>` requests a permutation,
 * `<heo-chaff>` requests a noise node. A toggle beside an element that names
 * the same mechanism can only disagree with it, and the publisher who wrote the
 * element is the one who would lose.
 *
 * **There is no `chaff` block at all.** Scope and density named choices a
 * self-placing element answers by existing, and `stackBehind` went with the
 * occlusion concealment it enabled. Nothing in the configuration relaxes
 * invariant 2 or any other stated property now.
 *
 * **There is no `mode` selector.** `subtle` / `balanced` / `hostile` name points
 * on a ladder whose rungs do not all exist yet. Until every mechanism is built
 * and measured there is one behaviour with direct parameters.
 */

import type { CarrierRenderer } from "./types.js";

/**
 * Seed scope (docs/design.md, "Determinism").
 *
 * `request` is the default and the point: every load renders differently, so
 * there is no stable mapping to resolve once and cache. `page` keys the seed on
 * `documentKey`, which is what a publisher who must keep a CDN in front of a
 * protected route sets, and what M4 is open about.
 *
 * There is no `build`. It was `request` with a `seed` spelled a second way —
 * `deriveSeed` returned the seed unchanged in both — except that without one it
 * fell back to a constant, which gave every deployment that set it the same
 * seed and said nothing.
 */
export type RandomizationScope = "page" | "request";

/**
 * What to do when a span the publisher marked survives as text HEO could not
 * transform. `refuse` is the default and the only safe one: a marked span
 * served as plaintext is a span nobody protected, and nothing in the response
 * says so, so the publisher would never find out.
 */
export type UnprotectablePolicy = "refuse" | "warn";

export interface CarrierConfig {
  /**
   * The generator. Core never loads one itself; a host that wants carriers
   * passes the module in, exactly as it passes in the publisher's font file.
   * `@human-eyes-only/middleware` does that wiring, so a publisher installing the adapter
   * supplies a font rather than a renderer.
   *
   * Required on any page carrying `<heo-protect>`: the element means a carrier
   * and there is nothing else it could mean.
   */
  renderer?: CarrierRenderer | null;
  /**
   * Type size of the protected text, in CSS pixels. **Required** for every
   * marked span that does not carry its own `size`.
   *
   * There is no way to infer this: `transformHtml` is a pure function over a
   * string with no layout engine behind it, and the size that matters is the
   * *computed* one. A carrier drawn at the wrong size is visible on the line,
   * so there is no default that could be right — 16 was one, and on a page
   * setting 19 it drew every carrier a pixel and a half short with nothing to
   * say so. A page asking for carriers without this is refused.
   */
  fontSizePx?: number;
  /**
   * Where in the font's variation space to draw, keyed by OpenType axis tag:
   * `{ wght: 400 }`, `{ wght: 600, wdth: 87.5 }`. Empty by default, which is
   * the face's own default instance.
   *
   * This is the size's sibling and it is configuration for the same reason:
   * which weight applies to a span is a question for the cascade and the
   * cascade needs layout. Unlike the size it has a usable default — a static
   * face has no axes, and a variable face has a default instance — but that
   * default is the *designer's* choice rather than the page's, and for Public
   * Sans it is `wght` 100 against a page that almost certainly sets 400.
   * Leaving it unset used to make the publisher pin `font-variation-settings`
   * on their own text to match us, which is backwards.
   *
   * Part of the transformation's inputs, so it is part of what a fixed seed
   * reproduces: two deployments at different weights do not produce the same
   * bytes, and should not.
   */
  variations?: Record<string, number>;
}

/**
 * What to do about a Content-Security-Policy that will not admit the one
 * `<style>` element HEO injects.
 *
 * `nonce` is the default and the behaviour a publisher gets unless they say
 * otherwise: HEO generates a nonce, stamps it on its own `<style>`, and adds
 * `'nonce-...'` to the directive that governs style elements — that directive
 * and no other, with no host, no scheme and never `'unsafe-inline'`. It is an
 * edit to the publisher's security policy and the README says so plainly.
 *
 * `refuse` is the older behaviour: the page is refused rather than its policy
 * touched. Choose it if a policy is something only your own tooling may write.
 * Either way, a policy a nonce cannot satisfy is still refused.
 */
export type RestrictiveCspPolicy = "nonce" | "refuse";

export interface HeoConfig {
  randomization?: RandomizationScope;
  seed?: string;
  /**
   * Document identity for `randomization: "page"`, normally the request path.
   * Falls back to a hash of the input when absent.
   */
  documentKey?: string;
  carrier?: CarrierConfig;
  onUnprotectable?: UnprotectablePolicy;
  /**
   * What to do about a policy that would block the injected stylesheet. Named
   * to read beside `onUnprotectable`, and to stop being confused with
   * `contentSecurityPolicy`, which is the policy itself.
   */
  onRestrictiveCsp?: RestrictiveCspPolicy;
  /**
   * The `Content-Security-Policy` response header, supplied by an adapter that
   * can see one. `transformHtml` is handed a string, so it sees `<meta
   * http-equiv>` and nothing else; the header is where a real policy usually
   * lives. Pass it in and read the rewritten policy back out of
   * `stats.csp.headerPolicy`.
   */
  contentSecurityPolicy?: string;
  /** Emits `data-heo-*` attributes. Never enable in production: it labels every span. */
  debug?: boolean;
}

/** `carrier.fontSizePx` is null until the publisher sets one; see `CarrierConfig`. */
export type ResolvedCarrierConfig = Omit<Required<CarrierConfig>, "fontSizePx" | "variations"> & {
  fontSizePx: number | null;
  variations: Readonly<Record<string, number>>;
};

/**
 * Control-point jitter amplitude, in CSS pixels, and not a publisher option.
 *
 * The user space is tenths of a pixel, so 0.05 perturbs the rounding and moves
 * no coordinate by more than one unit — and where an outline already quantises
 * exactly it changes nothing at all. That is the whole of the intended
 * strength. A larger amplitude moves ink and spends invariant 1, and it would
 * buy a defence that does not transfer — published gradient-based glyph
 * perturbation reaches 0–19.6% targeted transfer, and stroke weight, jitter and
 * rotation are named augmentations in the recognisers' own training pipelines.
 * The structural axes carry instead. A dial whose only settings are "correct"
 * and "visibly wrong" is not a dial, and there is no gate in front of it: the
 * corpus pixel diff does not draw carriers, because a corpus document has no
 * font.
 */
export const CARRIER_JITTER_PX = 0.05;

export interface ResolvedConfig {
  randomization: RandomizationScope;
  seed: string | null;
  documentKey: string | null;
  carrier: ResolvedCarrierConfig;
  onUnprotectable: UnprotectablePolicy;
  onRestrictiveCsp: RestrictiveCspPolicy;
  contentSecurityPolicy: string | null;
  debug: boolean;
}

export const DEFAULT_CONFIG: ResolvedConfig = {
  randomization: "request",
  seed: null,
  documentKey: null,
  carrier: { renderer: null, fontSizePx: null, variations: {} },
  onUnprotectable: "refuse",
  onRestrictiveCsp: "nonce",
  contentSecurityPolicy: null,
  debug: false,
};

export function resolveConfig(config: HeoConfig = {}): ResolvedConfig {
  return {
    randomization: config.randomization ?? DEFAULT_CONFIG.randomization,
    seed: config.seed ?? DEFAULT_CONFIG.seed,
    documentKey: config.documentKey ?? DEFAULT_CONFIG.documentKey,
    carrier: { ...DEFAULT_CONFIG.carrier, ...config.carrier },
    onUnprotectable: config.onUnprotectable ?? DEFAULT_CONFIG.onUnprotectable,
    onRestrictiveCsp: config.onRestrictiveCsp ?? DEFAULT_CONFIG.onRestrictiveCsp,
    contentSecurityPolicy: config.contentSecurityPolicy ?? DEFAULT_CONFIG.contentSecurityPolicy,
    debug: config.debug ?? DEFAULT_CONFIG.debug,
  };
}

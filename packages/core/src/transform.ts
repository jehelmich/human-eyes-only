/**
 * The whole public surface of `@human-eyes-only/core`, and the only entry point adapters
 * use: `transformHtml(html, config) -> { html, stats }`.
 *
 * Keeping it to one function is deliberate. Adapters that hold transformation
 * logic are the main way this design rots, and an adapter that can only call one
 * function cannot hold any.
 *
 * The shape of the work: discover the publisher's `heo-*` elements, refuse
 * anything that does nothing or that no mechanism can take, render each element
 * into the nodes that replace it, and unwrap whatever is left. Nothing sits
 * between discovery and rendering, because the element is the decision.
 */

import { hasMarker, injectRuntime } from "./assembler/runtime.js";
import { createRunStylesheet } from "./assembler/stylesheet.js";
import { renderChaff } from "./chaff/generate.js";
import { type HeoConfig, resolveConfig } from "./config.js";
import {
  type CarrierSource,
  carrierSizeMissing,
  carrierUnavailable,
  createCarrierSource,
} from "./guards/carrier.js";
import { HeoCoverageError } from "./guards/coverage.js";
import { createNonce, permitsStyleElement, planCsp, withStyleNonce } from "./guards/csp.js";
import { detectHydration, HeoHydrationError } from "./guards/hydration.js";
import { describeElement, HeoMarkupError, type MarkupProblem } from "./guards/markup.js";
import {
  type Document,
  getAttr,
  isElement,
  parseDocument,
  replaceChild,
  serializeDocument,
  setAttr,
  walk,
} from "./parser/dom.js";
import {
  CHAFF_TAG,
  type Directive,
  discoverMarkup,
  OPTIONS_ATTR,
  unwrapHeoElements,
} from "./parser/marks.js";
import { createRng } from "./random/prng.js";
import { deriveSeed } from "./random/seed.js";
import { renderMark } from "./renderers/carrier.js";
import { MIN_UNITS, renderShuffle } from "./renderers/reorder.js";
import type { RenderContext } from "./renderers/types.js";
import type { CspResult, TransformResult, TransformStats } from "./types.js";

/**
 * Stamped into the document marker, so it is what a transformed page declares
 * about itself. Hard-coded rather than read from `package.json`, which core
 * cannot do on an edge runtime; it is bumped with the package version.
 */
export const VERSION = "0.1.0-alpha.3";

const ENCODER = new TextEncoder();

/**
 * UTF-8 byte length without `Buffer`. `@human-eyes-only/core` must run unchanged on Node,
 * Deno, Bun and edge runtimes; a Node global here would be the first crack in
 * that.
 */
function byteLength(text: string): number {
  return ENCODER.encode(text).length;
}

function emptyStats(html: string, seed: string, started: number): TransformStats {
  const bytes = byteLength(html);
  return {
    marks: 0,
    shuffles: 0,
    chaffNodes: 0,
    carriers: 0,
    carrierFallbacks: 0,
    decoys: 0,
    unprotected: 0,
    inputBytes: bytes,
    outputBytes: bytes,
    durationMs: performance.now() - started,
    seed,
    // A page HEO did not transform got no stylesheet, so it needs no nonce and
    // its policy is not touched.
    csp: null,
  };
}

/**
 * Adds the nonce to every `<meta http-equiv="Content-Security-Policy">` whose
 * policy would otherwise block the injected stylesheet.
 *
 * Every policy attached to a response has to permit a resource for it to load,
 * so every restrictive one is rewritten and they all name the same nonce.
 */
function nonceMetaPolicies(document: Document, nonce: string): void {
  walk(document, (node) => {
    if (!isElement(node) || node.tagName !== "meta") return;
    const equiv = getAttr(node, "http-equiv");
    if (equiv === null || equiv.toLowerCase() !== "content-security-policy") return;
    const policy = getAttr(node, "content");
    if (policy === null || permitsStyleElement(policy)) return;
    setAttr(node, "content", withStyleNonce(policy, nonce));
  });
}

/**
 * Chaff that would republish a protected value.
 *
 * The rule that chaff never carries a real figure does not soften because the
 * publisher wrote the sentence; what changes is that it is now a mistake to
 * report rather than a node to drop. A dropped node is invisible, and the
 * sentence that caused it is removed from the response with the element.
 */
function chaffLeaks(
  directives: readonly Directive[],
  forbidden: ReadonlySet<string>,
): MarkupProblem[] {
  const problems: MarkupProblem[] = [];
  for (const directive of directives) {
    if (directive.kind !== "chaff") continue;
    for (const option of directive.chaff.options) {
      for (const value of forbidden) {
        if (!option.includes(value)) continue;
        problems.push({
          source: `${CHAFF_TAG} ${OPTIONS_ATTR}`,
          where: describeElement(CHAFF_TAG, option),
          reason: `it repeats ${JSON.stringify(value)}, which is a protected value on this page`,
          remedy:
            "Rewrite the sentence. A noise node is the last place a real figure should " +
            "reappear: nothing else inspects it, so a value published there is published.",
        });
      }
    }
  }
  return problems;
}

export function transformHtml(html: string, config: HeoConfig = {}): TransformResult {
  const started = performance.now();
  const resolved = resolveConfig(config);

  const hydration = detectHydration(html);
  if (hydration !== null) throw new HeoHydrationError(hydration.framework);

  const document = parseDocument(html);

  // Idempotence. HEO runs behind proxies and caches that
  // may feed it its own output; transforming twice would compound chaff and
  // permute an already permuted run.
  if (hasMarker(document)) {
    return { html, stats: emptyStats(html, "", started) };
  }

  const seed = deriveSeed(resolved, html);
  const rootRng = createRng(seed);

  // The publisher's markup is the whole input, so every way of writing it that
  // does nothing is collected and refused together rather than dropped.
  // Collected rather than thrown one at a time: the first request should list
  // every mistake on the page, not the first one.
  const { directives, marks, problems, unprotectable } = discoverMarkup(document);
  const forbidden = new Set(marks.map((mark) => mark.text));
  problems.push(...chaffLeaks(directives, forbidden));
  if (problems.length > 0) throw new HeoMarkupError(problems);

  if (directives.length === 0 && unprotectable.length === 0) {
    return { html, stats: emptyStats(html, seed, started) };
  }

  // Decided before any rendering, because `onRestrictiveCsp: "refuse"` and a
  // policy no nonce can satisfy are both refusals. Decided *after* the page is
  // known to be marked, because a page HEO was not pointed at needs no
  // stylesheet, and refusing it over a policy that would have blocked one is
  // HEO disapproving of a page rather than failing to perform. The nonce itself
  // is generated later, only if a stylesheet is actually injected.
  const csp = planCsp(html, resolved.contentSecurityPolicy, resolved.onRestrictiveCsp);

  // A carrier is the whole of what `<heo-protect>` means, so a page carrying
  // one with no generator configured is a refusal rather than a downgrade. The
  // downgrade would serve a page that looks protected and publishes the value
  // in plain text, which is the failure invariant 7 exists to prevent and the
  // one the publisher would not notice.
  if (marks.length > 0 && resolved.carrier.renderer === null) {
    if (resolved.onUnprotectable === "refuse") throw carrierUnavailable(marks.length);
    for (const mark of marks) {
      unprotectable.push({
        where: describeElement(mark.element.tagName, mark.text),
        reason: "no carrier generator is configured, so the value is served as text",
      });
    }
  }
  // And a carrier with no size is the same refusal for the same reason: 16 px
  // inside a 19 px paragraph is a visible defect nothing in the response
  // reports.
  if (resolved.carrier.renderer !== null && resolved.carrier.fontSizePx === null) {
    const sizeless = marks.filter((mark) => mark.sizePx === null).length;
    if (sizeless > 0) throw carrierSizeMissing(sizeless);
  }

  for (const directive of directives) {
    if (directive.kind !== "shuffle") continue;
    if (directive.shuffle.units >= MIN_UNITS) continue;
    unprotectable.push({
      where: describeElement(directive.shuffle.element.tagName, ""),
      reason: `it holds ${directive.shuffle.units} unit(s), and permuting fewer than ${MIN_UNITS} is not a permutation`,
    });
  }

  // A span HEO was pointed at and served as text is the one failure a publisher
  // would never notice. This is HEO reporting that it could not do what it was
  // asked, not an opinion about the publisher's page (guards/coverage.ts).
  if (unprotectable.length > 0 && resolved.onUnprotectable === "refuse") {
    throw new HeoCoverageError(unprotectable);
  }

  // Carrier seeds hang off the document seed rather than the render stream, so
  // adding a carrier does not reshuffle the chaff, and a fixed seed still
  // reproduces the page byte for byte (invariant 5).
  const carrier: CarrierSource | null =
    resolved.carrier.renderer === null
      ? null
      : createCarrierSource(resolved.carrier.renderer, resolved.carrier.variations, seed);
  const sheet = createRunStylesheet(rootRng.derive("stylesheet"));

  const ctx: RenderContext = {
    rng: rootRng.derive("render"),
    debug: resolved.debug,
    sheet,
    carrier,
    fontSizePx: resolved.carrier.fontSizePx,
    forbidden,
    onUnprotectable: resolved.onUnprotectable,
    counts: { decoys: 0, undrawn: 0 },
  };

  let shuffles = 0;
  let chaffNodes = 0;

  for (const directive of directives) {
    switch (directive.kind) {
      case "chaff":
        replaceChild(directive.chaff.element, [renderChaff(directive.chaff, ctx)]);
        chaffNodes++;
        break;
      case "shuffle":
        // Below the minimum it is already recorded as unprotectable, so under
        // `warn` the element is unwrapped and its content served as written.
        if (directive.shuffle.units < MIN_UNITS) break;
        replaceChild(
          directive.shuffle.element,
          renderShuffle(directive.shuffle, `s${shuffles}`, ctx),
        );
        shuffles++;
        break;
      case "protect":
        if (carrier === null) break;
        replaceChild(directive.mark.element, renderMark(directive.mark, ctx));
        break;
    }
  }

  // Nothing the publisher wrote may reach the output: shipped, a `heo-*`
  // element is an index of exactly which spans are protected, which is what
  // announcing at document level and never at span level exists to avoid, and
  // it publishes the candidate list an attacker would otherwise resolve.
  // Normally this finds nothing — a rendered directive replaced its own element
  // — and what it does find is what `warn` declined to render.
  unwrapHeoElements(document);

  // The nonce is not drawn from the seeded stream. A predictable nonce is not a
  // nonce, and invariant 5 survives because one is emitted only where a policy
  // demands it: a page without a CSP is byte-identical for a fixed seed exactly
  // as before.
  const nonce = csp.needsNonce ? createNonce() : null;
  if (nonce !== null) nonceMetaPolicies(document, nonce);
  injectRuntime(document, VERSION, sheet.rules(), nonce);

  const cspResult: CspResult | null =
    nonce === null
      ? null
      : {
          nonce,
          headerPolicy: csp.headerPolicy === null ? null : withStyleNonce(csp.headerPolicy, nonce),
        };

  const output = serializeDocument(document);

  return {
    html: output,
    stats: {
      marks: marks.length,
      shuffles,
      chaffNodes: chaffNodes + ctx.counts.decoys,
      carriers: carrier === null ? 0 : carrier.count,
      carrierFallbacks: carrier === null ? 0 : carrier.fallbacks,
      decoys: ctx.counts.decoys,
      // Spans discovered unprotectable up front, plus words no face could draw,
      // which is only known once the generator has been asked.
      unprotected: unprotectable.length + ctx.counts.undrawn,
      inputBytes: byteLength(html),
      outputBytes: byteLength(output),
      durationMs: performance.now() - started,
      seed,
      csp: cspResult,
    },
  };
}

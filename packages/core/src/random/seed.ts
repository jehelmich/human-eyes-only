/**
 * Seed derivation for the two randomization scopes (docs/design.md).
 *
 * Request scope is the default: every load renders differently, so there is no
 * stable mapping for an attacker to resolve once and cache. That is what stops
 * a large per-request cost multiplier amortizing toward 1x over a year of
 * re-crawls. It also makes protected pages CDN-uncacheable, which is a real
 * bill and is stated as one.
 *
 * Page scope is the way back to a cache: one seed per `documentKey`, so a URL
 * renders the same until its content does.
 */

import type { ResolvedConfig } from "../config.js";
import { digest } from "./prng.js";

const BASE = "heo";

/** Cheap unique-per-call component. Not a security boundary, just variation. */
function requestNonce(): string {
  return `${Date.now().toString(36)}.${globalThis.crypto.randomUUID()}`;
}

export function deriveSeed(config: ResolvedConfig, html: string): string {
  const base = config.seed ?? BASE;

  if (config.randomization === "page") return `${base}/${config.documentKey ?? digest(html)}`;

  // Request scope. An explicit seed pins it, so a debug report is replayable and
  // a benchmark can diff two runs; without one, vary per call. Written as the
  // fall-through rather than a second `case` so that a caller outside TypeScript
  // who names a scope that no longer exists gets the safe one.
  return config.seed !== null ? config.seed : `${base}/${requestNonce()}`;
}

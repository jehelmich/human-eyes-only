/**
 * @heo/core — public surface.
 *
 * The entire package reduces to a single entry point so that adapters stay
 * trivial.
 */

export { MARKER_NAME, RESPONSE_HEADER, RUNTIME_CSS } from "./assembler/runtime.js";
// The publisher's element and attribute names are not exported. They are the
// markup surface, documented in the README, and nothing outside core has ever
// needed them as strings — gate C12 writes its own list on purpose, so that the
// check does not agree with the engine by construction.
export type { Concealment, ConcealmentKind } from "./chaff/concealment.js";
export { ALL_CONCEALMENTS, isConcealed } from "./chaff/concealment.js";
export type {
  CarrierConfig,
  HeoConfig,
  RandomizationScope,
  RestrictiveCspPolicy,
  UnprotectablePolicy,
} from "./config.js";
export { HeoCarrierError } from "./guards/carrier.js";
export { HeoCoverageError } from "./guards/coverage.js";
// The CSP helpers stay internal. The contract for an adapter is two fields:
// pass the response header in as `contentSecurityPolicy`, write
// `stats.csp.headerPolicy` back out. Nothing outside core has ever needed to
// parse a policy itself, and an exported parser is a second way to do it.
export { HeoCspError } from "./guards/csp.js";
export { HeoHydrationError } from "./guards/hydration.js";
export type { MarkupProblem } from "./guards/markup.js";
export { HeoMarkupError } from "./guards/markup.js";
export type { Unprotectable } from "./parser/marks.js";
export { transformHtml, VERSION } from "./transform.js";
export type {
  CarrierGlyphs,
  CarrierParams,
  CarrierRenderer,
  CspResult,
  TransformResult,
  TransformStats,
} from "./types.js";

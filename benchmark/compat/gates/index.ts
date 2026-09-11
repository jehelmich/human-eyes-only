/**
 * The compatibility gate set.
 *
 * Two sets, split by what they need rather than by what they check. The static
 * gates run on a parsed document and are fast enough for every push; the
 * browser gates need Chromium and run on a slower cadence. A gate that is not
 * run is not a gate, so the runner reports which set it used.
 */

import type { Gate } from "../../runner/types.ts";
import { c1Reparse } from "./c1-reparse.ts";
import { c2Outside } from "./c2-outside.ts";
import { c3Visual } from "./c3-visual.ts";
import { c4Console } from "./c4-console.ts";
import { c5Scripts } from "./c5-scripts.ts";
import { c8Structure } from "./c8-structure.ts";
import { c9Idempotence } from "./c9-idempotence.ts";
import { c10Budget } from "./c10-budget.ts";
import { c12Markers } from "./c12-markers.ts";
import { rRefusal } from "./r-refusal.ts";

export const STATIC_GATES: Gate[] = [
  rRefusal,
  c1Reparse,
  c2Outside,
  c5Scripts,
  c8Structure,
  c9Idempotence,
  c10Budget,
  c12Markers,
];

export const BROWSER_GATES: Gate[] = [c3Visual, c4Console];

export const ALL_GATES: Gate[] = [...STATIC_GATES, ...BROWSER_GATES];

export {
  c1Reparse,
  c2Outside,
  c3Visual,
  c4Console,
  c5Scripts,
  c8Structure,
  c9Idempotence,
  c10Budget,
  c12Markers,
  rRefusal,
};

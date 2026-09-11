/**
 * C9 — idempotence.
 *
 * Invariant 9. HEO runs behind proxies and caches that may hand it its own
 * output; a second pass that transforms an already-transformed page would
 * compound chaff on chaff and permute an existing permutation, and the failure
 * would appear in production rather than here.
 *
 * The engine's answer is the document-level marker. This gate does not check
 * for the marker — it checks the property the marker exists to provide.
 */

import type { Gate, GateResult, Subject, Violation } from "../../runner/types.ts";

export const c9Idempotence: Gate = {
  id: "C9",
  name: "idempotence",
  absolute: true,

  check(subject: Subject): GateResult {
    const violations: Violation[] = [];
    if (subject.refusal === null && subject.output !== subject.reoutput) {
      const delta = Buffer.byteLength(subject.reoutput) - Buffer.byteLength(subject.output);
      violations.push({
        gate: "C9",
        detail: `transform(transform(x)) differs from transform(x) by ${delta} bytes`,
      });
    }
    return { gate: "C9", passed: violations.length === 0, violations };
  },
};

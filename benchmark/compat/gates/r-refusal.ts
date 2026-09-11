/**
 * R — refusal expectation.
 *
 * Not one of the C-gates, and not a compatibility question in the usual sense.
 * It exists because HEO's correct behaviour on some documents is to serve
 * nothing: hydrated SSR is out of scope by construction (invariant 6 forces it),
 * and a page whose side channels cannot be contained is refused rather than
 * decorated.
 *
 * A T3 document that transforms successfully is a failure, not a pass
 * (ROADMAP.md CP-1). Without this check the suite would score that document
 * 100% on every other gate and report a clean run.
 */

import type { Gate, GateResult, Subject, Violation } from "../../runner/types.ts";

export const rRefusal: Gate = {
  id: "R",
  name: "refusal expectation",
  absolute: true,

  check(subject: Subject): GateResult {
    const violations: Violation[] = [];
    // `expectRefusal` is a claim about the engine, not about the harness. The
    // identity transform has no refusal path, so there is nothing to assert.
    if (!subject.canRefuse) return { gate: "R", passed: true, violations };

    const expected = subject.document.meta.expectRefusal === true;

    if (expected && subject.refusal === null) {
      violations.push({
        gate: "R",
        detail: "expected a refusal and the document transformed successfully",
      });
    }
    if (!expected && subject.refusal !== null) {
      violations.push({ gate: "R", detail: `unexpected refusal: ${subject.refusal}` });
    }

    return { gate: "R", passed: violations.length === 0, violations };
  },
};

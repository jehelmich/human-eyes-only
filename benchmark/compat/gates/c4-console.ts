/**
 * C4 — clean console.
 *
 * Compared against the input's own baseline rather than against silence. Corpus
 * documents reference assets that do not exist and some of them carry a strict
 * CSP, so both versions produce noise; what would be a defect is noise the
 * transformation *added*.
 *
 * The case this exists for is concrete. A document with
 * `style-src 'self'` blocks HEO's injected stylesheet, which means the
 * permutation is never inverted and the page renders scrambled. C3 catches the
 * scrambling; C4 says why.
 */

import type { Gate, GateResult, RenderedSubject, Subject, Violation } from "../../runner/types.ts";

export const c4Console: Gate = {
  id: "C4",
  name: "clean console",
  absolute: true,

  check(subject: Subject, rendered: RenderedSubject | null): GateResult {
    const violations: Violation[] = [];
    if (rendered === null || subject.refusal !== null) {
      return { gate: "C4", passed: true, violations };
    }

    const baseline = new Map<string, number>();
    for (const message of rendered.input.messages) {
      baseline.set(message, (baseline.get(message) ?? 0) + 1);
    }

    const seen = new Map<string, number>();
    for (const message of rendered.output.messages) {
      const count = (seen.get(message) ?? 0) + 1;
      seen.set(message, count);
      if (count > (baseline.get(message) ?? 0)) {
        violations.push({ gate: "C4", detail: message.slice(0, 200) });
      }
    }

    return {
      gate: "C4",
      passed: violations.length === 0,
      violations,
      measures: {
        baseline: rendered.input.messages.length,
        after: rendered.output.messages.length,
      },
    };
  },
};

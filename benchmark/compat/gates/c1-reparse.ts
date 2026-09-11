/**
 * C1 — re-parse stability.
 *
 * The output must survive a parse-serialize round trip unchanged. HEO sits
 * behind caches and CDNs that reparse and reserialize HTML as a matter of
 * course; markup that is not a fixed point of that operation is markup whose
 * meaning depends on who handled it last.
 *
 * parse5 never throws on malformed input — it implements the HTML5 error
 * recovery rules — so "does it parse" is not a question that can fail. "Does it
 * parse to the same thing twice" is.
 */

import { parseDocument, serializeDocument } from "../../runner/dom.ts";
import type { Gate, GateResult, Subject, Violation } from "../../runner/types.ts";

function firstDifference(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  for (let index = 0; index < limit; index++) {
    if (left[index] !== right[index]) return index;
  }
  return limit;
}

export const c1Reparse: Gate = {
  id: "C1",
  name: "re-parse stability",
  absolute: true,

  check(subject: Subject): GateResult {
    const violations: Violation[] = [];
    const once = serializeDocument(parseDocument(subject.output));
    const twice = serializeDocument(parseDocument(once));

    if (once !== twice) {
      const at = firstDifference(once, twice);
      violations.push({
        gate: "C1",
        detail:
          `parse-serialize is not a fixed point; diverges at byte ${at}: ` +
          `${JSON.stringify(once.slice(at, at + 60))} vs ${JSON.stringify(twice.slice(at, at + 60))}`,
      });
    }

    return {
      gate: "C1",
      passed: violations.length === 0,
      violations,
      measures: { outputBytes: Buffer.byteLength(subject.output, "utf8") },
    };
  },
};

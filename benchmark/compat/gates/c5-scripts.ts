/**
 * C5 — executable script untouched.
 *
 * Invariant 3. Executable code is never touched and never becomes touchable.
 * The distinction is the `type` attribute, so the gate reads it the same way
 * the engine does and then checks byte equality on everything that is code.
 * Serialized data is not rewritten either — HEO transforms what the publisher
 * marked and nothing else — but it is excluded here because this gate is about
 * execution rather than about coverage.
 *
 * Order matters as much as content. A transformation that preserved every
 * script's text but moved one of them past another would change execution
 * order, which is a defect this gate should catch.
 */

import {
  getAttr,
  isDataScript,
  isElement,
  parseDocument,
  subtreeText,
  walk,
} from "../../runner/dom.ts";
import type { Gate, GateResult, Subject, Violation } from "../../runner/types.ts";

function executableScripts(html: string): string[] {
  const found: string[] = [];
  walk(parseDocument(html), (node) => {
    if (!isElement(node) || node.tagName !== "script") return;
    const type = getAttr(node, "type");
    if (isDataScript(type)) return;
    found.push(subtreeText(node));
  });
  return found;
}

export const c5Scripts: Gate = {
  id: "C5",
  name: "executable script untouched",
  absolute: true,

  check(subject: Subject): GateResult {
    const violations: Violation[] = [];
    const before = executableScripts(subject.input);
    const after = executableScripts(subject.output);

    if (before.length !== after.length) {
      violations.push({
        gate: "C5",
        detail: `executable script count changed: ${before.length} -> ${after.length}`,
      });
    }

    for (let index = 0; index < Math.min(before.length, after.length); index++) {
      if (before[index] !== after[index]) {
        violations.push({
          gate: "C5",
          detail: `executable script ${index} was modified`,
        });
      }
    }

    return {
      gate: "C5",
      passed: violations.length === 0,
      violations,
      measures: { scripts: before.length },
    };
  },
};

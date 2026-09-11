/**
 * C10 — budget.
 *
 * The only threshold gate in the suite. Everything else here is absolute; this
 * one asks whether the page is still deployable, and that is a question with a
 * number in it.
 *
 * The thresholds live in `budget.json` rather than in code so that tightening
 * them is a reviewable data change, and the rule is that they are only ever
 * tightened (ROADMAP.md).
 *
 * The budget is `output <= fixed + ratio * input`, not a bare ratio. A bare
 * ratio was the first thing tried and it was wrong: HEO's document-level
 * declaration and the floor of chaff a region gets do not scale with the page,
 * so on a 300-byte corpus document they are the entire measurement, and two
 * documents failed at 8.96x while adding under 2.5 KB. The fixed term isolates
 * that, and what remains is the part of the cost that actually grows.
 *
 * A consequence worth stating: T0 and T4 are all in the smallest class, so the
 * ratio term is barely exercised until the corpus has real pages in it.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Gate, GateResult, Subject, Violation } from "../../runner/types.ts";

interface BudgetClass {
  maxInputBytes: number;
  /** Overhead that does not scale with the page: the declaration and chaff's floor. */
  fixedAllowanceBytes: number;
  maxByteRatio: number;
  /**
   * A carrier's cost is set by the word it draws, not by the page it sits on —
   * roughly 900 bytes of path markup per word whatever the document weighs. On
   * a 500-byte document one carrier is a 20x ratio, which says nothing about
   * the engine and everything about the arithmetic.
   */
  perCarrierBytes: number;
  maxDurationMs: number;
}

const BUDGETS: BudgetClass[] = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "budget.json"), "utf8"),
).classes;

function classFor(inputBytes: number): BudgetClass {
  return (
    BUDGETS.find((budget) => inputBytes <= budget.maxInputBytes) ??
    (BUDGETS[BUDGETS.length - 1] as BudgetClass)
  );
}

export const c10Budget: Gate = {
  id: "C10",
  name: "budget",
  absolute: false,

  check(subject: Subject): GateResult {
    const violations: Violation[] = [];
    const inputBytes = Buffer.byteLength(subject.input, "utf8");
    const outputBytes = Buffer.byteLength(subject.output, "utf8");
    const ratio = inputBytes === 0 ? 1 : outputBytes / inputBytes;
    const budget = classFor(inputBytes);

    if (subject.refusal === null) {
      const carriers = (subject.output.match(/<svg/gu) ?? []).length;
      const ceiling =
        budget.fixedAllowanceBytes +
        inputBytes * budget.maxByteRatio +
        carriers * budget.perCarrierBytes;
      if (outputBytes > ceiling) {
        violations.push({
          gate: "C10",
          detail:
            `${outputBytes} bytes over a ceiling of ${ceiling} ` +
            `(${budget.fixedAllowanceBytes} fixed + ${budget.maxByteRatio}x ${inputBytes}` +
            `${carriers === 0 ? "" : ` + ${carriers} carriers`})`,
        });
      }
      if (subject.durationMs > budget.maxDurationMs) {
        violations.push({
          gate: "C10",
          detail: `${subject.durationMs.toFixed(1)} ms, over the ${budget.maxDurationMs} ms ceiling`,
        });
      }
    }

    return {
      gate: "C10",
      passed: violations.length === 0,
      violations,
      measures: {
        inputBytes,
        outputBytes,
        byteRatio: ratio,
        carriers: (subject.output.match(/<svg/gu) ?? []).length,
        durationMs: subject.durationMs,
      },
    };
  },
};

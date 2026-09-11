/**
 * The compatibility gate, run over a corpus.
 *
 * The headline number is the percentage of documents per tier that transform
 * with zero violations, reported by failure cause. A single aggregate
 * percentage would hide the thing worth knowing — which *kind* of page breaks —
 * so the cause breakdown is part of the result rather than an optional detail.
 */

import type { Renderer } from "../runner/render.ts";
import { buildSubject } from "../runner/subject.ts";
import type {
  CorpusDocument,
  Gate,
  GateResult,
  RenderedSubject,
  Tier,
  TransformUnderTest,
} from "../runner/types.ts";
import { STATIC_GATES } from "./gates/index.ts";
import { type Waiver, waiverKey, waiversFor } from "./waivers.ts";

export interface DocumentReport {
  id: string;
  tier: Tier;
  passed: boolean;
  /** Failed only on gates that are waived. Never counted as clean. */
  waived: boolean;
  refused: boolean;
  gates: GateResult[];
}

export interface TierReport {
  tier: Tier;
  documents: number;
  passed: number;
  waived: number;
  score: number;
}

export interface CompatReport {
  transform: string;
  /** Which gates actually ran. A gate that is not run is not a gate. */
  gates: string[];
  documents: number;
  passed: number;
  waived: number;
  score: number;
  tiers: TierReport[];
  /** Waivers that matched nothing. A stale waiver fails the run. */
  staleWaivers: Waiver[];
  /** Documents failed, keyed by gate id. The "reported by failure cause" half. */
  causes: Record<string, number>;
  failures: { id: string; gate: string; detail: string }[];
  results: DocumentReport[];
}

export async function runCompat(
  documents: CorpusDocument[],
  transform: TransformUnderTest,
  gates: Gate[] = STATIC_GATES,
  renderer: Renderer | null = null,
): Promise<CompatReport> {
  const results: DocumentReport[] = [];
  const causes: Record<string, number> = {};
  const failures: { id: string; gate: string; detail: string }[] = [];
  const waivers = waiversFor(transform.name);
  const waived = new Map(waivers.map((waiver) => [waiverKey(waiver.id, waiver.gate), waiver]));
  const used = new Set<string>();

  for (const document of documents) {
    const subject = buildSubject(document, transform);

    // Rendering is the expensive part by two orders of magnitude, so it happens
    // once per document and both browser gates read the same captures.
    let rendered: RenderedSubject | null = null;
    if (renderer !== null && subject.refusal === null) {
      rendered = {
        input: await renderer.render(subject.input),
        output: await renderer.render(subject.output),
      };
    }

    const gateResults: GateResult[] = [];
    for (const gate of gates) gateResults.push(await gate.check(subject, rendered));

    // A threshold gate that fails is reported and does not fail the document.
    // C10 is the only one, and moving its ceiling is a deliberate act, not a
    // side effect of a red run (ROADMAP.md).
    const blocking = gateResults.filter((result) => {
      if (result.passed) return false;
      const gate = gates.find((candidate) => candidate.id === result.gate);
      if (gate?.absolute !== true) return false;
      const key = waiverKey(document.id, result.gate);
      if (waived.has(key)) {
        used.add(key);
        return false;
      }
      return true;
    });

    for (const result of gateResults) {
      if (result.passed) continue;
      causes[result.gate] = (causes[result.gate] ?? 0) + 1;
      for (const violation of result.violations) {
        failures.push({ id: document.id, gate: violation.gate, detail: violation.detail });
      }
    }

    const wasWaived = gateResults.some(
      (result) => !result.passed && waived.has(waiverKey(document.id, result.gate)),
    );

    results.push({
      id: document.id,
      tier: document.tier,
      passed: blocking.length === 0 && !wasWaived,
      waived: wasWaived,
      refused: subject.refusal !== null,
      gates: gateResults,
    });
  }

  const tiers = [...new Set(results.map((result) => result.tier))].map((tier) => {
    const inTier = results.filter((result) => result.tier === tier);
    const passed = inTier.filter((result) => result.passed).length;
    return {
      tier,
      documents: inTier.length,
      passed,
      waived: inTier.filter((result) => result.waived).length,
      score: inTier.length === 0 ? 1 : passed / inTier.length,
    };
  });

  const passed = results.filter((result) => result.passed).length;
  // Only a waiver whose gate actually ran can be stale. The static cadence does
  // not run C3, and a C3 waiver is not evidence of anything there.
  const ran = new Set(gates.map((gate) => gate.id));
  const staleWaivers = waivers.filter(
    (waiver) => ran.has(waiver.gate) && !used.has(waiverKey(waiver.id, waiver.gate)),
  );

  return {
    transform: transform.name,
    gates: gates.map((gate) => gate.id),
    documents: results.length,
    passed,
    waived: results.filter((result) => result.waived).length,
    score: results.length === 0 ? 1 : passed / results.length,
    tiers,
    staleWaivers,
    causes,
    failures,
    results,
  };
}

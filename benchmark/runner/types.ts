/**
 * Shared vocabulary for both benchmark suites.
 *
 * A gate is pass/fail and a metric is continuous, and the type system says so.
 * The distinction is the project's central rule (`benchmark/README.md`), and it
 * survives contact with an implementation only if it is structural.
 */

import type { RenderResult } from "./render.ts";

/** The five corpus tiers, ordered by how far each is from hand-written HTML. */
export const TIERS = ["T0-minimal", "T1-semantic", "T2-cms", "T3-ssr", "T4-adversarial"] as const;

export type Tier = (typeof TIERS)[number];

/**
 * Provenance is recorded rather than assumed. A synthetic document is written
 * to an archetype and is honest about it; a captured one carries the licence
 * that makes redistributing it lawful. Conflating the two is how a corpus
 * quietly becomes a set of documents that only HEO's authors would write.
 */
export type Provenance = "synthetic" | "captured";

export interface CorpusMeta {
  provenance: Provenance;
  /** What structural case the document exists to exercise. */
  archetype: string;
  /** Free text: where a captured document came from. Empty when synthetic. */
  source: string;
  /** Licence under which a captured document may be redistributed. */
  licence: string;
  /** Phrases a correct extraction must contain. Used by the extraction suite. */
  keyPhrases: string[];
  /**
   * Documents expected to be refused rather than transformed. A T3 document
   * that transforms successfully is a failure, not a pass (ROADMAP.md CP-1).
   */
  expectRefusal?: boolean;
  /** Why this document is expected to fail a gate, when it is. */
  notes?: string;
}

export interface CorpusDocument {
  tier: Tier;
  slug: string;
  /** `<tier>/<slug>`, the identifier used in reports. */
  id: string;
  dir: string;
  input: string;
  truth: string;
  meta: CorpusMeta;
}

/** One observed breach of a gate. Any violation at all fails an absolute gate. */
export interface Violation {
  gate: string;
  detail: string;
}

export interface GateResult {
  gate: string;
  passed: boolean;
  violations: Violation[];
  /** Gate-specific numbers worth reporting even on a pass. */
  measures?: Record<string, number>;
}

/**
 * What a gate is handed. The output is already computed, because several gates
 * need the same transformation and running it per gate would make C10's
 * latency measurement meaningless.
 */
export interface Subject {
  document: CorpusDocument;
  input: string;
  output: string;
  /** Result of transforming the output again. C9's material. */
  reoutput: string;
  /** Wall-clock milliseconds for the first transformation. */
  durationMs: number;
  /** Set when the transform refused the page. Gates read it, they do not throw. */
  refusal: string | null;
  /**
   * Whether the transformation under test is capable of refusing at all.
   * Identity is not, so asserting a refusal against it is a category error
   * rather than a finding, and gate R stands down.
   */
  canRefuse: boolean;
}

/**
 * Both renders of one document, when a browser was available. Null when the
 * suite ran without one, which is the every-push cadence.
 */
export interface RenderedSubject {
  input: RenderResult;
  output: RenderResult;
}

export interface Gate {
  id: string;
  name: string;
  /**
   * Absolute gates fail the run on a single violation. C10 is the only
   * threshold gate, and its threshold is calibrated at CP-0 and only ever
   * tightened.
   */
  absolute: boolean;
  check(subject: Subject, rendered: RenderedSubject | null): GateResult | Promise<GateResult>;
}

/** The transformation under test. Identity is the CP-0 subject. */
export interface TransformUnderTest {
  name: string;
  /** False for transformations that have no refusal path, such as identity. */
  canRefuse: boolean;
  run(html: string, seed: string): { html: string };
}

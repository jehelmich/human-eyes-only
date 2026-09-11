/**
 * Turning a corpus document into something the gates can inspect.
 *
 * A refusal is a first-class outcome, not an error. HEO is designed to refuse
 * pages it cannot protect — hydrated SSR, uncontainable side channels — and a
 * harness that treated refusal as a crash could not express CP-1's assertion
 * that a T3 document transforming successfully is a *failure*.
 */

import type { CorpusDocument, Subject, TransformUnderTest } from "./types.ts";

/** A stable seed per document, so two runs of one commit are comparable. */
export function seedFor(document: CorpusDocument): string {
  return `cp0:${document.id}`;
}

function attempt(
  transform: TransformUnderTest,
  html: string,
  seed: string,
): { html: string; refusal: string | null; durationMs: number } {
  const started = performance.now();
  try {
    const result = transform.run(html, seed);
    return { html: result.html, refusal: null, durationMs: performance.now() - started };
  } catch (error) {
    const named = error as { name?: string; message?: string };
    return {
      html,
      refusal: `${named.name ?? "Error"}: ${named.message ?? String(error)}`,
      durationMs: performance.now() - started,
    };
  }
}

export function buildSubject(document: CorpusDocument, transform: TransformUnderTest): Subject {
  const seed = seedFor(document);
  const first = attempt(transform, document.input, seed);
  const second =
    first.refusal === null
      ? attempt(transform, first.html, seed)
      : { html: first.html, refusal: first.refusal, durationMs: 0 };

  return {
    document,
    input: document.input,
    output: first.html,
    reoutput: second.html,
    durationMs: first.durationMs,
    refusal: first.refusal,
    canRefuse: transform.canRefuse,
  };
}

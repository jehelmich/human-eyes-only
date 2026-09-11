/**
 * Publisher markup errors — the elements are the input surface, so a mistake in
 * one is a refusal rather than a shrug.
 *
 * Everything HEO does comes from three elements the publisher writes by hand.
 * That makes the markup the configuration, and it makes every way of getting
 * one wrong a way of shipping a page that looks protected
 * and is not:
 *
 * - a `heo-protect` that wraps no text protects nothing;
 * - a substitute list that does not parse leaves the span with no substitute at
 * all, which is the difference between a wrong answer and a missing one, and a
 * missing one is what the decoy exists to prevent;
 * - a substitute equal to the value it replaces hands the value back;
 * - a `heo-chaff` carrying `options` and content has swallowed the publisher's
 *   prose into a node HEO is about to conceal.
 *
 * None of those is detectable by looking at the page, because HEO removes the
 * element before serializing — which is exactly what makes them undiscoverable.
 * The proportionate response to "this markup did nothing" is to say so on the
 * first request rather than on the day someone notices the figure in the
 * response.
 *
 * This is a *markup* error and not an `onUnprotectable` one. That switch exists
 * for a judgement the publisher can reasonably make differently — publish a
 * value in the clear knowingly — and there is no reading of malformed markup
 * under which serving the page is what the publisher meant.
 */

/** One thing wrong with the publisher's markup, and where. */
export interface MarkupProblem {
  /** The element, and the attribute on it when one is at fault. */
  source: string;
  /** An excerpt identifying the element, for the operator's log. */
  where: string;
  /** What is wrong, as a sentence fragment following "because". */
  reason: string;
  /** What to do about it. */
  remedy: string;
}

export class HeoMarkupError extends Error {
  readonly problems: MarkupProblem[];

  constructor(problems: MarkupProblem[]) {
    const sample = problems
      .slice(0, 5)
      .map(
        (problem) =>
          `  <${problem.source}> on ${problem.where}: ${problem.reason}\n    ${problem.remedy}`,
      )
      .join("\n");
    super(
      `HEO refused to serve: ${problems.length} piece(s) of publisher markup do nothing as written.\n` +
        `${sample}\n` +
        "HEO removes these elements before serializing, so markup that does nothing is " +
        "invisible in the output. Fix the markup rather than the configuration.",
    );
    this.name = "HeoMarkupError";
    this.problems = problems;
  }
}

/** A short, safe identifier for an element in an error message. */
export function describeElement(tagName: string, text: string): string {
  const excerpt = text.replace(/\s+/gu, " ").trim().slice(0, 48);
  return excerpt === "" ? `<${tagName}>` : `<${tagName}> ${JSON.stringify(excerpt)}`;
}

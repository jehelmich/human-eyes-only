/**
 * Coverage — every span the publisher pointed at is transformed, or the page is
 * not served.
 *
 * The publisher writes `<heo-protect>` around a value. If HEO then serves that
 * value as ordinary text, they get a page that looks protected and publishes the
 * figure on every load, and nothing on the page says so. That is the failure
 * mode invariant 7 exists to close.
 *
 * Three things reach here.
 *
 * *A mark, or a shuffle, that encloses an element.* `<em>$4.2</em>M` is two text
 * nodes; a permutation that moves an arbitrary element moves its whole subtree.
 * Every mechanism here works on text, which is what makes invariant 4 a
 * property of the shape rather than of a walk over the skip list.
 *
 * *A shuffle with fewer than three units.* Permuting one word is not a
 * permutation. The publisher marks a longer run, or leaves it to the carrier.
 *
 * *No generator.* A carrier is the only thing `heo-protect` means, so a mark on
 * a page with no generator configured is a mark nothing can take. That is a
 * configuration fault rather than a markup one and it says so
 * (guards/carrier.ts), but under `onUnprotectable: "warn"` it lands here like
 * any other unprotectable span — which is how the compatibility corpus runs the
 * mechanisms a corpus document can actually exercise.
 *
 * `onUnprotectable: "warn"` publishes them knowingly.
 */

import type { Unprotectable } from "../parser/marks.js";

export class HeoCoverageError extends Error {
  readonly spans: readonly Unprotectable[];

  constructor(spans: readonly Unprotectable[]) {
    const sample = spans
      .slice(0, 5)
      .map((span) => `  ${span.where}: ${span.reason}`)
      .join("\n");
    super(
      `HEO refused to serve: ${spans.length} span(s) the publisher marked could not be ` +
        `transformed.\n${sample}\n` +
        "Every mechanism here works on text: a mark holds a value and nothing else, and a " +
        "shuffle holds words and marks. Reduce the markup to that, or set " +
        'onUnprotectable: "warn" to publish those spans in the clear knowingly.',
    );
    this.name = "HeoCoverageError";
    this.spans = spans;
  }
}

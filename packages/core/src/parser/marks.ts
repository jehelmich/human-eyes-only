/**
 * The publisher's markup surface.
 *
 * Three elements, each naming one mechanism, and nothing else to configure.
 *
 * ```html
 * <p>
 *   <heo-shuffle>Revenue reached
 *     <heo-protect alt='["$3.9M","$4.6M"]'>$4.2M</heo-protect> this quarter.
 *   </heo-shuffle>
 *   <heo-chaff>Segment margins tracked ahead of plan.</heo-chaff>
 * </p>
 * ```
 *
 * `heo-protect` is a carrier: the value is drawn as outlines and leaves the
 * response. `heo-shuffle` is a permutation over its own content. `heo-chaff` is
 * one noise node, exactly where it is written. The markup is the configuration
 * — there is no strategy toggle to disagree with it, because an element that
 * names a mechanism cannot be overruled by an option that names the same one.
 *
 * **Lists are JSON, always**: `alt='["a","b"]'`, `options='["a","b"]'`. One code
 * path, and malformed JSON is a refusal naming the element and the parse error.
 * The bare-string shorthand the attribute surface allowed is gone; it was a
 * second parse of the same field and it made `alt="[oops"` a value rather than
 * a mistake.
 *
 * **No `heo-*` element survives serialization**, which is a correctness
 * requirement rather than tidiness. Shipped, they are an index of exactly which
 * spans are protected and they hand over the candidate list an attacker would
 * otherwise have to resolve.
 *
 * **`heo-decoy` is reserved and not built.** It is the future name for a
 * decoy carrier — a carrier drawing text that genuinely says what it says, so
 * that the presence of an SVG stops being evidence that a value was removed.
 * Writing one today is a refusal rather than a no-op, for the same reason every
 * other inert piece of markup is: HEO strips the element on the way out, so
 * nothing in the response would say it did nothing.
 */

import { describeElement, type MarkupProblem } from "../guards/markup.js";
import {
  childrenOf,
  type Document,
  type Element,
  getAttr,
  isElement,
  isTextNode,
  type Node,
  replaceChild,
  walk,
} from "./dom.js";

/** One protected span. Always a carrier; `alt` supplies the text channel. */
export const PROTECT_TAG = "heo-protect";
/** One noise node, here. Content is what it says, or `options` is a list. */
export const CHAFF_TAG = "heo-chaff";
/** The one container: `reorder` permutes the words inside it. */
export const SHUFFLE_TAG = "heo-shuffle";
/** Reserved for the decoy carrier. Writing one is a refusal, not a no-op. */
export const DECOY_TAG = "heo-decoy";

/** Everything HEO reads from the publisher, and therefore everything it strips. */
export const HEO_TAGS: readonly string[] = [PROTECT_TAG, CHAFF_TAG, SHUFFLE_TAG, DECOY_TAG];

/** Substitutes for the text channel a carrier vacates. JSON array of strings. */
export const ALT_ATTR = "alt";
/** Sentences a chaff node may say, one drawn per load. JSON array of strings. */
export const OPTIONS_ATTR = "options";
/** `word` (default) or `phrase`: how much of a mark one carrier draws. */
export const UNIT_ATTR = "unit";
/** Computed type size in CSS pixels, overriding `carrier.fontSizePx` here. */
export const SIZE_ATTR = "size";

/** A mark holds text, never markup. Contents are never transformed. */
export const SKIPPED_TAGS: ReadonlySet<string> = new Set([
  "code",
  "pre",
  "script",
  "style",
  "textarea",
  "input",
  "select",
  "option",
  "button",
  "svg",
  "math",
  "template",
  "head",
  "title",
]);

export type CarrierUnit = "word" | "phrase";

const UNITS: ReadonlySet<string> = new Set(["word", "phrase"]);

/**
 * One `heo-protect`.
 *
 * A mark holds text and nothing else. That is not a rule enforced by a walk
 * over the skip list, it is the shape of the element: a mark enclosing any
 * element at all is unprotectable, because no strategy takes a span straddling
 * an element boundary. Invariant 4 follows structurally.
 */
export interface Mark {
  id: string;
  element: Element;
  /** The element's text exactly as written, for the `warn` path. */
  raw: string;
  /** `raw` trimmed: the value itself. */
  text: string;
  /** Publisher-supplied replacements for the text channel, in written order. */
  substitutes: readonly string[];
  /** `size` on this element, or null for the document's own. */
  sizePx: number | null;
  unit: CarrierUnit;
}

/** One `heo-chaff`. The element is the placement site; it needs no host. */
export interface ChaffMark {
  element: Element;
  /** What it may say. One entry when the publisher wrote prose as content. */
  options: readonly string[];
}

export type ShufflePart = { kind: "text"; value: string } | { kind: "mark"; mark: Mark };

/** One `heo-shuffle`, with its content already split into permutable parts. */
export interface ShuffleMark {
  element: Element;
  parts: ShufflePart[];
  /** Units a permutation would have. Below three there is nothing to permute. */
  units: number;
}

export type Directive =
  | { kind: "protect"; mark: Mark }
  | { kind: "chaff"; chaff: ChaffMark }
  | { kind: "shuffle"; shuffle: ShuffleMark };

/**
 * A span HEO was pointed at and cannot take. Never silently served as text:
 * `onUnprotectable` decides, and its default is to refuse (guards/coverage.ts).
 */
export interface Unprotectable {
  where: string;
  reason: string;
}

export interface Discovery {
  /** Top-level directives in document order. A shuffle owns its own marks. */
  directives: Directive[];
  /** Every mark, including the ones a shuffle owns. Document order. */
  marks: Mark[];
  problems: MarkupProblem[];
  unprotectable: Unprotectable[];
}

function problem(source: string, where: string, reason: string, remedy: string): MarkupProblem {
  return { source, where, reason, remedy };
}

export function wordsOf(text: string): string[] {
  return text.match(/\S+/gu) ?? [];
}

/**
 * A JSON array of non-empty strings.
 *
 * Malformed input **fails the page** rather than being dropped. The list is the
 * whole of what a machine gets where a carrier used to be, so a list that does
 * not parse leaves a hole where a wrong answer should have been — and nothing
 * in the response says so, because the element carrying the mistake was removed
 * on the way out.
 */
function parseList(
  raw: string,
  source: string,
  where: string,
  problems: MarkupProblem[],
): string[] {
  const reject = (reason: string): string[] => {
    problems.push(
      problem(
        source,
        where,
        reason,
        `Write a JSON array of non-empty strings, for example ${source}='["one","two"]'. ` +
          `Got ${JSON.stringify(raw.slice(0, 60))}.`,
      ),
    );
    return [];
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch (error) {
    return reject(`it is not valid JSON: ${(error as Error).message}`);
  }
  if (!Array.isArray(parsed)) return reject("it is JSON but not an array");

  const entries: string[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "string") {
      return reject(`the array holds a ${typeof entry} where a string was expected`);
    }
    if (entry.trim() === "") return reject("the array holds an empty string");
    entries.push(entry);
  }
  return entries;
}

/** Anything HEO already produced, keyed on the class real runs and chaff share. */
function isOwnOutput(element: Element): boolean {
  const classes = getAttr(element, "class");
  return classes !== null && / ?heo-g ?/.test(` ${classes} `);
}

function textOf(element: Element): string {
  let value = "";
  for (const child of childrenOf(element)) {
    if (isTextNode(child)) value += child.value;
  }
  return value;
}

interface Frame {
  /** The nearest skipped ancestor's tag, or null. */
  skipped: string | null;
  /** The nearest enclosing `heo-*` tag, or null. */
  inside: string | null;
}

/**
 * Every element the publisher wrote, and every way of writing one that does
 * nothing.
 *
 * One walk, because an element locates itself and nothing here is inherited.
 * That is the whole of what the attribute surface needed a context frame for:
 * `size` and `unit` were written above the mark and resolved downward, which
 * meant a second class of mistake — an attribute no mark beneath it inherits —
 * and a rule for what happens when two ancestors disagree. On the element they
 * are properties of the mark they configure, and both classes of mistake are
 * gone with the inheritance.
 */
export function discoverMarkup(document: Document): Discovery {
  const directives: Directive[] = [];
  const marks: Mark[] = [];
  const problems: MarkupProblem[] = [];
  const unprotectable: Unprotectable[] = [];

  const sizeOn = (element: Element, where: string): number | null => {
    const raw = getAttr(element, SIZE_ATTR);
    if (raw === null) return null;
    const value = Number(raw.trim());
    if (!Number.isFinite(value) || value <= 0) {
      problems.push(
        problem(
          `${element.tagName} ${SIZE_ATTR}`,
          where,
          "the value is not a positive number of CSS pixels",
          `Write the computed type size, for example ${SIZE_ATTR}="32". ` +
            `Got ${JSON.stringify(raw.slice(0, 32))}.`,
        ),
      );
      return null;
    }
    return value;
  };

  const unitOn = (element: Element, where: string): CarrierUnit => {
    const raw = getAttr(element, UNIT_ATTR);
    if (raw === null) return "word";
    const value = raw.trim();
    if (!UNITS.has(value)) {
      problems.push(
        problem(
          `${element.tagName} ${UNIT_ATTR}`,
          where,
          "the value names no carrier unit",
          `Write ${UNIT_ATTR}="word" to draw one carrier per word, or "phrase" to draw the ` +
            `whole mark as one. Got ${JSON.stringify(raw.slice(0, 32))}.`,
        ),
      );
    }
    return value === "phrase" ? "phrase" : "word";
  };

  /** A `heo-protect`, or null when it holds something no strategy can take. */
  const claimMark = (element: Element): Mark | null => {
    const raw = textOf(element);
    const text = raw.trim();
    const where = describeElement(element.tagName, text);

    for (const child of childrenOf(element)) {
      if (!isElement(child)) continue;
      if (HEO_TAGS.includes(child.tagName)) {
        problems.push(
          problem(
            child.tagName,
            where,
            `it is inside <${element.tagName}>, which already owns this content`,
            `Remove the inner element, or move it outside the <${element.tagName}> that encloses it.`,
          ),
        );
        return null;
      }
      unprotectable.push({
        where,
        reason: `it encloses <${child.tagName}>, and no strategy takes a span that straddles an element boundary`,
      });
      return null;
    }

    if (text === "") {
      problems.push(
        problem(
          element.tagName,
          describeElement(element.tagName, ""),
          "it wraps no text, so there is nothing to protect",
          `Put <${PROTECT_TAG}> around the value itself, not around an empty or image-only element.`,
        ),
      );
      return null;
    }

    const substitutes: string[] = [];
    const alt = getAttr(element, ALT_ATTR);
    if (alt !== null) {
      for (const candidate of parseList(alt, `${element.tagName} ${ALT_ATTR}`, where, problems)) {
        // A substitute equal to the value it replaces hands back the truth, and
        // a set containing the true value is not a set.
        if (candidate.trim() === text) {
          problems.push(
            problem(
              `${element.tagName} ${ALT_ATTR}`,
              where,
              "a substitute is identical to the value it would replace",
              "Remove it. A substitute equal to the protected value publishes the value.",
            ),
          );
          continue;
        }
        substitutes.push(candidate);
      }
    }

    const mark: Mark = {
      id: `m${marks.length}`,
      element,
      raw,
      text,
      substitutes,
      sizePx: sizeOn(element, where),
      unit: unitOn(element, where),
    };
    marks.push(mark);
    return mark;
  };

  /**
   * A `heo-chaff`, or null when it says nothing.
   *
   * The trap this catches is the one a publisher will actually write. HTML has
   * no self-closing syntax for a non-void element, so `<heo-chaff options="…" />`
   * is an *opening* tag and the prose after it becomes the element's content —
   * content HEO would then conceal, deleting text the reader was meant to see.
   * The slash is unrecoverable after parsing; the shape is not.
   */
  const claimChaff = (element: Element): ChaffMark | null => {
    const raw = textOf(element);
    const options = getAttr(element, OPTIONS_ATTR);
    const where = describeElement(element.tagName, raw.trim());

    if (options !== null) {
      if (childrenOf(element).length > 0) {
        problems.push(
          problem(
            `${element.tagName} ${OPTIONS_ATTR}`,
            where,
            "it carries options and also has content, so one of the two would be discarded",
            `HTML has no self-closing syntax for <${CHAFF_TAG}>, so <${CHAFF_TAG} ${OPTIONS_ATTR}="…" /> ` +
              `opens the element and everything after it becomes its content — which HEO would ` +
              `conceal. Close it explicitly: <${CHAFF_TAG} ${OPTIONS_ATTR}="…"></${CHAFF_TAG}>.`,
          ),
        );
        return null;
      }
      const entries = parseList(options, `${element.tagName} ${OPTIONS_ATTR}`, where, problems);
      return entries.length === 0 ? null : { element, options: entries };
    }

    if (raw.trim() === "") {
      problems.push(
        problem(
          element.tagName,
          where,
          "it says nothing, so there is no noise node to place",
          `Write the sentence as content, or a list of them as ${OPTIONS_ATTR}='["one","two"]'.`,
        ),
      );
      return null;
    }
    return { element, options: [raw.trim()] };
  };

  /**
   * A `heo-shuffle`, or null when its content is not something to permute.
   *
   * Text and marks only. A permutation moves its items past each other, and an
   * arbitrary element moved that way takes its own subtree with it — which is
   * the same boundary rule a mark obeys, applied to the container. A shuffle
   * that fails this is left alone and its children are visited as ordinary
   * content, so a mark inside it is still a mark.
   */
  const claimShuffle = (element: Element): ShuffleMark | null => {
    const parts: ShufflePart[] = [];
    let units = 0;

    for (const child of childrenOf(element)) {
      if (isTextNode(child)) {
        parts.push({ kind: "text", value: child.value });
        units += wordsOf(child.value).length;
        continue;
      }
      if (!isElement(child)) continue;
      if (child.tagName !== PROTECT_TAG) {
        if (HEO_TAGS.includes(child.tagName)) {
          problems.push(
            problem(
              child.tagName,
              describeElement(element.tagName, ""),
              `it is inside <${element.tagName}>, which already owns this content`,
              `Remove the inner element, or move it outside the <${element.tagName}> that encloses it.`,
            ),
          );
          return null;
        }
        unprotectable.push({
          where: describeElement(element.tagName, textOf(element).trim()),
          reason: `it encloses <${child.tagName}>, and reorder permutes text and <${PROTECT_TAG}> only`,
        });
        return null;
      }
      const mark = claimMark(child);
      if (mark === null) return null;
      parts.push({ kind: "mark", mark });
      units += mark.unit === "phrase" ? 1 : wordsOf(mark.text).length;
    }

    return { element, parts, units };
  };

  const visit = (node: Node, frame: Frame): void => {
    if (!isElement(node)) {
      for (const child of childrenOf(node)) visit(child, frame);
      return;
    }
    if (isOwnOutput(node)) return;

    const tag = node.tagName;
    if (!HEO_TAGS.includes(tag)) {
      const inner: Frame = {
        skipped: SKIPPED_TAGS.has(tag) ? (frame.skipped ?? tag) : frame.skipped,
        inside: frame.inside,
      };
      for (const child of childrenOf(node)) visit(child, inner);
      return;
    }

    const where = describeElement(tag, textOf(node).trim());

    if (tag === DECOY_TAG) {
      problems.push(
        problem(
          tag,
          where,
          "it is reserved for the decoy carrier and is not implemented",
          `Remove it. <${DECOY_TAG}> is the future name for a carrier that draws text meaning ` +
            "what it says, so that an SVG stops being evidence a value was removed. " +
            "Nothing reads it today.",
        ),
      );
      return;
    }

    if (frame.skipped !== null) {
      problems.push(
        problem(
          tag,
          where,
          `it is inside <${frame.skipped}>, which HEO never transforms (invariant 4)`,
          `Move <${tag}> outside the skipped element, or accept that the value is published there.`,
        ),
      );
      return;
    }

    if (frame.inside !== null && !(frame.inside === SHUFFLE_TAG && tag === PROTECT_TAG)) {
      problems.push(
        problem(
          tag,
          where,
          `it is inside <${frame.inside}>, which already owns this content`,
          `Remove the inner element, or move it outside the <${frame.inside}> that encloses it.`,
        ),
      );
      return;
    }

    if (tag === PROTECT_TAG) {
      const mark = claimMark(node);
      if (mark !== null) directives.push({ kind: "protect", mark });
      return;
    }

    if (tag === CHAFF_TAG) {
      const chaff = claimChaff(node);
      if (chaff !== null) directives.push({ kind: "chaff", chaff });
      return;
    }

    const reported = problems.length;
    const shuffle = claimShuffle(node);
    if (shuffle !== null) {
      directives.push({ kind: "shuffle", shuffle });
      return;
    }
    // Saying why it is unusable is enough: the page is already refused, and
    // walking the children again would report the same element a second time
    // and overstate the count of distinct problems on the page.
    if (problems.length > reported) return;
    // Otherwise its children are ordinary content: a mark inside it is still a
    // mark, and the element itself is unwrapped on the way out like every other
    // one.
    for (const child of childrenOf(node)) visit(child, { skipped: null, inside: SHUFFLE_TAG });
  };

  visit(document, { skipped: null, inside: null });
  return { directives, marks, problems, unprotectable };
}

/**
 * Removes every `heo-*` element left in the document, splicing its children
 * into its place.
 *
 * Normally a no-op: a directive HEO rendered replaced its own element. What
 * reaches here is what `onUnprotectable: "warn"` declined to render, plus a
 * broken shuffle whose children were treated as ordinary content. Gate C12 is
 * the check that nothing reaches the response either way — shipped, a `heo-*`
 * element is an index of exactly what is worth attacking.
 */
export function unwrapHeoElements(document: Document): number {
  const found: Element[] = [];
  walk(document, (node) => {
    if (isElement(node) && HEO_TAGS.includes(node.tagName)) found.push(node);
  });
  // Deepest first: a nested element is spliced into its parent before the
  // parent is spliced into the document.
  for (let index = found.length - 1; index >= 0; index--) {
    const element = found[index] as Element;
    replaceChild(element, [...childrenOf(element)]);
  }
  return found.length;
}

/**
 * C8 — structural non-interference.
 *
 * Invariant 3, checked from the outside: form submissions, user input fields,
 * URLs and author styling come through untouched. These are the parts of a page
 * where a "harmless" transformation is a security defect — a rewritten `action`
 * sends a form somewhere else, a rewritten `value` submits data the user never
 * entered.
 *
 * The check is subset rather than equality, deliberately. HEO adds its own
 * stylesheet and its own markup inside a region, so an output that merely
 * *contains* everything the input had is correct. What would be a violation is
 * one of the input's facts going missing or changing.
 *
 * The `style` attribute is the exception, and it is equality in both
 * directions. HEO emits none at all: concealment is a class in the injected
 * stylesheet, because a nonce authorises a `<style>` element and has no meaning
 * for an attribute, so a single attribute creeping back reinstates a refusal
 * for every page with a strict policy. That is a property of the engine's
 * output shape rather than of any one document, so it is asserted on every
 * document — a regression fails the whole corpus rather than the one page that
 * happens to carry a CSP.
 */

import { getAttr, isElement, parseDocument, walk } from "../../runner/dom.ts";
import type { Gate, GateResult, Subject, Violation } from "../../runner/types.ts";

const URL_ATTRS = ["href", "src", "action", "formaction", "poster", "cite", "srcset", "data"];

const CONTROL_TAGS = new Set([
  "form",
  "input",
  "select",
  "textarea",
  "button",
  "option",
  "optgroup",
  "label",
  "fieldset",
]);

/**
 * The facts a transformation must preserve, as a multiset. Counting matters:
 * two identical hidden inputs are not the same form as one.
 */
function structuralFacts(html: string): Map<string, number> {
  const facts = new Map<string, number>();
  const add = (fact: string): void => {
    facts.set(fact, (facts.get(fact) ?? 0) + 1);
  };

  walk(parseDocument(html), (node) => {
    if (!isElement(node)) return;

    for (const name of URL_ATTRS) {
      const value = getAttr(node, name);
      if (value !== null) add(`url ${node.tagName}[${name}]=${value}`);
    }

    if (CONTROL_TAGS.has(node.tagName)) {
      const attrs = node.attrs
        .map((attr) => `${attr.name}=${attr.value}`)
        .sort()
        .join(" ");
      add(`control <${node.tagName} ${attrs}>`);
    }

    const style = getAttr(node, "style");
    if (style !== null) add(`style-attr ${style}`);
  });

  return facts;
}

export const c8Structure: Gate = {
  id: "C8",
  name: "structural non-interference",
  absolute: true,

  check(subject: Subject): GateResult {
    const violations: Violation[] = [];
    const before = structuralFacts(subject.input);
    const after = structuralFacts(subject.output);

    for (const [fact, count] of before) {
      const seen = after.get(fact) ?? 0;
      if (seen < count) {
        violations.push({
          gate: "C8",
          detail: `lost ${count - seen} of ${count}: ${fact.slice(0, 120)}`,
        });
      }
    }

    // The one fact that may not be added either. A document whose own author
    // wrote a `style` attribute keeps it; HEO contributes none.
    for (const [fact, count] of after) {
      if (!fact.startsWith("style-attr ")) continue;
      const had = before.get(fact) ?? 0;
      if (count > had) {
        violations.push({
          gate: "C8",
          detail: `added ${count - had} style attribute: ${fact.slice(0, 120)}`,
        });
      }
    }

    return {
      gate: "C8",
      passed: violations.length === 0,
      violations,
      measures: { facts: before.size },
    };
  },
};

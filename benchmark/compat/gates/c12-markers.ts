/**
 * C12 — no span-level marker survives.
 *
 * HEO announces itself at document level and never at span level. Since the
 * publisher's markup *is* the protected set, an output that still carries it
 * hands over an index of exactly which spans are worth vision compute and,
 * where the publisher wrote candidates, the candidate list an attacker would
 * otherwise have to resolve. A surviving `<heo-shuffle>` narrows the search to
 * the subtree worth rasterising, and the `debug` attributes label every span.
 *
 * Two shapes are checked, because there are two ways to leak one. Under
 * attributes it was a `data-heo*` attribute left on an element; under elements
 * it is the element itself, which has to be unwrapped rather than stripped. The
 * attribute half is kept: `debug` still emits `data-heo-mark-id`, and an
 * output carrying one is an output nobody should be serving.
 *
 * Why a gate rather than a unit test. This is the one property that scales with
 * the corpus rather than with the engine: every marked document is a chance to
 * miss an element on some path the unit tests do not walk — inside a
 * `<template>`, inside a skipped subtree, inside a shuffle that could not be
 * permuted, inside a `heo-chaff` that said nothing. It was checked by breaking
 * it: with `unwrapHeoElements` made a no-op the engine still scored a clean
 * 29/29 on every other gate.
 *
 * Conditioned on the document marker, which is exactly "HEO transformed this
 * page". The identity transform emits none, so it passes vacuously — as it must,
 * since its output is the input and the input is where these elements belong.
 */

import { getAttr, isElement, parseDocument, walk } from "../../runner/dom.ts";
import type { Gate, GateResult, Subject, Violation } from "../../runner/types.ts";

const MAX_REPORTED = 8;

/** Written here rather than imported, so the gate does not agree with itself. */
const HEO_TAGS = new Set(["heo-protect", "heo-chaff", "heo-shuffle", "heo-decoy"]);

function hasDocumentMarker(html: string): boolean {
  let found = false;
  walk(parseDocument(html), (node) => {
    if (isElement(node) && node.tagName === "meta" && getAttr(node, "name") === "heo") {
      found = true;
    }
  });
  return found;
}

export const c12Markers: Gate = {
  id: "C12",
  name: "no span-level marker survives",
  absolute: true,

  check(subject: Subject): GateResult {
    const violations: Violation[] = [];
    let markers = 0;

    const report = (detail: string): void => {
      if (violations.length < MAX_REPORTED) violations.push({ gate: "C12", detail });
    };

    if (subject.refusal === null && hasDocumentMarker(subject.output)) {
      walk(parseDocument(subject.output), (node) => {
        if (!isElement(node)) return;
        if (HEO_TAGS.has(node.tagName)) {
          markers++;
          report(`<${node.tagName}> survived into the response`);
        }
        for (const attr of node.attrs) {
          if (!attr.name.startsWith("data-heo")) continue;
          markers++;
          report(
            `<${node.tagName}> still carries ${attr.name}=${JSON.stringify(
              attr.value.slice(0, 60),
            )}`,
          );
        }
      });
    }

    return {
      gate: "C12",
      passed: violations.length === 0,
      violations,
      measures: { markers },
    };
  },
};

/**
 * Concealment neutrality.
 *
 * Not a per-document gate, because it is not a property of documents. Whether a
 * chaff node costs layout is a property of four CSS declaration sets, and the
 * honest way to check four declaration sets is to render them, not to hope one
 * of twenty-nine corpus pages happens to expose the one that is wrong.
 *
 * It exists because one of them was. `max-height` and `overflow` do not apply to
 * a non-replaced inline box and chaff containers are `<span>`s, so the retired
 * `collapsed` kind was an in-flow box the width of its own sentence: one node
 * grew its paragraph from 18 px to 54 px and pushed the publisher's prose down
 * two lines. `isConcealed()` models what the declarations mean and agreed with
 * itself throughout. The 1 px box on the surviving positioned kinds comes from
 * the same run.
 *
 * The assertion is simply that the page renders byte-identically with the chaff
 * node present and absent, at every viewport.
 *
 * The declarations are delivered the way the engine delivers them: an opaque
 * class in the same stylesheet as the runtime rules, never a `style` attribute.
 * That is not cosmetic here. Both `.heo-g` and the concealment class have
 * one-class specificity, so which of `display:inline-flex` and `display:none`
 * wins is decided by source order alone — a check that kept using a `style`
 * attribute would be testing a cascade HEO no longer ships, and would agree
 * happily with a stylesheet whose rules were emitted in the wrong order.
 */

import { ALL_CONCEALMENTS, RUNTIME_CSS } from "@human-eyes-only/core";
import type { Renderer } from "../runner/render.ts";
import type { Violation } from "../runner/types.ts";

/** Long enough that a box which takes space cannot fail to show it. */
const CHAFF =
  "Regional performance was broadly in line with the prior period and the board " +
  "reviewed the hedging policy during the quarter.";

const SENTENCE = "Group revenue reached $4.2M in the second quarter, up from $3.1M a year earlier.";

/**
 * The class the engine would have minted for this concealment, per load. Chaff
 * carries `heo-g` beside it so that it is not separable from a real run by
 * class, which means it inherits `display:inline-flex`: a check that omitted the
 * runtime stylesheet would be testing declarations HEO never actually ships.
 */
const CONCEALMENT_CLASS = "hx";

function page(inner: string, rules = ""): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>c</title>` +
    // The concealment rules follow `RUNTIME_CSS` in one stylesheet because that
    // is the order `injectRuntime` emits them in, and at equal specificity the
    // order is the whole answer.
    `<style>body{margin:0;background:#fff;font:16px/1.5 Georgia,serif}${RUNTIME_CSS}${rules}</style></head>` +
    `<body><p id="host">${SENTENCE}${inner}</p></body></html>`
  );
}

export interface ConcealmentResult {
  kind: string;
  neutral: boolean;
  detail: string;
}

export async function checkConcealments(
  renderer: Renderer,
): Promise<{ results: ConcealmentResult[]; violations: Violation[] }> {
  const control = await renderer.render(page(""));
  const results: ConcealmentResult[] = [];
  const violations: Violation[] = [];

  for (const concealment of ALL_CONCEALMENTS) {
    const attrs = Object.entries(concealment.attrs ?? {})
      .map(([name, value]) => ` ${name}="${value}"`)
      .join("");
    const rules =
      concealment.declarations === null ? "" : `.${CONCEALMENT_CLASS}{${concealment.declarations}}`;
    const inner = `<span class="heo-g ${CONCEALMENT_CLASS}"${attrs}>${CHAFF}</span>`;

    const rendered = await renderer.render(page(inner, rules));
    const problems: string[] = [];

    for (const before of control.captures) {
      const after = rendered.captures.find((capture) => capture.key === before.key);
      if (after === undefined) continue;
      if (before.png.length !== after.png.length || !before.png.equals(after.png)) {
        problems.push(before.key);
      }
    }

    const neutral = problems.length === 0;
    results.push({
      kind: concealment.kind,
      neutral,
      detail: neutral ? "" : `renders differently at ${problems.join(", ")}`,
    });
    if (!neutral) {
      violations.push({
        gate: "concealment",
        detail: `${concealment.kind} is not layout-neutral: ${problems.join(", ")}`,
      });
    }
  }

  return { results, violations };
}

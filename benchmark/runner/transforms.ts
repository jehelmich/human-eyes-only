/**
 * The transformations a suite can be run against.
 *
 * `identity` is not a placeholder. It is CP-0's subject: the harness must score
 * 100% against a transformation that provably changes nothing, and anything
 * less is a bug in the harness rather than in the engine — found while it is
 * still free to fix.
 *
 * **The engine runs here without a generator, and says so.** A carrier is drawn
 * from the publisher's own font file and a corpus document has none: the browser
 * would render the page in whatever face the machine has while the generator drew
 * a different one, so C3's pixel diff would be measuring the distance between two
 * fonts (`benchmark/compat/carrier.ts` makes the same argument at length and is
 * where carrier fidelity is actually checked, against one font embedded in its own
 * page).
 *
 * That argument is exactly right about C3 and wrong about everything else. The
 * eight static gates never look at a pixel, so a font mismatch is no reason to
 * keep carriers out of them — and without them the headline mechanism was
 * structurally ungated across all twenty-nine documents: not one carrier
 * survived a reparse, an idempotence pass, a budget, a marker strip or a table
 * cell in the whole corpus.
 *
 * So there are two engine transforms. `heo` runs everywhere with
 * `onUnprotectable: "warn"` — the publisher's knowing choice to serve a marked
 * span as text — and is the one the browser gates use. `heo-carrier` draws real
 * carriers from a real font and is for the static gates, where the question is
 * what the markup does and the face it was drawn in does not matter.
 */

import { transformHtml } from "@human-eyes-only/core";
import { createCarrierRenderer } from "@human-eyes-only/generator/host";
import { buildTestFont } from "../compat/testfont.ts";
import type { TransformUnderTest } from "./types.ts";

/** Built once: instantiating the module per document would dominate the run. */
let renderer: ReturnType<typeof createCarrierRenderer> | null = null;
function corpusRenderer() {
  renderer ??= createCarrierRenderer({ font: buildTestFont() });
  return renderer;
}

export const identityTransform: TransformUnderTest = {
  name: "identity",
  canRefuse: false,
  run(html) {
    return { html };
  },
};

export const heoTransform: TransformUnderTest = {
  name: "heo",
  canRefuse: true,
  run(html, seed) {
    return {
      html: transformHtml(html, { seed, onUnprotectable: "warn" }).html,
    };
  },
};

/**
 * The engine with carriers actually drawn.
 *
 * The font is `compat/testfont.ts`, built in memory. No file, no fetch, no
 * dependency: a benchmark that needs an artifact someone has to install first
 * is a benchmark that stops running. It is not the face a corpus document
 * would render in, which is why this transform is for the static gates only —
 * C3 would be measuring the distance between two fonts rather than a defect.
 *
 * `warn` for the same reason `heo` uses it, one step further in. The test font
 * covers Latin, and no outline exists for `T4-adversarial/rtl-arabic`; no
 * fallback fixes that, because a fallback covers a stray glyph and not a
 * script. Refusing there would make the corpus a statement about the test
 * font's character coverage rather than about
 * the engine, so that document serves its marked span as text and every other
 * document draws carriers.
 */
export const heoCarrierTransform: TransformUnderTest = {
  name: "heo-carrier",
  canRefuse: true,
  run(html, seed) {
    return {
      html: transformHtml(html, {
        seed,
        onUnprotectable: "warn",
        carrier: { renderer: corpusRenderer(), fontSizePx: 16 },
      }).html,
    };
  },
};

export const TRANSFORMS: Record<string, TransformUnderTest> = {
  identity: identityTransform,
  heo: heoTransform,
  "heo-carrier": heoCarrierTransform,
};

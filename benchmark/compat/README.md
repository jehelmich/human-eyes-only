# compat — the compatibility gate

Answers one question, on every change: **how much real-world HTML can HEO touch
without breaking it?**

For each corpus document, render the original and the transformed version and
assert they are equivalent everywhere a human or a legitimate consumer can
observe.

| ID  | Gate                        | Assertion                                                         |
| --- | --------------------------- | ----------------------------------------------------------------- |
| C1  | Re-parse stability          | Output re-parses; parse-serialize is a fixed point                 |
| C2  | Visible text identity       | Rendered `innerText` byte-identical before and after               |
| C3  | Visual fidelity             | Pixel diff below threshold, 3 viewports, light and dark            |
| C4  | Clean console               | No new errors, CSP violations, or hydration warnings               |
| C5  | Executable script untouched | Every non-data `<script>` byte-identical                           |
| C8  | Structural non-interference | Forms, inputs, styles, and URLs byte-identical                     |
| C9  | Idempotence                 | `transform(transform(x))` equals `transform(x)`                    |
| C10 | Budget                      | Within byte and latency budget for the document's size class       |
| C11 | Side-channel containment    | Protected text appears nowhere untransformed in the response       |

C1–C9 and C11 are absolute — one violation fails the run. C10 is a threshold,
calibrated at CP-0 and only ever tightened.

**C11 matters most.** It scans the entire response — serialized payloads,
JSON-LD, meta tags, `<noscript>`, `data-*` — for the protected region's source
text. Failing it means HEO degraded a page while protecting nothing, which is the
worst outcome available.

C2 no longer compares `innerText`; carriers make it empty by construction.
Correctness is established visually instead, with C3 as the per-commit signal and
a slower periodic OCR check against ground truth.

Accessibility tree, clipboard, and find-in-page consequences are accepted losses.
They are asserted absent so the documentation stays accurate, but they do not
gate.

The headline output is the **compatibility score**: percentage of documents per
tier transformed with zero violations, reported by failure cause.

**Compatibility is a gate; protection is a score. Never trade a gate for a
score.** See [ROADMAP.md](../../ROADMAP.md).

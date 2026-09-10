# extraction — the protection score

The extractor matrix from SPEC.md section 29, with one addition that matters:
**every extractor reports cost alongside accuracy.** HEO's claim is economic, so
accuracy without cost does not evaluate it.

| Extractor              | Tier | Reports                                     |
| ---------------------- | ---- | ------------------------------------------- |
| `raw-html`             | A    | accuracy, wall-clock, bytes fetched         |
| `cheerio`              | B    | accuracy, wall-clock, CPU-seconds           |
| `readability`          | B    | accuracy, wall-clock, CPU-seconds           |
| `playwright` innerText | C    | accuracy, wall-clock, CPU-seconds, RAM peak |
| `playwright` visual    | C    | accuracy, wall-clock, CPU-seconds, RAM peak |
| `ocr`                  | D    | accuracy, wall-clock, CPU-seconds, RAM peak |

The headline is a **pair**, not a number:

- **cost to reach a fidelity target** — SPEC.md §31's axis
- **cost to reach a _verified_ fidelity target** — fidelity the extractor can
  itself confirm

The gap between those columns is the product. 97% fidelity with errors
concentrated in load-bearing tokens and no signal about where they are is not 97%
of the value; for autonomous use it is close to zero.

Supporting metrics:

- **silent corruption rate** — fluent, confident, wrong. The mechanism behind the
  gap.
- **cost ratio** — attacker CPU-seconds per correctly extracted page, relative to
  raw extraction of untransformed HTML.
- **amortized cost ratio** — the same under a re-crawl model. Seeded determinism
  lets an attacker resolve a page once and cache it forever, so this will be far
  lower, and it is the number the README's claim has to be true of.
- **detection cost** — CPU-seconds to identify a page as HEO-protected.
- **pipeline cost** — wall-clock added by inserting a vision stage into a
  throughput pipeline, separate from the compute bill. Likely the larger deterrent.

## Score per span class, never per document

A document-level average hides the entire effect. Only a handful of load-bearing
spans are protected, so 97% document fidelity is compatible with 0% recovery of
every figure that mattered.

Report protected spans, relation sets, and the document separately. **Relation
sets score jointly and unforgivingly**: recovering one side of a comparison while
missing the other is a miss, because a range is not an actionable value.

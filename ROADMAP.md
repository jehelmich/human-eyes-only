# Roadmap

Status: **pre-v0.1**. The pipeline runs end to end — parse, read the publisher's
`heo-*` elements, draw carriers, permute shuffles, build chaff, remove the
elements, serve — with the invariants under test and the compatibility gate built.
Three rungs of the ladder exist; the fourth, candidate sets and the extraction
suite do not. [docs/design.md](docs/design.md) is how it works; this file is what
is left.

> **Never trade a gate for a score.** `benchmark/compat/` is pass or fail: does
> the page still work. Extraction is continuous: what does it cost, and how often
> does it fail silently. Every protection technique makes a page stranger, and
> without a hard gate the project ratchets toward strangeness one defensible
> increment at a time.

## State

| Component | State |
| --- | --- |
| `@heo/core` parser, guards, assembler | v0 |
| `<heo-protect>` — carrier, plus a decoy wherever `alt` is written | v0; needs a font, which `@heo/middleware` wires |
| `<heo-shuffle>` — permutes its own content, marks included | v0 |
| `<heo-chaff>` — 5 concealments, 2 shapes, publisher prose only | v0 |
| `heo-generator` — `(text, params, seed) -> SVG` | v0, no shaping |
| `@heo/middleware` — buffer, delegate, headers, refuse | v0 |
| `benchmark/compat` — R, C1, C2, C5, C8, C9, C10, C12 | v0 |
| `benchmark/compat` — C3 pixel diff, C4 console, carrier alignment | v0, Playwright |
| `benchmark/corpus` — T0–T4 with ground truth | v0; T0/T3/T4 only, all synthetic |
| `benchmark/optical` — M10's OCR half | v0, standalone Python |
| Decoy carriers (`<heo-decoy>`), candidate sets | not started |
| Extraction suite | not started |

**Compatibility: 29/29 clean on every transform, no waivers**, static and with a
browser, against identity and against the engine, plus 5 of 5 chaff concealments
rendering byte-identically with a node present and absent. The corpus run does
not draw carriers, because a carrier comes from the publisher's font file and a
corpus document has none; carrier alignment is asserted separately against one
font embedded in a page and handed to the generator as the same bytes.

Page weight runs 1.52x input for carriers and 2.29x with decoys and chaff, at
protection rate 1 on a short page, so an upper bound. Latency has two orders of
magnitude of headroom — ~80 µs for 20 carriers against a ~4 ms transform — so
request-scope randomization is not in doubt on that ground, and weight is bounded
by the publisher rather than by the engine.

## Known defects

**A carrier adds a line-break opportunity before punctuation.** One element per
word breaks where the original broke between words, and not around trailing
punctuation: a carrier followed by a comma is a replaced box followed by a text
node, and Chromium will take the break between them. Worked around on the example
page by pulling the punctuation inside the mark, which is a publisher doing the
engine's job. The fix belongs in the renderer.

**Reordered runs do not break across lines.** `order` exists only in flex and
grid, so a permuted run is an inline-level flex container and never fragments
across line boxes: a run that does not fit moves to the next line whole. Runs
are capped at five words to keep this small. It is a typography regression, not
a rendering bug to be tuned away, and the candidate fix — making the paragraph
itself the flex container — is worse, differing by 0.9% of pixels at 1280 px
before any permutation.

## Next

1. **CP-0, extraction half.** The identity baseline and the extractor matrix, plus
   the measurements that are cheap once it exists: M11, M12, M14, M15.
2. **The T1/T2 corpus tiers.** Empty because they are about what real publishers
   emit, and a synthetic document cannot answer that. They need captured pages.
3. **Candidate sets** — several mutually inconsistent values per span rather
   than one. The channels to spread them across are what is missing.
4. **Decoy carriers**, under the reserved `<heo-decoy>`.
5. **CP-1** — the vertical slice, with the assertions declared in advance:
   C1–C9 and C12 clean on T0/T1/T2/T4; T3 refused; identical seed gives
   byte-identical output; no marked span's text anywhere in the response; no
   carrier degrading to readable text when assets are blocked.
6. **CP-2** — turn CP-1's distributions into gates. First point at which the
   project can make a public claim about protection.

Each checkpoint produces a written go/no-go, declares **correctness** in advance
and **magnitude** never: zero violations is knowable without data, while a
recovery-rate threshold is a guess dressed as a gate, and a guessed threshold gets
moved the first time it is inconvenient.

## Open measurements

No decision blocks implementation. What remains is measurement.

| # | Measurement | Informs |
| --- | --- | --- |
| M1 | Carrier page weight per protected span | how many marks a page can carry |
| M2 | Cost and latency of forcing the vision path | the README's central claim |
| M3 | Marked-to-carrier mix ratio | how much of a page a publisher actually marks |
| M4 | What page scope gives up | deployment guidance |
| M5 | Chaff dilution ratio against page weight | chaff design |
| M6 | Whether advance widths can steer a detector into segmenting wrongly, and whether the recogniser then returns a confident wrong string | the only half of glyph perturbation still open |
| M7 | Line-breaking cost of atomic reordered runs | whether rung two survives a compat gate |
| M8 | Coupled vs independent decisions on repeated values | publisher guidance |
| M9 | Cost of full chaff separation per detection class | whether the axis spread is worth its page weight |
| M10 | Sub-perceptual contrast: human visibility | the half of M10 that gates shipping; the OCR half is measured |
| M11 | Source-channel attribution: DOM text, JSON-LD, meta or `alt` | what a publisher's own metadata gives away |
| M12 | Relation-attribution accuracy under permutation | reordering's remaining case |
| M13 | Cross-occurrence consistency checking as an extractor | the cheapest attack on a candidate set |
| M14 | Multi-fetch intersection as an attacker | per-load randomization is also an oracle |
| M15 | Reader mode across engines | Safari Reader Mode has served the decoy to the human |

M16 — what each extractor tier ingests that nobody can see — is closed. Its
finding is built into the concealment set and into the class-not-attribute rule,
and the suite that produced it was removed rather than maintained for a re-run
nobody is waiting on.

**One requirement is open rather than satisfied.** Anything that varies per load
must vary outside protected spans too, or two fetches diff into a span-level
index. Nothing currently does.

## Before public release

- Vendor legal review of the license boundary between noncommercial research use
  and commercial deployment.
- Browser tests, visual regression and benchmark smoke tests wired into CI.
- A documentation and demo site. The demo is also the most honest test surface the
  project has: it should serve protected content and invite readers to try
  extracting it.

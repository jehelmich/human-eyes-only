# Roadmap

Status: **pre-v0.1**. Scaffolding, specification, and decisions. No
transformation engine yet.

## The rule everything else follows from

Two suites, and they are not equal.

- **`benchmark/compat/` is a gate.** Pass or fail. Does the page still work?
- **`benchmark/extraction/` is a score.** What does extraction cost, and how
  often does it fail silently?

> **Never trade a gate for a score.**

Every protection technique makes a page stranger. Without a hard gate the
project ratchets toward strangeness one defensible increment at a time and finds
out when a publisher deploys it.

## Feature map

| Component | What it does | State |
| --- | --- | --- |
| `@heo/core` parser | Parse, discover `[data-heo]`, detect side channels | not started |
| `@heo/core` selector | Lexical span and relation-set selection | not started |
| `@heo/core` planner | Seeded strategy assignment | not started |
| `@heo/core` renderers | native, decoy, reorder, carrier | not started |
| `@heo/core` chaff | Text chaff and chaff carriers | not started |
| `@heo/core` assembler | Reassembly, payload rewriting, document marker | not started |
| `@heo/middleware` | Buffer, delegate, headers, refuse-on-unprotectable | not started |
| `heo-generator` | `(text, style, params, seed) -> SVG` | scaffolded |
| `benchmark/compat` | C1–C11 gates | not started |
| `benchmark/extraction` | Extractor matrix and cost metrics | not started |
| `benchmark/corpus` | T0–T4 frozen snapshots with ground truth | not started |

## Checkpoints

Each produces a written go/no-go in `research/notes/checkpoints/`. A checkpoint
that cannot fail is not a checkpoint.

Checkpoints declare **correctness** in advance and **magnitude** never. Zero
violations is knowable without data; a recovery-rate threshold is a guess dressed
as a gate, and a guessed threshold gets moved the first time it is inconvenient.
Numbers come from the previous checkpoint's measured distributions and are only
ever tightened.

### CP-0 — measure before building

Both suites run against the **identity transform**, before any strategy exists.

- compat must score **100%** on an identity transform; less is a harness bug,
  found while it is still free
- extraction produces the **baseline** every later number is relative to
- generator throughput is benchmarked standalone — it needs no pipeline, and it
  is what makes per-load randomization affordable

### CP-1 — the first vertical slice

Parse a `[data-heo]` region, select a relation set lexically, substitute its
members with carriers, transform every side channel carrying that text, serve it
through the middleware, prove cheap extraction differs from what a browser
renders.

**Assertions** — declared now: C1–C9 and C11 clean on T0/T1/T2/T4; T3 documents
*refused* (a T3 document that transforms successfully is a failure); identical
seed gives byte-identical output; no protected span's source text anywhere in the
response; no carrier degrading to readable text when assets are blocked.

**Directional claims** — sign, not magnitude: cheap extraction of protected spans
is worse than baseline; joint recovery of relation sets is worse than recovery of
individual spans; verified-fidelity cost via the vision path is higher than
baseline.

**Everything else is reported, never gated.** Thresholds are set at CP-2.

### CP-2 — thresholds from data

Turn CP-1's distributions into gates. First point at which the project can make a
public claim about protection.

### CP-B — the perturbation window *(deferred)*

Whether perturbation can induce *silent* vision-model error while staying below
what a reader notices. Runs when a carrier exists and there is something real to
perturb; blocks nothing, because carriers are valuable on cost and latency alone.

## Cadence

| When | Runs | Budget |
| --- | --- | --- |
| Every push | Unit tests; compat T0+T1; raw and Cheerio extraction | < 2 min |
| Every PR | Above plus T2/T4; visual regression; T3 observational | < 10 min |
| Nightly on `main` | Full corpus, full extractor matrix including OCR | < 60 min |
| Per checkpoint | Written go/no-go | manual |

## Open measurements

No decisions currently block implementation. What remains is measurement.

| # | Measurement | Informs |
| --- | --- | --- |
| M1 | Per-request generation cost and TTFB | whether per-load randomization holds |
| M2 | Cost and latency of forcing the vision path | the README's central claim |
| M3 | Native-to-carrier mix ratio | planner tuning |
| M4 | What build and page scope give up | deployment guidance |
| M5 | Chaff dilution ratio against page weight | chaff design |
| M6 | Perceptual budget vs silent error rate | deferred |

**M1 is the one to watch.** Per-load randomization is affordable only because
the generator is cheap, and the generator is cheap only because it emits SVG
rather than rasterizing. If generation is slower than expected, request-scope
randomization stops being viable and the amortization problem returns. The
generator benchmarks standalone, so this is measurable from CP-0.

## Deferred

- `subtle` / `balanced` / `hostile` modes — build the ladder before naming it
- Hydrated SSR support, via per-framework payload node synthesis
- Languages beyond English — every language needs its own lexicon and numeric
  patterns, and complex scripts need HarfBuzz-class shaping
- Font substitution — the cmap is a key that ships with the page
- Python and edge adapters
- Adversarial OCR perturbation research

## Before public release

- Vendor legal review of the license boundary between noncommercial research use
  and commercial deployment
- Browser tests, visual regression, and benchmark smoke tests wired into CI
  (currently CI skips when there is no lockfile)

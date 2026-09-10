# CLAUDE.md

Working notes for anyone — human or agent — making changes in this repository.

## What this project is

HEO ("Human Eyes Only") is source-available middleware that transforms selected
regions of an HTML response into a heterogeneous rendered representation:
legible and semantically correct to a human reader, expensive and unreliable to
extract automatically.

It is **not** access control, encryption, DRM, or a secrecy mechanism. The claim
is economic — raise the cost and uncertainty of automated extraction — and every
protection claim must be backed by benchmark numbers.

More precisely: HEO targets **fact extraction, not corpus ingestion**. A model
will still learn from a protected page in aggregate. What HEO attacks is pulling
a specific, attributable, actionable value out and acting on it without a human
in the loop. The goal is uncertainty sufficient to break autonomy, not denial.

[SPEC.md](SPEC.md) is the authoritative design document. When this file and the
spec disagree, the spec wins; fix this file.

## Layout

```text
packages/core/        @heo/core — the transformation engine (framework-neutral)
  src/parser/         stage 2: parse, discover [data-heo] regions
  src/selector/       stage 3: tokenize, select semantically valuable spans
  src/planner/        stage 4: seeded strategy assignment
  src/renderers/      stage 5: native, decoy, reorder, overlay, svg, font
  src/decoys/         stage 5: plausible replacement text generation
  src/chaff/          stage 5: low-cost noise nodes
  src/assembler/      stage 6: document reassembly, runtime assets
packages/middleware/  @heo/middleware — generic Node HTTP adapter
packages/generator/   text -> SVG carrier generator (Rust/WASM), the second core
benchmark/
  corpus/             frozen HTML snapshots, tiers T0-T4, with ground truth
  compat/             the compatibility GATE (C1-C10), pass/fail
  extraction/         the protection SCORE, extractor matrix and metrics
  runner/             orchestration and report emission
examples/node-basic/  minimal end-to-end demonstration
research/             notes, references, experiments
website/              docs and demo site
```

## Commands

```bash
corepack enable && pnpm install   # also seeds git hooks, see CONTRIBUTING.md
pnpm typecheck
pnpm test
pnpm bench
pnpm lint
pnpm --filter @heo/generator build   # needs wasm-pack
```

`.githooks/` is untracked by design — each machine keeps its own. `pnpm install`
seeds a minimal `commit-msg` hook only when none exists, so it never overwrites a
customised one.

## Architectural boundaries

**`@heo/core` knows nothing about host frameworks.** No Express, Fastify,
Next.js, Flask, or Django anywhere in `packages/core`. Every integration reduces
to `transformHtml(html, config) -> { html, stats }`. Adapters that hold
transformation logic are the main way this design rots — keep them thin.

**Middleware buffers and delegates.** `@heo/middleware` inspects content type,
buffers the body, calls `transformHtml`, updates headers, writes output. Nothing
in it should decide what the output looks like.

**Strategies are pluggable.** Adding a representation strategy must not require
touching the middleware API.

## Invariants

These are correctness constraints, not preferences. Violating one is a bug even
if the protection numbers improve.

1. **Human-visible content is authoritative.** If the rendered page reads
   differently to a person, the transformation is wrong.
2. **Nothing outside a protected region changes.** No page has its semantics
   altered outside an explicit `[data-heo]` region.
3. **Never touch** form submissions, user input fields, **executable** script
   contents, URLs, or security controls. Never generate misleading visible text
   or invisible clickable elements.
   Serialized *data* in script tags — JSON-LD, `__NEXT_DATA__`, flight payloads —
   is explicitly in scope and must be transformed
   ([D1](docs/decisions.md)). Rewrite it with a format-aware
   parser and re-parse to validate; a payload that fails to parse takes the whole
   page down.
4. **Skip by default:** `code`, `pre`, `script`, `style`, `textarea`, `input`,
   `select`, `option`, `button`, `svg`, `math`.
5. **Determinism.** All randomness goes through the planner's seeded PRNG
   abstraction. Never `Math.random()`. A fixed seed must reproduce a byte-identical
   transformation.
6. **No original text leaves the origin.** Transform every representation of a
   protected span in the response — markup, payloads, JSON-LD, meta tags,
   `<noscript>`, `data-*` — or refuse to serve the page. Fail closed. Gate C11
   enforces this and it is the most important gate in the suite.
7. **No plaintext fallback path, ever.** If a carrier's assets cannot load, the
   span fails unreadable, never back to text. A text fallback is a bypass any
   scraper triggers by declining to fetch assets.
8. **No inference layer in the middleware.** No language model, classifier, or
   embedding — not behind a flag. Selection is regex, lexicon, pattern rules, and
   a seeded PRNG. `transformHtml` is a fast, reproducible pure function and stays
   one.
9. **Idempotence.** `transform(transform(x))` equals `transform(x)`. HEO runs
   behind proxies and caches that may feed it its own output.

Accessibility loss in protected regions is settled and documented, not an open
design question. Do not reopen it, and do not propose metered or opt-in plaintext
channels — a channel that hands out plaintext on request is the machine-readable
full text with a turnstile in front.

## Compatibility is a gate; protection is a score

`benchmark/compat/` is pass/fail: does the page still work for a human, a screen
reader, a translator, and the publisher's framework? `benchmark/extraction/` is
a continuous score: what does extraction cost, and how often does it fail
silently?

> **Never trade a gate for a score.**

A change that improves extraction numbers while failing a compatibility gate is
rejected, not negotiated. Every protection technique makes a page stranger;
without a hard gate the project ratchets toward strangeness one defensible
increment at a time.

Note that C2 no longer checks rendered `innerText`, because carriers make it
empty by construction. Human-visible correctness is established visually — pixel
diff per commit, periodic OCR against ground truth. That is a real loss: the
cheap mechanical check on the spec's central invariant is gone and the
replacement is slower and noisier. Treat a pixel-diff failure as a genuine defect
until proven otherwise.

## Conventions

- TypeScript, ESM, strict mode. No `any` without a comment explaining why.
- Prefer small pure functions in `core`; the pipeline stages should be testable
  in isolation.
- New strategies land behind a flag, disabled by default, and are enabled only
  after the benchmark suite shows measurable benefit.
- Tests: unit in `packages/*/test`, browser and visual regression via Playwright.
  A visual regression failure means the human-visible output changed — treat it
  as a real defect until proven otherwise.

## Commit and communication style

- Follow [Conventional Commits](https://www.conventionalcommits.org/). See
  [CONTRIBUTING.md](CONTRIBUTING.md) for types, scopes, and formatting.
- Commits are authored under the repository owner's git identity
  (`Jan Helmich <jan@hlmch.com>`). Do not add alternate authors, bylines, or
  signatures to the subject or body.
- Write in the project's voice: plain, technical, first-person-plural or
  impersonal. No assistant-flavoured phrasing, no emoji decoration, no
  "as requested" framing, no marketing tone in commits, PRs, issues, or docs.
- README and docs must stay honest about limits. HEO does not make public
  information secret, and the docs must never imply otherwise.

## How the layers fit together

No strategy works alone, and evaluating one in isolation is the standard way to
reach a wrong conclusion about it (SPEC.md §5.5).

- **Carriers** (rendered spans, inline SVG or raster) force escalation to vision
  on the spans that matter. They impose *cost*, not error. Every page load
  renders differently, so there is no stable mapping to resolve once and cache.
- **Decoys** in markup and every serialized side channel make the cheap answer
  confidently wrong. They impose *corruption*.
- **Reordering and chaff** handle the invisible-code path and dilute the set of
  carriers an attacker must resolve, so cost scales with N+M to recover N spans.
- **Native spans** (SPEC.md §14) keep substituted spans from advertising where
  the valuable tokens are. Leaving text alone is a strategy, not a gap.

Selection is set-wise, not token-wise. Protecting one side of a comparison is
close to worthless — `$4.2M` is recoverable from `up from $3.1M`. Protecting both
leaves a range, and a range is not an actionable value.

## Current state

Pre-v0.1: scaffolding, specification, and validation plan. No transformation
engine yet.

Read these before making design decisions:

- [docs/decisions.md](docs/decisions.md) — architectural decisions. Supersedes
  SPEC.md where they conflict; each names the spec section it corrects. SPEC.md
  is the design of record and is not edited.
- [ROADMAP.md](ROADMAP.md) — feature map, checkpoints, cadence, and the six open
  measurements.

**Scope: server-rendered, non-hydrated pages only.** Hydrated SSR is refused with
a clear message; client-rendered SPAs are out of scope. This follows from the
no-original-text rule, not from a limitation of middleware.

**HEO announces itself at document level and never at span level.** Protected
regions go dark to search and automated reuse — that is the intent. Anything
meant for indexing or quotation belongs outside a HEO block.

**The generator is not a rendering engine.** Emitting SVG needs a font parser and
a path serializer, not resvg or skia. Precompute glyph paths per font at startup;
per-request work is transform, jitter, serialize. That is what makes per-load
randomization affordable.

Next steps, in order:

1. **CP-0** — both harnesses against the identity transform. Compat must score
   100%; extraction produces the baseline every later number needs. Generator
   throughput is benchmarked standalone from here, since it is what makes
   per-load randomization affordable.
2. **CP-1** — the vertical slice.

Implementation order is in SPEC.md §46, amended: carriers are not deferred, and
parametric font work is not needed at all.

**Build the ladder before naming it.** SPEC.md §12's `subtle` / `balanced` /
`hostile` are deferred (D20): implement each obfuscation mechanism, verify it,
and measure what it costs and what it buys. The useful groupings will be visible
in the data. Until then there is one behaviour with direct parameters, and no
mode selector ships.

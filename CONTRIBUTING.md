# Contributing

## Setup

```bash
corepack enable
pnpm install          # also installs git hooks, see below
pnpm typecheck && pnpm test
```

The generator is Rust compiled to WASM and builds separately:

```bash
cargo install wasm-pack
pnpm --filter @heo/generator build
```

### Hooks

`.githooks/` is untracked on purpose — it is where each machine keeps its own
local hooks. `pnpm install` runs `scripts/setup-hooks.sh`, which points
`core.hooksPath` there and seeds a minimal `commit-msg` hook **only if one does
not already exist**, so it never overwrites anything you have customised.

To install by hand, or after customising:

```bash
sh scripts/setup-hooks.sh
```

Node 20.11+ (see `.nvmrc`), pnpm workspaces, Vitest for unit tests, Playwright
for browser tests, Biome for formatting and linting. Rust and `wasm-pack` only if
you are working on the generator.

## Ground rules

Two constraints outrank everything else in this repository.

**1. The human-visible rendering is authoritative.** A change that alters what a
person reads on the page is a bug, not a stronger protection. Visual regression
tests exist to catch exactly this.

**2. Never touch anything outside a protected region.** HEO must not alter form
submissions, user input fields, **executable** script contents, URLs, or security
controls, and must never create invisible clickable elements or misleading
visible text. `code`, `pre`, `script`, `style`, `textarea`, `input`, `select`,
`option`, `button`, `svg`, and `math` are skipped by default.

Serialized *data* in script tags — JSON-LD, `__NEXT_DATA__`, framework payloads —
is the exception: it is explicitly in scope and must be transformed, because text
left there is text the client received. Use a format-aware parser and re-parse to
validate; a payload that fails to parse takes the whole page down.

**3. No original text leaves the origin.** Transform every representation of a
protected span in the response, or refuse to serve the page. Fail closed.

**4. No inference layer in the middleware.** No language model, classifier, or
embedding — not behind a flag. Selection is regex, lexicon, pattern rules, and a
seeded PRNG.

See SPEC.md §34 and [docs/decisions.md](docs/decisions.md).

## Adding a strategy

New representation strategies land behind a flag, disabled by default. A
strategy is enabled by default only once the benchmark suite shows measurable
benefit against the extractor matrix — protection claims in this project are
backed by numbers or they are not made.

The compatibility suite is a gate and the extraction suite is a score:
**never trade a gate for a score.** A strategy that improves extraction numbers
while failing a compatibility gate is rejected, not negotiated. See
[ROADMAP.md](ROADMAP.md).

Every transformation must also be reproducible under a fixed seed. Randomness
goes through the planner's PRNG abstraction, never `Math.random()`.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <subject>
```

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`,
`chore`, `revert`. Scopes follow the workspace: `core`, `middleware`,
`benchmark`, `examples`, `website`, `research`, or a pipeline stage such as
`core/planner`.

- Imperative mood, lowercase subject, no trailing period, under 72 characters.
- No emoji and no decorative symbols, anywhere, ever.
- One logical change per commit; keep refactors out of behaviour changes.
- Explain *why* in the body when the reason is not obvious from the diff.
- Reference issues in a trailer: `Refs: #12`, `Closes: #12`.
- Breaking changes: `feat(core)!:` plus a `BREAKING CHANGE:` trailer.

The seeded `commit-msg` hook enforces this locally. CI does not, so it is a
convenience rather than a gate — `--no-verify` bypasses it.

## Pull requests

CI runs typecheck, unit tests, browser tests, visual regression, a benchmark
smoke test, and a bundle-size check. Include benchmark deltas in the description
when a change is expected to move extraction fidelity in either direction.

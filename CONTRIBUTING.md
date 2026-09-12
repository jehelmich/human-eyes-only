# Contributing

## Setup

```bash
corepack enable
pnpm install          # also installs git hooks, see below
pnpm typecheck && pnpm test
```

The generator is Rust compiled to WASM and builds separately:

```bash
rustup target add wasm32-unknown-unknown
pnpm --filter @human-eyes-only/generator build
```

Node 20.11+ (see `.nvmrc`), pnpm workspaces, Vitest for unit tests, Playwright for
browser tests, Biome for formatting and linting. Rust and the
`wasm32-unknown-unknown` target only if you are working on the generator.

`.githooks/` is untracked on purpose — it is where each machine keeps its own local
hooks. `pnpm install` runs `scripts/setup-hooks.sh`, which points `core.hooksPath`
there and seeds a minimal `commit-msg` hook **only if one does not already exist**.

## Branches and releases

`main` is the integration branch. Feature work happens on short-lived branches
named for the work, for example `feature/carrier-calibration`,
`fix/csp-nonce`, or `docs/middleware-readme`, and lands through a pull request
into `main`.

Stable maintenance work happens on `release/*` branches. Create one only when a
published line needs fixes that should not wait for whatever is currently on
`main`, for example `release/0.1`. Cherry-pick narrowly into that branch, keep
the branch green, and tag releases from there. The current prerelease line is
`release/0.1`.

Release tags are `v<package-version>`, for example `v0.1.0-alpha.3`. A release
tag must point at a commit reachable from `main` or from a `release/*` branch;
the publish job checks this before it can publish. Do not tag feature branches.
If a feature branch needs a shareable build, publish a GitHub artifact or pack a
local tarball instead of using an npm version.

Automatic npm publishing is opt-in. The release job is skipped unless the
repository variable `NPM_AUTO_PUBLISH` is set to `true`; when enabled it still
waits for the normal verification and visual jobs. Until that variable is set,
tag pushes create CI evidence but do not publish to npm.

For prereleases, keep all public packages on the same version and publish in
dependency order: `@human-eyes-only/core`, `@human-eyes-only/generator`, then
`@human-eyes-only/middleware`. The middleware depends on the other two by semver
after publishing, so a partial publish leaves installs broken until the missing
package version exists.

## Invariants

Correctness constraints, not preferences. Violating one is a bug even if the
protection numbers improve. Why a given *mechanism* works the way it does is a
comment in the code it governs; [docs/decisions.md](docs/decisions.md) holds the
dead ends and the open questions.

1. **Human-visible content is authoritative.** If the rendered page reads
   differently to a person, the transformation is wrong. C3's pixel diff exists
   to catch exactly this, and it has caught it four times.
2. **Nothing changes except where the publisher wrote a `heo-*` element.** Gate
   C2 enforces it and no configuration relaxes it.
3. **Never touch** form submissions, user input fields, script contents, URLs or
   security controls, beyond the one scoped CSP nonce edit. Never generate
   misleading visible text or invisible clickable elements.
4. **A mark contains text and never markup.** A mark enclosing any element is a
   `HeoCoverageError`; a mark written *inside* `code`, `pre`, `script`, `style`,
   `textarea`, `input`, `select`, `option`, `button`, `svg` or `math` is a
   `HeoMarkupError`. Between them the engine cannot reach inside a skipped
   element at all, which is stronger than a skip list.
5. **Determinism.** All randomness goes through the seeded PRNG in
   `packages/core/src/random`, never `Math.random()`. A fixed seed reproduces a
   byte-identical transformation. The CSP nonce is the sole exception, and is
   emitted only for a response whose policy needs one.
6. **No original text leaves a protected span.** What the publisher marks is
   removed from the rendered document and from nothing else. A value they also
   put in their own meta description, JSON-LD or `data-*` attribute stays there,
   because those are not rendered and there is nothing to apply — and **HEO
   refuses when it cannot perform, never when it disapproves**, so it does not
   check those channels either.
7. **No plaintext fallback path, ever.** If a carrier's assets cannot load the
   span fails unreadable, never back to text. A different *font* is not a
   plaintext fallback.
8. **No inference layer in the middleware.** No language model, classifier or
   embedding — not behind a flag, and no heuristic selection either.
   `transformHtml` is a pure function over a string, a config and a seed.
9. **Idempotence.** `transform(transform(x))` equals `transform(x)`. HEO runs
   behind proxies and caches that may feed it its own output.
10. **Every marked span is protected, or the page is refused.** That is HEO
    reporting it could not do what it was asked, not a judgement about the page.

Accessibility loss in protected spans is settled and documented, not an open
design question. Do not reopen it, and do not propose metered or opt-in
plaintext channels — a channel that hands out plaintext on request is the
machine-readable full text with a turnstile in front.

**HEO announces itself at document level and never at span level.** A per-span
marker hands an attacker an index of exactly what is worth vision compute. And
**no crawler discrimination, and no directives either**: user-agent allowlisting
is spoofable and hands attackers a one-header bypass, so anything meant for
indexing or quotation is left unmarked instead.

## Architectural boundaries

**`@human-eyes-only/core` knows nothing about host frameworks.** No Express,
Fastify, Next, Flask or Django anywhere in `packages/core`. Every integration
reduces to `transformHtml(html, config) -> { html, stats }`. Adapters that hold
transformation logic are the main way this design rots — keep them thin.

**The middleware buffers and delegates.** It inspects a content type, buffers the
body, calls `transformHtml`, updates headers and writes output. Nothing in it
decides what the output looks like.

**The generator is not a rendering engine.** Emitting SVG needs a font parser and
a path serializer, not a rasteriser. The glyph table fills per font instance on
first use; per-request work is transform, jitter, serialize. The integer path
serializer in `packages/generator/src/emit.rs` is worth more of that than the
cache is, so reaching for `format!("{:.2}")` there costs a factor of three in
time and doubles the bytes.

## Adding a mechanism

A new mechanism is a new element, not a flag. It ships once the benchmark suite
shows measurable benefit against the extractor matrix — protection claims in
this project are backed by numbers or they are not made — and a publisher who
does not write the element does not get it. The compatibility suite is a gate
and the extraction suite is a score: **never trade a gate for a score.**

Every transformation must be reproducible under a fixed seed. Randomness goes
through the seeded PRNG in `packages/core/src/random`, never `Math.random()`.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <subject>`

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`,
`revert`. Scopes follow the workspace: `core`, `middleware`, `benchmark`,
`examples`, `generator`, or a pipeline stage such as `core/parser`.

- Imperative mood, lowercase subject, no trailing period, under 72 characters.
- No emoji and no decorative symbols, anywhere, ever.
- One logical change per commit; keep refactors out of behaviour changes.
- Explain *why* in the body when the reason is not obvious from the diff.
- Reference issues in a trailer: `Refs: #12`, `Closes: #12`.
- Breaking changes: `feat(core)!:` plus a `BREAKING CHANGE:` trailer.

The seeded `commit-msg` hook enforces this locally; CI does not.

## Pull requests

CI runs lint, the repository hygiene check, typecheck, unit tests, and the
compatibility gate against both the identity transform and the engine; a second job
installs Chromium and a Rust toolchain and runs the browser gates, the concealment
neutrality check and the carrier alignment check. Include benchmark deltas in the
description when a change is expected to move extraction fidelity either way.

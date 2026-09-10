# HEO — Human Eyes Only

**Adversarial rendering middleware for human-first web publishing.**

> Publish for humans. Make machines earn certainty.

HEO transforms selected regions of an HTML response into a heterogeneous
rendered representation that stays legible and semantically correct to a human
reader, while making low-cost automated extraction less reliable.

## What HEO is not

HEO is **not** access control, encryption, DRM, or a guarantee that machines
cannot recover public content. Anything rendered for a human can ultimately be
recovered by a sufficiently capable automated system.

> HEO does not make public information secret. It increases the cost and
> uncertainty of automated extraction by deliberately separating machine-readable
> structure from authoritative human-visible rendering.

It also targets a narrower thing than "AI can't read my site". A model will still
learn from a protected page in aggregate, and HEO does not claim otherwise. What
it attacks is **fact extraction**: pulling a specific, attributable, actionable
value out and acting on it with no human in the loop. The goal is uncertainty
sufficient to break autonomy, not denial.

The goal is economic: force an extractor to escalate from

```text
HTTP GET → strip HTML → parse text
```

toward

```text
HTTP GET → execute browser → resolve CSS/layout/fonts/SVG → render
→ OCR / vision → reconcile conflicting representations → confidence checks
```

An extractor returning garbage knows it failed. An extractor returning fluent
but mutually inconsistent interpretations has to spend real resources deciding
which one is authoritative. HEO optimizes for the second outcome.

Only a handful of load-bearing spans per region are protected — figures, dates,
negations, comparatives — not the whole document. A single uncertain `not`,
`2027`, or `£740m` changes the reading of a paragraph, and protecting both sides
of a comparison leaves a range rather than a value. A range is not something you
can trade on.

## What it costs

Protected spans are not available to screen readers, find-in-page, copy/paste,
translation, or reader mode, and are not indexed by search engines. This is
inherent rather than an implementation gap: any channel that hands a machine the
plaintext is the machine-readable full text with a turnstile in front.

Reuse means re-embedding the rendered span, not copying its text. Publishers with
legal accessibility obligations should protect selectively, or not at all.

## Status

Pre-v0.1. Scaffolding, specification, and validation plan — no transformation
engine yet.

v0.1 targets **server-rendered, non-hydrated pages**. Hydrated SSR applications
(Next, Nuxt, Remix, SvelteKit) are refused with a clear message rather than
silently under-protected; client-rendered SPAs are out of scope. See
[SPEC.md](SPEC.md) §39 for the milestone and
[docs/decisions.md](docs/decisions.md) for why.

## Intended use

Deploy HEO only after expressing machine-use policy through the conventional
mechanisms: robots directives, terms of use, crawler controls, authentication
boundaries, and rate limits. Protect specific high-value regions rather than
entire public sites — aggressive protection degrades search indexing, snippets,
and reader-mode extraction.

```html
<header>machine-readable summary</header>

<article data-heo>
  protected detailed content
</article>
```

## Usage (target API)

```ts
import { heoMiddleware } from "@heo/middleware";

app.use(heoMiddleware({ mode: "balanced" }));
```

## Repository layout

```text
packages/core/        @heo/core — framework-neutral HTML transformation engine
packages/middleware/  @heo/middleware — generic Node HTTP adapter
benchmark/            extraction-fidelity harness and extractor matrix
examples/node-basic/  minimal end-to-end demonstration
research/             notes, references, experiments
website/              documentation and demo site
```

## Attacks welcome

Successful extraction attacks are **not** security vulnerabilities — they are
research contributions, and the project wants them. If you can extract HEO
content faster or more accurately, submit the attack. See [SECURITY.md](SECURITY.md).

## License

Source-available under the [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/).

Free for personal, hobby, research, academic, and security research use, and for
charitable, educational, public research, and government organisations —
including publishing attacks and benchmark results against HEO itself.

Commercial deployment requires a separate license. See [LICENSE](LICENSE) and
[COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).

Not OSI-approved open source, and the project does not describe itself as such.

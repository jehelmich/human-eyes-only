# Decisions

Architectural decisions, with the reasoning kept short. Where a decision
corrects [SPEC.md](../SPEC.md), the section is named — the spec is the design of
record and is not edited, so this file is what supersedes it.

## Scope

**D1 — Serialized data is in scope; executable script is not.** *Corrects §34.*
JSON-LD, `__NEXT_DATA__`, and RSC flight payloads are data, not code, and text
left there is text the client received. Executable script stays untouchable.
Rewrite payloads with a format-aware parser and re-parse to validate; a payload
that fails to parse takes the page down.

**D2 — No original text leaves the origin.** Transform every representation of a
protected span in the response — markup, payloads, JSON-LD, meta tags,
`<noscript>`, `data-*` — or refuse to serve. `onUnprotectable` defaults to
`refuse`. RSS, public APIs, AMP and sitemaps are separate responses and remain a
publisher checklist item.

**D3 — v0.1 targets server-rendered, non-hydrated pages.** Hydrated SSR is
refused with a clear message; client-rendered SPAs are out of scope. This
follows from D2, not from a limit of middleware: element-shaped carriers cannot
round-trip through a serialized element tree without per-format node synthesis.

**D11 — HEO targets fact extraction, not corpus ingestion.** A model still
learns from a protected page in aggregate and HEO should not claim otherwise.
What it attacks is pulling a specific, attributable value out and acting on it
with no human in the loop. Uncertainty sufficient to break autonomy, not denial.

## Mechanism

**D4 — Selective substitution, not whole-document rendering.** *Per §5.3, §14.*
A few load-bearing spans per region; the rest stays native text. Whole-document
rendering multiplies weight, breaks reflow, and protects character count rather
than information density. Leaving most spans native is required, not conceded —
it stops carriers advertising where the valuable tokens are.

**D5 — Carriers are rendered spans, vector or raster.** Delivered as a CSS mask
over `currentColor` so they inherit surrounding colour and theme. Not JPEG —
lossy DCT rings on every glyph edge. Per-word units so text reflows, accepting
that word boundaries leak length.

**D8 — Selection is set-wise, not token-wise.** Protecting one side of a
comparison is near worthless: `$4.2M` is recoverable from `up from $3.1M`.
Protecting both leaves a range, which is not actionable. Relations are detected
lexically — two numerics in a clause, `up from`, `vs`, `compared to`, change
verbs, table adjacency — and the set is protected together or not at all.

**D18 — Decoy vocabulary comes from the page.** Drawing decoy words from the
same document makes them distributionally identical to real text, defeating the
perplexity filtering that would otherwise strip chaff cheaply. One mechanism,
two problems. Numerics need plausible magnitude and format: `$4.2M` becomes
`$3.8M`, never `$4,200,000,000,000` — an obviously wrong decoy gets discarded,
and discarded decoys do not corrupt anything.

**D6 — Perturbation targets silent error, not blocking.** Text CAPTCHAs lost to
machine learning a decade ago. Blocking is the wrong objective; a model that
reads a figure wrongly some of the time with no signal about which time is the
product. Tune for silent error rate at a fixed perceptual budget.

**D16 — Request-scope randomization is the default.** Every load renders
differently, so there is no stable mapping to resolve once and cache. Without
this, a large per-request cost multiplier amortizes toward 1x over a year of
re-crawls. The bill moves to the publisher: protected pages are not
CDN-cacheable and generation runs per request. Build and page scope stay
available for publishers who need caching.

**D19 — The generator is not a rendering engine.** Emitting SVG needs a font
parser and a path serializer, not resvg or skia. Glyph path tables precompute
per font at startup; per-request work is transform, jitter, serialize. That is
what makes D16 affordable. Rust to WASM, so consumers need no native toolchain
and future Python and edge adapters reuse the same artifact.

## Delivery

**D9 — No plaintext fallback path, ever.** If a carrier's assets cannot load the
span fails unreadable, never back to text. A text fallback is a bypass any
scraper triggers by declining to fetch assets.

**D17 — Carriers are inline; CSP selects the format.** Inline cannot fail on
CORS, network, or a blocked host — only on policy. Inline SVG is markup, not a
resource load, so no CSP directive touches it; raster needs `img-src data:`,
which strict policies commonly forbid and which fails silently. Parse the policy
from header and `<meta http-equiv>`, prefer raster where permitted, fall back to
SVG, refuse if neither. Vector is therefore required, not optional.

**D7 — No inference layer in the middleware.** No language model, classifier, or
embedding, not behind a flag. Regex, lexicon, pattern rules, and a seeded PRNG.
`transformHtml` is a fast reproducible pure function and stays one; sufficient
confusion comes from the stochastic mix across a heterogeneous carrier set
(§5.2), not from being clever about which token matters most.

## Disclosure

**D14 — No crawler discrimination, and no directives either.** Protected regions
go dark to search and automated reuse; that is the intent. No user-agent
allowlisting — spoofable, and it hands attackers a one-header bypass. Anything
meant for indexing or quotation belongs outside a HEO block, which is an
editorial decision per region and needs no crawler to honour it.

**D15 — Advertised at document level, never at span level.** HEO announces
itself via response header, recommended on-page disclosure, and terms language;
detection cost is ~0 by design and the benchmark reports it as such. Declared
obfuscation is also a safer position than silent poisoning if someone extracts a
decoy and acts on it. But advertising that a page is protected is a different
act from advertising which spans are — a per-span marker hands an attacker an
index of exactly what is worth vision compute, and undoes the chaff carriers'
only job. The document marker doubles as the idempotence signal.

**D12 — Accessibility loss is settled, not open.** Protected spans are
unavailable to screen readers, find-in-page, copy/paste, translation, and reader
mode. Inherent: any channel handing a machine the plaintext is the
machine-readable full text with a turnstile in front, so metered and opt-in
plaintext channels are rejected. Publishers with legal accessibility obligations
should protect selectively or not at all, and the docs must say so plainly.

**D21 — PolyForm Noncommercial 1.0.0.** Professionally drafted, already covers
personal, hobby, research, security research, charitable, educational, public
research and government use, and its Noncommercial Organizations section makes
funding source irrelevant — which matters for academics on commercially funded
grants. Hand-rolling a license is a known way to produce something unenforceable
or accidentally broader than intended. Not OSI-approved open source, and the
project must not describe itself as such. Legal review still required on the
noncommercial-to-commercial boundary.

## Measurement

**D10 — The KPI is a pair.** *Amends §31.* Cost-to-fidelity misses what breaks
autonomy: whether the extractor can tell *which* part it got wrong. Report cost
to reach a fidelity target alongside cost to reach a **verified** fidelity
target. The gap between the columns is the product.

**D13 — Gate C11, side-channel containment.** No substantial portion of a
protected region's text may appear anywhere else in the response untransformed.
Absolute gate. This is what enforces D2 mechanically, and failing it means HEO
degraded a page while protecting nothing.

**D20 — Modes are deferred.** *Defers §12's `subtle`/`balanced`/`hostile`.*
They were defined against a strategy set D4 and D5 have changed, and naming
points on a ladder before the rungs exist is guessing. Build each mechanism,
verify it, measure what it costs and buys; the useful groupings will be visible
in the data. Until then, one behaviour with direct parameters.

## Not encryption

Worth stating because it shapes how this gets described. For decoys the true
value never left the origin — nothing to reverse, which is *stronger* than a
cipher. For reordering the content does ship and the CSS is the key, which is
weaker. Neither has a "bits of security" answer, and someone will ask. The
honest property is **the value is not in the response**, not that it is hard to
invert.

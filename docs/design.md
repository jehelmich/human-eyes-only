# Design

How HEO works today. This is the design of record: where it and the code
disagree, one of them is a defect and the other is the fix.
[decisions.md](decisions.md) holds the dead ends and the open questions; why a
particular mechanism works the way it does is a comment in its own code.

## The claim

HEO transforms the spans of an HTML response that a publisher marks, so that
what a person reads is unchanged and what a machine parses is not the value. The
claim is economic and narrower than "AI cannot read my site": a model still
learns from a protected page in aggregate, and what HEO attacks is **fact
extraction** — a specific, attributable value pulled out and acted on with no
human in the loop. The end state is that a machine which fetches the page cannot
establish that any particular rendering of it is the real one. HEO is not access
control, encryption, DRM or secrecy, and no protection claim ships without a
benchmark number behind it.

## The ladder

The mechanisms are rungs, and the tier each one stops is the point.

| | mechanism | stops | beaten by | costs the publisher |
| --- | --- | --- | --- | --- |
| 1 | chaff — invisible text injection | tier A, raw tag-strip, and most of tier B | tier C: one computed-style or geometry pass | text only |
| 2 | shuffle — reordering | A and B; `order` is CSS and needs layout | tier C, a headless browser | spans plus CSS rules |
| 3 | carriers — drawn outlines | A, B and C; no text is present to read | tier D, OCR — or bespoke outline matching | ~900 bytes per word, uncacheable |
| 4 | adversarial images | aims at D itself | unmeasured | on top of 3; **unbuilt** |

The tiers are A `curl` and regex, B Cheerio/Readability/trafilatura and
visibility filters, C Playwright and computed style, D screenshot and OCR, E an
adaptive attacker who knows HEO and writes bespoke recovery. Rung one reaches
into B because the concealment is an opaque class rather than an inline style
and four of its five kinds carry no `aria-hidden`, and those are the two things
a tier B filter looks at: class-based `display:none` was ingested by 6 of 6 tier
B extractors against 2 of 6 for the identical inline declaration.

The rungs compose and the bill is additive, so a publisher picks a rung per span
rather than deploying "HEO". Check the tier a finding was measured at before
treating it as settled: the extractor HEO actually meets is a commodity
pipeline, and a verdict from the wrong tier is a hypothesis.

## The markup is the configuration

Three elements, each naming one mechanism, documented for publishers in the
[README](../README.md). There is nothing else to write and no option that can
overrule one. `<heo-decoy>` is reserved for rung four and refuses today.

**A mark holds text, not markup.** A `<heo-protect>` enclosing any element is
refused, which makes "HEO never rewrites your markup" a property of the shape
rather than a rule someone has to remember, and is stronger than the skip list it
replaces: the engine cannot reach inside a skipped element at all.

**No `heo-*` element reaches the response.** Shipped, they are an index of
exactly which spans are protected and they publish the candidate list. Gate C12
enforces it.

## The pipeline

`transformHtml(html, config) -> { html, stats }` is the whole public surface of
`@heo/core`, and keeping it to one function is what stops adapters accumulating
transformation logic.

1. **Refuse hydrated SSR**.
2. **Parse**, returning the input untouched if it already carries the document
   marker — HEO runs behind proxies that may feed it its own output.
3. **Discover** the publisher's `heo-*` elements, collecting every way of writing
   markup that does nothing so the first request lists all of them, not the first.
4. **Check coverage**: a mark with no generator, a mark with no size, a shuffle
   with fewer than three units — each a span HEO was pointed at and cannot take.
5. **Render** each element into the nodes that replace it. There is no planner,
   because the element is the decision.
6. **Unwrap** whatever `heo-*` elements are left, which under `warn` is what
   declined to render and otherwise is nothing.
7. **Assemble**: the document marker, one `<style>` element holding the runtime
   rules and every per-load class, and any policy rewrite that needs to happen.

Randomness is seeded throughout and derives from one root, so adding a carrier
does not reshuffle the chaff.

### Carriers

`<heo-protect>` replaces a span with vector outlines of its own text: the reader
gets the value, the DOM does not get it at all. This is the only **subtraction**
mechanism and the only one that can satisfy the property the rest of the design is
written around.

- One `<svg>` per word, spaces left as text nodes, so the line breaks where it
  broke before. `unit="phrase"` draws the whole mark in one box — better
  against a machine, a footgun on any mark long enough to wrap.
- Inline SVG with `fill="currentColor"`, never a CSS mask. Inline markup
  engages no CSP directive, and `currentColor` inherits colour and dark mode.
- The baseline shift is a shared class, never a `style` attribute.
- A word the publisher's font cannot draw is drawn by another face and counted in
  `stats.carrierFallbacks`; only a word *no* face can draw reaches
  `onUnprotectable`.

The size is configuration and cannot be anything else: `transformHtml` is a pure
function over a string, and resolving which face and size apply to a span needs the
cascade, which needs layout.

### Decoys

Wherever a mark carries `alt`, one substitute is drawn per load and placed in
the channel the carrier vacated. A decoy is a chaff node that happens to be a
replacement — same container, same opaque classes, same constructor — because a
decoy shaped differently would make "which concealed span is the decoy" a
selector. Its concealment is drawn only from the four kinds already outside the
accessibility tree, because `aria-hidden` is what trafilatura and Readability.js
discard.

### Shuffle

`<heo-shuffle>` emits word units in one order and restores the reading order
with CSS `order`, so a scraper must resolve the stylesheet rather than trust
document order. It does not hide the words and is not claimed to, which is why
the publisher asks for it by name. A `<heo-protect>` inside a shuffle
contributes its carriers as units, so the two rungs compose on one span. Three
units minimum, runs chunked at five, and the permutation lives in per-run rules
selected by an opaque per-load class and `nth-child` so the units carry no
attributes.

**Known regression:** an inline-level flex container never fragments across line
boxes, so a run that does not fit the remaining line space moves to the next
line whole. Same words, same order, different rag.

### Chaff

`<heo-chaff>` is one noise node exactly where the publisher wrote it. Volume is
how many elements they wrote; there is no pool, spread, density or scope. A node
is a sample from a space rather than one recipe with a random skin:
*concealment* — which question an extractor must ask to notice it is hidden —
and *shape*, permuted like a real run or plain text, vary independently.

Five concealments, one per question: the `hidden` attribute, `display:none`,
`content-visibility:hidden`, `visibility:hidden`, and the `.sr-only` clip. The
first four are silent without `aria-hidden` and are the decoy pool; the fifth is
not, so chaff drawing it carries the attribute — which is what stops
`aria-hidden` separating real runs, which always carry it, from fabricated
nodes. Nothing here is opt-in and nothing in the configuration relaxes a stated
property. Chaff never republishes a protected value and creates no interactive
elements.

## The generator

`heo-generator` turns `(text, params, seed)` into one inline SVG carrier. It is
a font parser and a path serializer, not a rendering engine: `skrifa` and
`read-fonts`, a plain `cdylib` for `wasm32-unknown-unknown` with a four-function
C ABI and no `wasm-bindgen`. Font bytes are passed in by the host and never
embedded.

One `<path>` for the whole run, not one per glyph, because per-glyph elements
would hand a segmenter the character count and the cut points for free. Three
randomization axes are live — control-point jitter, contour order, attribute
order — and the two that would defeat outline matching, subpath start rotation
and path decomposition order, are not built. Jitter is the quantisation axis and
not a publisher option.

## Determinism

All randomness goes through the seeded PRNG, including the generator's, and a
fixed seed reproduces a byte-identical transformation across the whole response.
Two scopes: **request**, the default, which makes protected pages uncacheable
and is the point, and **page**, keyed on a document identity the adapter
supplies, which is the way back to a CDN. The CSP nonce is the one exception and
does not come from the seeded stream, so a page without a policy is
byte-identical for a fixed seed.

## Refusal

**HEO refuses when it cannot perform, never when it disapproves**.

| error | when |
| --- | --- |
| `HeoMarkupError` | markup that does nothing as written: malformed JSON, a substitute equal to its value, a mark inside a skipped tag or another mark, a `heo-chaff` that says nothing or carries both `options` and content, a `<heo-decoy>` |
| `HeoCoverageError` | a marked span no mechanism can take: a mark enclosing an element, a shuffle with fewer than three units, a run no available face can draw |
| `HeoCarrierError` | a page carrying `<heo-protect>` with no renderer or no size configured |
| `HeoHydrationError` | a hydrated SSR payload |
| `HeoCspError` | a policy a nonce cannot satisfy |

`onUnprotectable: "warn"` publishes an uncoverable span in the clear, knowingly,
and is the only way to get one. Malformed markup is not on that switch.

A page the publisher marked nothing in is left entirely alone — no chaff, no
declaration, no stylesheet, and its Content-Security-Policy is not HEO's business
either. **HEO audits nothing:** a value the publisher also put in their own meta
description, JSON-LD or `data-*` attribute stays there, because every mechanism
here is a rendering trick and a payload is not rendered.

## Content-Security-Policy

Everything HEO emits depends on one injected `<style>` element, and a policy
restricting `style-src` without `'unsafe-inline'` blocks it — which is not a
degraded page but a fabricated one, since the permutation is never inverted and
the chaff paints. By default HEO nonces its own stylesheet rather than refusing:
`'nonce-…'` on the directive that already governs style elements and on no
other, with no host, no scheme and never `'unsafe-inline'`. HEO emits no `style`
attribute anywhere, on any page, because a nonce authorises an element and never
an attribute; gate C8 asserts that corpus-wide and gate C2 verifies the policy
edit independently of the code that produced it.

## Boundaries

`@heo/core` knows nothing about host frameworks — every integration reduces to
`transformHtml`, and adapters that hold transformation logic are the main way
this design rots. Core loads neither the generator nor a font, taking a
`CarrierRenderer` as configuration, which is what keeps a Python or edge adapter
possible. `@heo/middleware` buffers and delegates: content type, body,
`transformHtml`, headers, output, plus the generator wiring so a publisher
installs one package and passes a font.

**Zero client-side JavaScript.** If reconstructing the human-readable page needed
HEO's own script, an attacker would inspect that script and get a reconstruction
function for free.

## Out of scope

Client-rendered SPAs, and hydrated SSR until per-framework payload node
synthesis exists. Side-channel payload rewriting. Languages beyond English,
which need HarfBuzz-class shaping. Font substitution. `subtle` / `balanced` /
`hostile` modes.

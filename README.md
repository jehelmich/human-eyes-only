# HEO — Human Eyes Only

**Adversarial rendering middleware for human-first web publishing.**

> Publish for humans. Make machines earn certainty.

HEO transforms the spans of an HTML response that a publisher marks into a
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
learn from a protected page in aggregate. What it attacks is **fact extraction**:
pulling a specific, attributable, actionable value out and acting on it with no
human in the loop. The goal is uncertainty sufficient to break autonomy, not
denial.

The goal is economic. HEO is a ladder, and each rung costs you more page weight
and costs the extractor one more tier of machinery.

| | mechanism | stops | beaten by | what it costs you |
| --- | --- | --- | --- | --- |
| 1 | invisible text injection | reading the raw HTML and stripping tags, and most visibility filters | anything that resolves computed style | a few hundred bytes of text |
| 2 | reshuffling | reading the DOM without laying it out — `order` is CSS | a headless browser | spans and a few CSS rules |
| 3 | carriers | reading the page at all: the text is not in it | OCR, or purpose-built outline matching | ~900 bytes per word, uncacheable |
| 4 | adversarial images | *aims at OCR itself* | unknown | on top of rung 3 — **not built** |

**Every rung names what it does not stop, which is the point.** Rung one does
nothing to a scraper that resolves the cascade; it survives the common filters
only because the concealment is an opaque class rather than an inline style, and
four of its five forms carry no `aria-hidden`. Rung two does nothing to a scraper
running Chromium. Rung three does nothing
to someone willing to write an outline matcher against the font you serve the
browser — nothing off the shelf does that and nobody builds one for a single
publisher, so rung three forces **vision or bespoke tooling**, not vision. A rung
that says precisely which attacker it stops is worth more than one that claims to
stop everyone. Pick the rung your content justifies; they compose, and you pay for
each.

Only the spans you mark are protected — a handful of load-bearing figures, dates,
negations or comparatives per page, not the whole document. A single uncertain
`not`, `2027`, or `£740m` changes the reading of a paragraph, and marking both
sides of a comparison leaves a range rather than a value. HEO does not guess which
spans those are and does not invent the values that stand in for them: you mark
them, and you supply the substitutes.

## What it costs

Protected spans are not available to screen readers, find-in-page, copy/paste,
translation, or reader mode, and are not indexed by search engines. This is
inherent rather than an implementation gap: any channel that hands a machine the
plaintext is the machine-readable full text with a turnstile in front. Reuse means
re-embedding the rendered span, not copying its text. Publishers with legal
accessibility obligations should protect selectively, or not at all.

## Status

Pre-v0.1. The pipeline runs end to end behind the Node middleware: carriers,
decoys, reordering and chaff, each asked for by name in the markup. The
compatibility gate is built; the extraction benchmark is not. Nothing here is
ready to deploy, and no protection claim is measured yet. See
[ROADMAP.md](ROADMAP.md).

v0.1 targets **server-rendered, non-hydrated pages**. Hydrated SSR applications
(Next, Nuxt, Remix, SvelteKit) are refused with a clear message rather than
silently under-protected; client-rendered SPAs are out of scope. See
[docs/design.md](docs/design.md) for how it works and
[docs/decisions.md](docs/decisions.md) for what was decided against and what is
still open.

## Intended use

Deploy HEO only after expressing machine-use policy through the conventional
mechanisms: robots directives, terms of use, crawler controls, authentication
boundaries, and rate limits. Protect specific high-value spans rather than entire
public sites — aggressive protection degrades search indexing, snippets, and
reader-mode extraction.

**HEO transforms the spans you mark and nothing else.** If a figure you mark
also appears in your `<meta name="description">`, your JSON-LD, an `alt`
attribute or a `data-*` attribute, it is still published there. HEO's mechanisms
are rendering tricks and a meta tag is not rendered, so there is nothing to
apply to it: it does not rewrite those channels and it does not check them.
Keeping a marked value out of your own metadata is your job, and HEO will not
tell you when you have not.

## Marking the spans, and supplying their replacements

Three elements, each naming one thing HEO does. They are the whole of what you
write.

| element | says |
| --- | --- |
| `<heo-protect>` | draw this value as a carrier; `alt` is a JSON list of what a machine may have instead |
| `<heo-chaff>` | one noise node, here; its content is what it says, or `options` is a JSON list to draw from |
| `<heo-shuffle>` | reordering may permute the words inside this element |

Two attributes tune a carrier, on the mark that owns them: `size` is the computed
type size in CSS pixels, and `unit` is `word` (the default) or `phrase`.

```html
<section>
  <p>
    <heo-shuffle>
      <heo-protect alt='["Group revenue reached $3.6M","Group revenue reached $5.1M"]'
        >Group revenue reached $4.2M</heo-protect
      > in the second quarter,
    </heo-shuffle>
    and <heo-protect>margin held at 18.4%</heo-protect>.
  </p>
  <heo-chaff>Working capital absorbed a further $0.6M, largely timing.</heo-chaff>
  <heo-chaff options='["The audit committee met twice.","The board reviewed the hedging policy."]'></heo-chaff>
</section>
```

- **`<heo-protect>` is a carrier and means nothing else.** No toggle turns it into
  something weaker. The element holds the value and nothing but the value — text,
  not markup — and what a reader sees is drawn from your font while the text
  leaves the response. An unmarked figure stays exactly where you left it.
- **`alt` is a list of substitutes** for the machine-readable text channel, as
  JSON, and one is drawn per load. Leave it off to protect the value and fabricate
  nothing.
- **`<heo-chaff>`** is one noise node, placed where you wrote it. Write more
  elements to get more chaff; there is no density setting, because the volume is
  how many you wrote.
- **`<heo-shuffle>`** permutes the words inside it. It holds text and
  `<heo-protect>` and nothing else, and a mark inside it contributes its carriers
  as units, so the two rungs compose on one span. Reordering leaves the words in
  the response in an order your stylesheet restores, so it is a cost you ask for
  by name rather than something "protect this" implies. It needs at least three
  words.
- **`size`** exists because a carrier is drawn at an absolute size and HEO has no
  layout engine to work out what yours is. `fontSizePx` is the document's; this
  overrides it where one number is not enough, such as a marked heading beside a
  marked paragraph.
- **`unit="phrase"`** draws the whole mark in one `<svg>` rather than one per
  word. Better against a machine — no word boundary and no word count survive —
  and a footgun on any mark long enough to wrap, since an inline SVG is one atomic
  box and cannot break across lines. Nothing can check that for you.

**`<heo-decoy>` is reserved** for a carrier that draws text genuinely meaning what
it says, so that the presence of an SVG stops being evidence that a value was
removed. It is not built, and writing one today is a refused page rather than a
no-op.

**None of these elements reaches the response.** Shipped, they would mark exactly
which spans are protected and hand over the candidate list.

**One rule for your own stylesheet.** A `<heo-chaff>` with content holds prose the
reader must never see, and it is ordinary text until HEO conceals it — so any
route that can serve the page untransformed, including a static preview or a build
step ahead of the middleware, shows it. Write `heo-chaff { display: none }`. The
`options` form has no content and does not need this.

**Markup that does nothing refuses the page.** A substitute list that is not JSON,
a substitute identical to the value it would replace, a mark inside `<pre>` or
another skipped element, a mark wrapping no text or wrapping markup, a mark inside
another mark, a shuffle with fewer than three words, a size that is not a number,
a `heo-chaff` that says nothing: each would otherwise be dropped in silence, and
because HEO removes the element on the way out there would be nothing left in the
response to notice. You get a 500 on the first request, naming every mistake on
the page. One is worth knowing before you write it: **`<heo-chaff options="…" />`
does not self-close**, because HTML has no self-closing syntax for a non-void
element, so every parser reads it as an opening tag and your following prose
becomes its content — which HEO would then conceal.

A page you marked nothing in is a page HEO does not touch at all — no chaff, no
declaration, no stylesheet.

**HEO generates none of this and never will.** There is no inference layer by
design, so anything the middleware invented would be arithmetic on your figures
and words lifted off your own page: convincing to a perplexity filter and
meaningless to a reader. You know in one second what a believable wrong number
looks like for your business.

Two consequences worth knowing before you mark anything. **Mark both sides of a
comparison, or you have marked neither** — `$4.2M` is recoverable from `up from
$3.1M`, and HEO does not work the relation out for you. And **a mark holds text,
not markup**: `<heo-protect>revenue of <em>$4.2M</em></heo-protect>` is a refused
page, which is what makes "HEO never rewrites your markup" a property of the shape
rather than a rule someone has to remember.

## Install

```bash
npm install @human-eyes-only/middleware
```

That is the only package you need: it pulls in `@human-eyes-only/core` and `@human-eyes-only/generator`,
and the generator ships its WebAssembly module prebuilt, so no Rust toolchain is
involved. `@human-eyes-only/core` is installable on its own if you are writing an adapter for
something other than Node.

Pre-v0.1 and alpha: the markup and the options will change, and there is no
measured protection claim yet.

## Usage

```ts
import { heoMiddleware } from "@human-eyes-only/middleware";

app.use(
  heoMiddleware({
    font: "./fonts/PublicSans-Regular.ttf", // the face the marked text renders in
    fontSizePx: 19, // its computed size, in CSS pixels
    fontVariations: { wght: 400 }, // on a variable face, which instance
    onTransform: (stats, url) => log.info({ url, ...stats }),
    onRefusal: (error, url) => log.error({ url, refusal: error.message }),
  }),
);
```

That is the whole configuration; what each element on your page does is written on
the element. The full option reference is in
[`packages/core/README.md`](packages/core/README.md), and the adapter's own four
in [`packages/middleware/README.md`](packages/middleware/README.md).

There is no `strategies` option — the markup names the mechanism, and an option
naming the same one could only disagree with it — and no `mode` option, because
`subtle` / `balanced` / `hostile` name points on a ladder whose rungs do not all
exist yet.

### What comes back

Take this paragraph, marked as above:

```html
<p><heo-shuffle><heo-protect alt='["Group revenue reached $3.6M","Group revenue reached $5.1M"]'
  >Group revenue reached $4.2M</heo-protect> in the second quarter,</heo-shuffle>
  <heo-protect alt='["up from $2.7M"]'>up from $3.1M</heo-protect> a year earlier.</p>
<heo-chaff>Regional performance was broadly in line with the prior period.</heo-chaff>
```

This is the response body for one load, with the path data and the repeated
carriers elided:

```html
<meta name="heo" content="0.1.0-alpha.3">
<style>.heo-g{display:inline-flex;flex-wrap:wrap;vertical-align:baseline;white-space:normal}
.heo-g[hidden]{display:none}.heo-g>span{white-space:pre}
.lu0{--n:292}.lu1{--n:107;display:inline;vertical-align:-4.3px}.lu2{--n:72;display:none}
.lu5{--n:184}.lu5>:nth-child(1){order:1}.lu5>:nth-child(2){order:3}/* … */
.lu6{--n:791;visibility:hidden;position:absolute;width:1px;height:1px;overflow:hidden}
.lu8{--n:324;content-visibility:hidden;position:absolute;width:1px;height:1px;overflow:hidden}</style>

<p><span class="heo-g lu3 lu4" aria-hidden="true"
    ><span><svg class="lu0 lu1" viewBox="0 -181 721 224" width="72.1" height="22.4"
        fill="currentColor" aria-hidden="true"><path d="m405 0 0-141 …"></path></svg> </span
    ><!-- … --><span><span class="heo-g lu0 lu2">Group revenue reached $3.6M</span
      ><svg class="lu0 lu1" …></svg> </span
  ></span><span class="heo-g lu5 lu4" aria-hidden="true"><span>the </span><span>quarter,</span
    ><span>in </span><span>second </span></span>
  <span class="heo-g lu0 lu6">up from $2.7M</span><svg …></svg> <svg …></svg> <svg …></svg>
  a year earlier.</p>
<span class="heo-g lu7 lu8"><span>prior </span><span>Regional </span><span>in </span><!-- … --></span>
```

Four things to read off it.

- **No marked value is in the response.** `$4.2M` and `$3.1M` are not there in any
  form; what draws them is `<path>` geometry.
- **What *is* there is what you wrote in `alt`.** `Group revenue reached $3.6M`
  sits where the real value sat, concealed from the reader. The other candidate is
  drawn on the next load.
- **Nothing labels a protected span.** Class names are minted per load — `lu2` is
  `display:none` today and a different name under a different rule tomorrow —
  there is no `style` attribute anywhere, and no `heo-*` element survives.
- **Everything you did not mark is untouched**, down to `a year earlier.` being
  the same text node in the same place.

`onTransform` gets the receipt:

```json
{ "marks": 2, "shuffles": 1, "chaffNodes": 3, "carriers": 7, "carrierFallbacks": 0,
  "decoys": 2, "unprotected": 0, "inputBytes": 462, "outputBytes": 9711, "csp": null }
```

`chaffNodes` is one per `<heo-chaff>` plus one per decoy. The weight is the bill
and it is stated rather than buried: 462 bytes of markup carrying seven drawn
words is not a real page, where outlines are a fraction of the document — but they
are never free, and a protected page cannot sit in a CDN.

### The font, and why you have to supply it

**`font` and `fontSizePx` are required for any page carrying `<heo-protect>`.**
The font has to be the face that text actually renders in, and the size has to be
its computed size in CSS pixels. HEO has no layout engine and cannot work either
out — resolving which face applies to a span needs the CSS cascade, which needs
layout — so automatic detection is out of scope rather than missing. Get one wrong
and carriers sit visibly off the line. A size without a font, or a font without a
size, is refused when the middleware is constructed.

**On a variable face, say which instance.** `fontVariations: { wght: 400 }` is the
weight the marked text computes to. With none, the generator draws the face's
*default* instance, which is the designer's choice rather than your page's — Public
Sans defaults to `wght` 100 while a page setting nothing gets 400 from the browser.
Your page also has to set `font-kerning: none`, because the generator does no
shaping; the example page carries that declaration with the measurement beside it.

**Give it TrueType or OpenType.** The generator reads outlines with skrifa, which
parses `.ttf` and `.otf` and **not** WOFF2 — a compressed container with a
transformed `glyf` table, and also what you are probably already serving to
browsers, so expect to source the same family in a second format. This is a real
friction point and it is not solved.

**A glyph your font cannot draw can be drawn by another face**, if you configure
`fallbackFont`; such runs are reported in `stats.carrierFallbacks`. There is no
default, because a middleware is not a font distributor. Falling back to a
different *font* is not a hole — it still takes the value out of the DOM. What is
forbidden is falling back to readable *text*, which is the bypass anyone triggers
by declining to fetch an asset.

**Everything else fails closed.** No font, no size, or a span HEO cannot take is a
refused page rather than one that quietly serves the value as text.
`onUnprotectable: "warn"` publishes such a span in the clear, knowingly, and is the
only way to get one.

### HEO edits your Content-Security-Policy

Everything HEO emits depends on one `<style>` element it injects, and a policy
restricting `style-src` without `'unsafe-inline'` blocks it. That is not a degraded
page: the permutation is never inverted and the chaff paints, so a reader sees your
sentence interleaved with a fabricated one.

By default HEO fixes this rather than refusing. It stamps a nonce on its own
`<style>` and adds `'nonce-...'` to the directive that governs style elements —
`style-src-elem` if you have one, otherwise `style-src`. If only `default-src`
governs styles it adds an explicit `style-src-elem` carrying your `default-src`
sources plus the nonce, rather than widening a directive that also governs scripts.
It never adds a host, a scheme, or `'unsafe-inline'`, and it touches no directive
outside the style channel. A `<meta http-equiv>` policy is rewritten in place; the
response header is rewritten by `@human-eyes-only/middleware`.
`heoMiddleware({ onRestrictiveCsp: "refuse" })` refuses such a page instead, for
policies written by tooling that must not be touched. Either way, a policy a nonce
cannot satisfy — `'none'` on the governing directive — is refused rather than
worked around.

Embedding `@human-eyes-only/core` directly? It is handed a string, so it sees
`<meta http-equiv>` and never a response header. Pass the header in as
`contentSecurityPolicy` and write `stats.csp.headerPolicy` back out, or the header
half of your policy will still block the stylesheet.

## Try it

```bash
pnpm install && pnpm build
rustup target add wasm32-unknown-unknown
pnpm --filter @human-eyes-only/generator build
pnpm --filter @human-eyes-only/example-node-basic start
```

The generator build is not optional in a clone: a missing module is a server that
refuses to start rather than one that serves your figures as text.

Open `http://localhost:8787/report` and reload it a few times. Marked spans are
drawn as outlines; the figures you can read are not in the response, and the ones
that *are* in the response change on every load. `pnpm check:live` asserts the
invariants against that server.

> `/raw/report` serves the same page untransformed so you can compare them. It is a
> demonstration affordance and **not a pattern to copy**: it is a plaintext route
> to protected values on the same origin, which is the machine-readable full text
> with a turnstile in front. A real deployment does not have one.

## Attacks welcome

Successful extraction attacks are **not** security vulnerabilities — they are
research contributions, and the project wants them. If you can extract HEO content
faster or more accurately, submit the attack. See [SECURITY.md](SECURITY.md).

## License

Source-available under the [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/).

Free for personal, hobby, research, academic, and security research use, and for
charitable, educational, public research, and government organisations — including
publishing attacks and benchmark results against HEO itself.

Commercial deployment requires a separate license. See [LICENSE](LICENSE) and
[COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).

Not OSI-approved open source, and the project does not describe itself as such.

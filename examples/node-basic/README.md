# example: node-basic

The smallest end-to-end demonstration of HEO: a plain Node HTTP server serving one
marked article through `@human-eyes-only/middleware`, with carriers on.

```bash
rustup target add wasm32-unknown-unknown
pnpm --filter @human-eyes-only/generator build     # once; the module is not committed
pnpm --filter @human-eyes-only/example-node-basic start
```

| route | what it is |
| --- | --- |
| `/` | index |
| `/report` | the marked article, transformed |
| `/raw/report` | the same bytes, untouched, for a side-by-side |

Open `/report` beside `/raw/report`. They read the same. Now read the transformed
one the way a machine does — view source, copy the paragraph, run it through an
extractor — and the figures are not there. What is there instead is a value the
publisher wrote, and it is different on the next load. `HEO_SEED=anything` pins the
transform so two runs can be diffed byte for byte.

The server does not start without the generator. There is no configuration here
that serves this page with carriers disabled: a page that looks protected and
publishes the value on every load is the failure a publisher never notices.

## What is actually happening

`pages/report.html` uses the three publisher-facing elements. None survives into
the response, which is the point rather than a detail — an element saying "this
span is protected" points an attacker at exactly what is worth vision compute.
For the same reason there is no explanatory comment in the page; this file is
where the explanation belongs.

- `<heo-protect>` marks one protected span and `alt` lists what a machine may have
  instead. Written without `alt` it protects the span and supplies nothing, which
  is honest but weaker: an extractor with a hole knows it has a hole.
- `<heo-chaff>` is one noise node where it is written. Five sit among the
  paragraphs; one carries `options` and says something different each load. The
  page's stylesheet hides the element, because its prose is ordinary text until
  HEO conceals it and `/raw/report` serves the page untransformed.
- `<heo-shuffle>` wraps two clauses, each holding a mark, so the words are
  permuted around the carriers the mark draws — two rungs on one span rather than
  a choice between them.
- `unit="phrase"` on the `$12.5M` mark draws the whole mark in one `<svg>`, so
  neither word boundary nor word count survives. It is safe there because the mark
  is one word: an inline SVG cannot break across lines, so the same attribute on a
  long mark lays out wrong the moment it has to wrap.

The `<pre>`, the `<form>` and every unmarked figure come through in the clear.
That is what "HEO protects what you mark" looks like from the outside. Get any of
the markup wrong and the server returns a 500 naming the mistake, because HEO
removes these elements and markup that quietly did nothing would leave no trace.

## Writing substitutes

This is the publisher's editorial work and it is the whole of the protection's
quality; HEO generates nothing and will not. A substitute has to survive the
cheapest check a reader can run, because an implausible one fails *upward* — it
tells them the page lied, which is worse than being unprotected. So on this page
every revenue candidate is above every prior-year candidate, or the sentence
would say "up from" about a fall; every acquisition multiple is below the 3.1x
the seller wanted; and the segment table is expressed as shares rather than
amounts, because a table of amounts adding up to the protected total would hand
the total back.

## The font is configuration, not a detail

The font arrives as a **declared dependency** rather than a file in this repository
or a script that fetches one: `@expo-google-fonts/public-sans` is a devDependency,
so pnpm's lockfile carries its integrity hash and an offline install already has
it. It is that package rather than Fontsource because it publishes **TrueType**;
Fontsource ships the same family as `woff2`, which the generator cannot read.

`src/server.ts` resolves the `.ttf`, serves those bytes for the `@font-face`,
and hands the same bytes to the generator. Both halves must be one file: the
generator has no rasteriser and no shaper, so a page whose text comes from
somewhere else disagrees with it. Public Sans is under the SIL Open Font License
and the generator builds its glyph table in memory at runtime, so nothing here
makes a Modified Version.

Two rules in `pages/style.css` are properties of the generator rather than
taste, and both are measured:

- **The same face, size and weight.** `fontSizePx` and `fontVariations` are
  publisher configuration because nothing can infer a computed size or weight from
  a string. `src/server.ts` holds both numbers and substitutes them into the
  stylesheet so the two cannot drift.
- **No kerning.** The generator does a cmap lookup and an advance per glyph and no
  shaping. At 19 px / `wght` 400, `AV` is 2.17 px narrower kerned, `7.2%` 1.92 px,
  `Ta` 1.12 px — three to four times what the carrier gate allows.

`font-variant-ligatures: none` used to be a third and is not: `liga` on against off
over `fi fl ffi ff office final flow` is zero differing pixels and zero width
delta, so the declaration bought nothing. `-webkit-font-smoothing` is the last line
and is cosmetic — without it the native text carries 13.8% more ink than the
carrier beside it, with it 0.2% — and it is macOS-only in both engines.

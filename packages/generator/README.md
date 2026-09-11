# heo-generator

Turns a short run of text into a randomised inline SVG carrier:
`(text, params, seed) -> SVG`. That contract is the whole package, and it is
language-neutral so the same generator serves the Node middleware today and
Python or edge adapters later.

## Not a rendering engine

Emitting SVG needs no rasterizer, only a font parser and a path serializer: read
glyph outlines and advance widths, position them, serialize with per-instance
randomization. No resvg, no skia, no canvas. The glyph table fills on first use
per font *instance*, because the publisher's font is configuration and the same
face at two weights is two sets of outlines.

Measured, that cache is worth 20–30% of per-call time and **the serializer is
worth 250%**, so `src/emit.rs` is the file to be careful in: coordinates are
integers in a user space of tenths of a pixel, commands are relative, a repeated
command letter is elided, and the separator before a negative number is elided
because the minus sign is one. Reaching for `format!("{:.2}")` or
`kurbo::to_svg` costs a factor of three in time and doubles the bytes at once.
Integers also make invariant 5 cheap across hosts, because float-to-decimal
formatting differs between Rust, JavaScript and Python and integers do not;
quantisation happens before serialization and must never move after it.

## Randomization axes

Seeded and reproducible — the PRNG is core's `createRng` reimplemented, and
a test holds it to vectors captured from the JavaScript side. Three axes are
built: **control-point jitter**, which is the same axis as quantisation at an
amplitude of 0.05 px against a user space of tenths of a pixel; **contour order**,
permuted across the whole run, since nonzero-winding fill makes it unobservable in
the ink; and **attribute order** on the element.

Not built, and **two of them are load-bearing**. Subpath start rotation and path
decomposition order change the *structure* of an outline while leaving the ink
identical, and structure is what a shape matcher keys on. Matching glyph
outlines against a font is the standard published counter to font-based
anti-scraping, and it works on near-exact coordinate arrays; jitter alone does
not stop it, but an outline that decomposes differently on every load has no
stable key to match against.

Glyph boundaries are not an axis, they are absent: the whole run serializes as one
`<path>`, which is smaller and leaves nothing in the markup for a segmenter.

## Build and ABI

Rust compiled to WASM, so consumers need no native toolchain. A plain `cdylib`
with a four-function C ABI — `heo_alloc`, `heo_free`, `heo_init`, `heo_generate`
— and no `wasm-bindgen`. `heo_generate` returns one buffer: twelve bytes of
little-endian metrics (advance, ascent, descent, in tenths of a pixel) followed
by UTF-8 SVG.

`heo_init` takes the font file. `heo_generate` takes the text, seed, size, jitter
amplitude and the **variation instance** — `wght=400`, spelled the way CSS spells
it. The instance rides on the call rather than on `heo_init` because it describes
the text and not the file, and metrics, advances and outlines are all read at it
together: reading one at the default and another at 400 draws a carrier that sits
right on the line and is the wrong weight.

```bash
cargo build --release --target wasm32-unknown-unknown
```

353 KB after `scripts/optimise.mjs`, 144 KB gzipped. For scale, `harfbuzzjs`
ships 417 KB containing all of HarfBuzz and `@resvg/resvg-wasm` ships 2.4 MB.

## The Node host

`@heo/generator/host` wraps the module in the `CarrierRenderer` interface
`@heo/core` takes as configuration. Core never loads the `.wasm` and does not
know one exists.

```ts
import { readFileSync } from "node:fs";
import { createCarrierRenderer } from "@heo/generator/host";

const renderer = createCarrierRenderer({
  font: new Uint8Array(readFileSync("./fonts/YourFace-Variable.ttf")),
  // Tried, in order, for a run the first face has no outline for.
  fallbacks: [new Uint8Array(readFileSync("./fonts/Fallback.ttf"))],
});

transformHtml(html, {
  carrier: { renderer, fontSizePx: 16, variations: { wght: 400 } },
});
```

Build it first — `pnpm --filter @heo/generator build` — because the artifact is
derivable and deliberately not committed. One WebAssembly instance serves one
face, because the ABI keeps the parsed face in a thread-local; a fallback is a
second instance over the same compiled module. A run drawn by a fallback comes
back with `fallback: true` and core counts it; `null` is what core turns into a
refusal.

## Integration requirements

- **The publisher's actual font file**, because baseline, x-height and advance
  widths must match the surrounding text.
- **A variable font needs its instance named.** With no `variations` the generator
  draws the face's default instance, which is the designer's choice and not the
  page's — Public Sans defaults to `wght` 100 against a page that almost certainly
  sets 400.
- **The page must stop shaping too.** There is no kerning here, so set
  `font-kerning: none`; a kerned token is 1.1–2.2 px narrower at 19 px, three to
  four times what the carrier gate allows.
- **Match the antialiasing.** A browser rasterises text with its own gamma and
  fills a path with plain coverage AA, so identical geometry can read paler at
  half-pixel stems. `-webkit-font-smoothing: antialiased` closes it, and no gate
  catches it. With these in place a carrier lands within 0.10 px horizontally and
  0.19 px vertically of the text it replaced, with ink within 0.8% — see
  `benchmark/compat/carrier.ts`.
- **Shaping stays trivial only while the project is English-only.** Kerning lives
  in GPOS in most modern fonts and neither `skrifa` nor `read-fonts` implements
  GPOS positioning. Digits are usually uniform-width and unkerned, which is why
  this is shippable for figures and not for prose; `harfrust` is the contained fix.
- **The font file is passed in, never embedded**, both because the publisher's own
  face is the point and because OFL clause 5's document exemption rests on the file
  staying pristine.

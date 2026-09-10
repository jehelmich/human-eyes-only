# heo-generator

Turns a short run of text into a randomised inline SVG carrier.

```text
(text, style, params, seed) -> SVG
```

That contract is the whole package. It is deliberately language-neutral so the
same generator serves the Node middleware today and Python or edge adapters
later — making it the project's **second reusable core** alongside
`transformHtml`.

## Not a rendering engine

Emitting SVG needs no rasterizer. It needs a font parser and a path serializer:
read glyph outlines and advance widths, position them, serialize with
per-instance randomization. No resvg, no skia, no canvas, no native graphics
stack.

The expensive half is done once. **Glyph path tables precompute per font and
style at startup**, so per-request work is transform, jitter, serialize —
microseconds rather than milliseconds. That is what makes per-load randomization
affordable rather than aspirational
(see [docs/decisions.md](../../docs/decisions.md)).

## Randomization axes

All near-free once the glyph table is warm, and between them no two emissions of
the same word are byte-identical or shape-identical:

- control-point jitter
- subpath start rotation
- path decomposition order
- coordinate precision noise
- transform expressed as `translate` versus `matrix`
- attribute ordering
- background, alpha, and obfuscation parameters

Seeded and reproducible, same contract as the planner.

## Build

Rust compiled to WASM, so consumers need no native toolchain and the module runs
anywhere Node does — and ports to edge runtimes later. A native N-API build can
follow if profiling justifies it.

```bash
wasm-pack build --target nodejs
```

## Integration requirements

- **It needs the publisher's actual font file.** Baseline, x-height, and advance
  widths must match the surrounding text or carriers will visibly jump on the
  line. A config input, not a detail.
- **Shaping stays trivial only while the project is English-only.** Kerning needs
  little more than the kern table; complex scripts need HarfBuzz-class shaping,
  which is a different weight class entirely.

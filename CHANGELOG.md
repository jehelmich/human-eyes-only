# Changelog

## 0.1.0-alpha.3

Release automation test. Package contents are unchanged from alpha.2 except for
the runtime-reported HEO version; publishing now uses npm trusted publishers
instead of a long-lived npm token.

## 0.1.0-alpha.2

Compatibility release. No API or behavior changes; package versions and the
runtime-reported HEO version were advanced together for npm publication.

## 0.1.0-alpha.1

First release. Pre-v0.1: the markup and the options will change, and no
protection claim is measured yet.

### What works

A publisher marks spans with three custom elements and HEO transforms exactly
what is marked, inferring nothing.

```html
<heo-protect alt='["$3.9M","$4.6M"]'>$4.2M</heo-protect>
<heo-chaff options='["a","b"]'></heo-chaff>
<heo-shuffle>text whose words may be permuted</heo-shuffle>
```

- **`heo-protect`** draws the span as inline SVG outlines from the publisher's
  own font, leaving one of their substitutes — drawn fresh on every load — in
  the position the value held. `unit="phrase"` renders the whole mark as one
  image; `size` overrides the type size for that element.
- **`heo-chaff`** adds concealed text, from its content or from `options`, under
  one of five concealments.
- **`heo-shuffle`** permutes the words inside it with CSS `order`.

Three rungs of an escalation ladder, each costing page weight and buying one
more tier of extractor machinery. Each rung documents what it does *not* stop.

- `@heo/middleware` — Node adapter. Buffers, transforms, writes headers and
  wires the generator over the publisher's font. No fallback face ships with it:
  configure `fallbackFont` or a glyph the publisher's face cannot draw is a
  refusal.
- `@heo/core` — the engine. Framework-neutral, synchronous, pure.
- `@heo/generator` — text to randomised SVG, Rust compiled to WebAssembly, with
  the module prebuilt in the package.

### What does not work

- No measured protection claim. The compatibility gate is built; the extraction
  benchmark is not.
- Carriers force vision **or bespoke tooling**, not vision. The structural
  randomisation that would keep outline matching expensive is not built.
- `heo-shuffle` is an atomic inline flex container and does not fragment across
  lines, so a shuffled run can re-wrap a paragraph.
- Protected spans are unavailable to screen readers, find-in-page, copy/paste,
  translation, reader mode and search indexing. This is inherent, not a gap.
- HEO reaches the rendered document and nothing else. A value you mark that also
  sits in your own `<meta>` description or JSON-LD is still published there;
  HEO neither rewrites those nor checks them.
- Server-rendered, non-hydrated pages only. Hydrated SSR is refused with a
  message; client-rendered SPAs are out of scope.
- Protected pages are not CDN-cacheable under the default request scope, which
  is the point rather than a defect. `randomization: "page"` trades that
  back, and what it gives up is unmeasured.

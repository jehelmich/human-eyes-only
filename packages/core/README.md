# @heo/core

The framework-neutral transformation engine. `@heo/core` takes an HTML string and
returns an HTML string, and must not know about Express, Fastify, Next.js, Flask,
or any other host framework — every integration reduces to
`transformHtml(html, config)`.

The pipeline is in [docs/design.md](../../docs/design.md); the publisher's three
elements are documented once, in the [root
README](../../README.md#marking-the-spans-and-supplying-their-replacements).
Every mechanism here works on text: a `heo-protect` holding markup, or a
`heo-shuffle` holding anything but text and marks, raises `HeoCoverageError`
rather than being served as written, which makes "HEO never rewrites your
markup" a property of the shape rather than a rule to remember.

## Configuration

`transformHtml(html, config)` takes a `HeoConfig`. Everything is optional.

| option | default | what it does |
| --- | --- | --- |
| `randomization` | `"request"` | Seed scope: `"request"` varies every load, `"page"` is stable per `documentKey`. Request scope is the point and makes a page uncacheable; page scope is the way back to a CDN. |
| `seed` | none | Pins the transformation in either scope. With it, a fixed input gives byte-identical output. |
| `documentKey` | hash of the input | Document identity for `randomization: "page"`, normally the request path. `@heo/middleware` passes the request URL. |
| `carrier.renderer` | `null` | The generator, supplied by the host. **Required on any page carrying `<heo-protect>`.** `@heo/middleware` wires `@heo/generator` over a font for you. |
| `carrier.fontSizePx` | none | **Required for every mark that does not carry its own `size`.** The computed type size of the protected text. |
| `carrier.variations` | `{}` | Where in the font's variation space to draw, by axis tag: `{ wght: 400 }`. Empty is the face's own default instance, which is the designer's choice rather than the page's. A tag the face has no axis for is ignored. |
| `onUnprotectable` | `"refuse"` | What to do when HEO cannot transform a span the publisher pointed at. `"warn"` publishes it knowingly. |
| `onRestrictiveCsp` | `"nonce"` | What to do about a policy that blocks the injected `<style>`. `"nonce"` adds `'nonce-…'` to the directive governing style elements and to no other; `"refuse"` refuses the page. |
| `contentSecurityPolicy` | none | The response header, for an adapter that can see one. Read the rewritten policy back out of `stats.csp.headerPolicy`. |
| `debug` | `false` | Emits `data-heo-mark-id` and `data-heo-shuffle-id` on every transformed run. Never enable in production: it labels every protected span, which is exactly what announcing at document level avoids. |

That is the whole surface. There is no option that names a mechanism, because
the markup does and an option naming the same one could only disagree with it:
no `strategies`, no `mode`, no `selectors`, no `native`. There is no `chaff`
block at all — a `<heo-chaff>` places itself, so volume and placement are how
many you wrote and where, and the last of it went with `stackBehind`. Nothing in
the configuration relaxes a stated property. There is no `carrier.jitterPx`,
because the amplitude is fixed at the value that perturbs rounding without
moving ink.

## What comes back

```ts
const { html, stats } = transformHtml(input, { carrier: { renderer, fontSizePx: 19 } });
```

`stats` is what the run did, and it is the only report: nothing is written to
the page about which spans were protected.

| field | what it counts |
| --- | --- |
| `marks`, `shuffles`, `chaffNodes` | elements the publisher wrote, and one noise node per `heo-chaff` plus one per decoy |
| `carriers`, `carrierFallbacks` | words drawn as outlines, and how many of those a fallback face drew |
| `decoys` | marks whose substitute went into the channel the carrier vacated |
| `unprotected` | spans served as text anyway. Non-zero only under `onUnprotectable: "warn"` |
| `inputBytes`, `outputBytes`, `durationMs` | the bill |
| `seed` | the resolved seed, so a run can be replayed byte for byte |
| `csp` | `{ nonce, headerPolicy }`, or null when no policy needed one |

## Refusals

Every one is a thrown error rather than a degraded page, because a page that looks
protected and publishes the value is the failure a publisher does not notice.

| error | cause |
| --- | --- |
| `HeoMarkupError` | Publisher markup that does nothing as written. Carries every problem on the page. |
| `HeoCoverageError` | A span HEO was pointed at and cannot transform: a mark holding markup, a shuffle holding markup or with fewer than three words, or a run no configured face has an outline for. |
| `HeoCarrierError` | No generator, or no `fontSizePx`. Both set `configuration`, which an adapter must not pass through. |
| `HeoHydrationError` | A hydrated SSR page, which is out of scope. |
| `HeoCspError` | A policy a nonce cannot satisfy, or `onRestrictiveCsp: "refuse"`. |

## Carriers are supplied, not loaded

```ts
transformHtml(html, { carrier: { renderer, fontSizePx: 16 } });
```

Core takes the generator as configuration rather than loading it, so the package
keeps no build step, no binary, and no second implementation of the seeded PRNG
. `renderer` is anything satisfying `CarrierRenderer`, and it must be
deterministic in its seed — invariant 5 is a claim about the whole response, so
a host supplying something else owns the guarantee. `@heo/middleware` does this
wiring on the publisher's behalf; this is the seam that keeps a Python or edge
adapter possible.

A renderer may report `fallback: true` on a run it drew from a face other than the
publisher's, counted in `stats.carrierFallbacks`. That is not a plaintext
fallback: a carrier in another face still takes the value out of the DOM.
Returning `null` — nothing available could draw the run — is what becomes an
unprotectable span.

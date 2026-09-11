# corpus

Frozen HTML snapshots with committed ground-truth text. Nothing here is fetched at
test time — tests that depend on the live web are not tests.

| Tier             | Content                                                    | Have | Target |
| ---------------- | ---------------------------------------------------------- | ---- | ------ |
| `T0-minimal`     | Hand-written minimal documents                             | 14   | ~25    |
| `T1-semantic`    | Classic semantic HTML: blogs, docs, encyclopedia articles  | 0    | ~50    |
| `T2-cms`         | CMS output: WordPress, Ghost, Substack, newsroom templates | 0    | ~50    |
| `T3-ssr`         | SSR framework output: Next, Nuxt, SvelteKit, Astro, Remix  | 3    | ~30    |
| `T4-adversarial` | RTL, CJK, ruby, MathML, shadow DOM, CSP shapes, SVG, bidi  | 12   | ~40    |

Everything present is **synthetic**. That is honest for T0 and for the T3
documents, which exist to exercise hydration refusal and need only the framework's
signature. It is not sufficient for T1 and T2, which are about what real
publishers emit, so those tiers have no directory rather than one filled with
documents only HEO's authors would write.

```text
<tier>/<slug>/
  input.html      the frozen snapshot
  truth.txt       ground-truth visible text
  meta.json       provenance, archetype, licence, key phrases
```

A captured document without provenance and licence is rejected by the loader,
which is strict about shape on purpose: a lenient one gives you a corpus that
silently shrinks. Two `meta.json` fields carry expectations rather than
description — `expectRefusal`, which the R gate asserts, and `notes`, which says
why a document exists.

## Documents carry publisher marks

The engine protects what the publisher marked and nothing else, so an unmarked
corpus would make the engine a near-identity and the gate score 29/29 while
testing nothing. **25 of the 29 documents carry `<heo-protect>`**, most with a
`<heo-shuffle>` and one or more `<heo-chaff>`. The markup is part of the
snapshot: a corpus document is what a publisher would actually serve.

The compat run has no generator, so `<heo-protect>` is not drawn here — a
carrier comes from the publisher's font file and a corpus document has none. The
run sets `onUnprotectable: "warn"` and exercises the permutation, chaff, element
removal, invariant 2, reparse, structure, idempotence and budget.

Deliberately unmarked: `T0-minimal/no-marks`, which must come back
byte-identical with no declaration, and the three `T3-ssr` documents, refused
for hydration before anything is read. `T0-minimal/json-ld-duplicate` and
`meta-duplicate` are worked examples of the limit the README documents — a
marked figure the publisher's own side channel republishes, served clean. The
unmarked figures inside a marked document are not an oversight either: they are
what a publisher chose to publish, and the gate should see them come through
untouched.

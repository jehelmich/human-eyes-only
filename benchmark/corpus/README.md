# corpus

Frozen HTML snapshots with committed ground-truth text. Nothing here is fetched
at test time — tests that depend on the live web are not tests.

| Tier             | Content                                                   | Target |
| ---------------- | --------------------------------------------------------- | ------ |
| `T0-minimal`     | Hand-written minimal documents                             | ~25    |
| `T1-semantic`    | Classic semantic HTML: blogs, docs, encyclopedia articles  | ~50    |
| `T2-cms`         | CMS output: WordPress, Ghost, Substack, newsroom templates | ~50    |
| `T3-ssr`         | SSR framework output: Next, Nuxt, SvelteKit, Astro, Remix  | ~30    |
| `T4-adversarial` | RTL, CJK, ruby, MathML, shadow DOM, strict CSP, AMP, ...   | ~40    |

Each document is a directory:

```text
<tier>/<slug>/
  input.html      the frozen snapshot
  truth.txt       ground-truth visible text
  meta.json       provenance, licence, archetype, key phrases
```

`meta.json` records where the document came from and under what licence it is
redistributable. Do not commit a snapshot without it.

See [ROADMAP.md](../../ROADMAP.md).

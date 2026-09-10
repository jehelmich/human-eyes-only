# HEO — Human Eyes Only
## Technical Specification and Repository Blueprint

**Status:** Draft v0.1  
**Project type:** Source-available adversarial web-rendering middleware  
**Initial target:** Server-side website middleware for HTML responses  
**Primary languages:** TypeScript/Node.js for the first implementation  
**Future adapters:** Python ASGI/WSGI, framework-specific integrations, edge runtimes  
**Core objective:** Increase the cost, uncertainty, and engineering burden of automated text extraction while preserving a clear and usable human-facing page.

---

# 1. Executive Summary

HEO ("Human Eyes Only") is middleware for human-first web publishing.

It transforms selected HTML content into a heterogeneous rendered representation that remains legible and semantically correct to a human reader while making low-cost automated extraction less reliable.

HEO is **not** access control, encryption, DRM, or a guarantee that machines cannot recover public content. Anything rendered for a human can ultimately be recovered by a sufficiently capable automated system.

The project instead targets a different property:

> **Make automated extraction materially more expensive, less deterministic, and less trustworthy than reading the page as rendered.**

HEO should force an extractor to move progressively from:

```text
HTTP GET
→ strip HTML
→ parse text
```

toward:

```text
HTTP GET
→ execute browser
→ resolve CSS/layout/fonts/SVG
→ render
→ OCR / vision
→ reconcile conflicting representations
→ confidence checks
→ possible human validation
```

HEO therefore acts as an **adversarial rendering layer** rather than a conventional anti-bot system.

It should normally be deployed only after a publisher has already expressed machine-use policy through mechanisms such as robots directives, terms of use, crawler controls, authentication boundaries, rate limits, or equivalent controls.

---

# 2. Product Thesis

The modern web unintentionally provides two interfaces at once:

1. a visual interface for humans; and
2. a highly structured machine-readable representation for automated systems.

For many publishers, these two interfaces need not have identical extraction economics.

HEO separates them.

The browser still receives everything necessary to render the authoritative human-visible content, but the cheapest machine-readable representation may contain:

- decoy text,
- reordered fragments,
- hidden chaff,
- substituted glyph mappings,
- SVG-rendered spans,
- raster-rendered spans,
- composited text whose semantic truth exists only after layout,
- or combinations of the above.

The project should optimize for **silent extraction uncertainty**, not merely obvious corruption.

An extractor returning garbage knows it has failed.

An extractor returning fluent but mutually inconsistent interpretations must spend additional resources establishing which interpretation is authoritative.

---

# 3. Initial Scope

Version 0.x should support **one integration model only**:

> **HEO as middleware that transforms outgoing HTML responses.**

Do not initially build separate packages for React, Next.js, Flask, Django, FastAPI, Rails, etc.

Instead, define a single generic transformation API that can sit between an application server and the client.

Example conceptual pipeline:

```text
Application
    ↓
HTML response
    ↓
HEO middleware
    ↓
protected HTML + supporting assets
    ↓
Browser
```

The first implementation should target **Node.js HTTP middleware** because it provides the shortest path to a working prototype while remaining framework-neutral.

Adapters for Express, Fastify, Next.js, Hono, Python ASGI, and other platforms should later wrap the same core transformation engine.

---

# 4. Initial Integration Experience

The minimum successful integration should be approximately:

```ts
import { heoMiddleware } from "@heo/middleware";

app.use(
  heoMiddleware({
    mode: "balanced"
  })
);
```

HEO should not transform every string by default.

Protection should be explicitly scoped using one or more mechanisms.

Preferred initial mechanism:

```html
<article data-heo>
  Proprietary or machine-sensitive content.
</article>
```

Optional later alternatives:

```html
<div class="heo-protected">...</div>
```

or middleware selectors:

```ts
heoMiddleware({
  selectors: [
    "article[data-premium]",
    ".research-body"
  ]
});
```

The initial contract should therefore be:

1. application generates normal HTML;
2. developer marks protected regions;
3. HEO parses the HTML;
4. HEO transforms only those regions;
5. HEO inserts required CSS/fonts/assets/runtime metadata;
6. browser receives the transformed document.

---

# 5. Design Principles

## 5.1 Human-visible content is authoritative

The final rendered page must preserve the publisher's intended meaning.

HEO must never intentionally alter the visible meaning of protected content.

All deceptive or poisoned representations exist only in non-authoritative machine-facing layers.

## 5.2 Heterogeneity beats a single obfuscation

A universal transformation is easy to learn and reverse.

HEO should support multiple rendering carriers and vary them across:

- spans,
- pages,
- deployments,
- builds,
- or requests.

## 5.3 Protect information density, not character count

HEO should preferentially protect semantically load-bearing tokens such as:

- numbers,
- monetary values,
- percentages,
- dates,
- named entities,
- negations,
- comparatives,
- directionality words,
- relationship verbs,
- qualifiers,
- legal/modal terms,
- technical terms.

A single corrupted word such as `not`, `increased`, `2027`, or `£740m` can alter the interpretation of an entire paragraph.

## 5.4 Cheap techniques are useful as chaff

Techniques such as:

- zero-size elements,
- hidden spans,
- off-screen text,
- white-on-white text,
- pseudo-elements,
- irrelevant DOM nodes,

should not be treated as strong protection.

They are useful because they create false positives around stronger mechanisms.

## 5.5 Avoid a single reliable fallback

If every protected span can be recovered by one fixed rule, the system has failed architecturally.

HEO should make the attacker's reliable fallback increasingly close to:

> render the page exactly as a browser does.

## 5.6 Accessibility degradation must be explicit

HEO can conflict with:

- screen readers,
- browser find,
- copy/paste,
- translation tools,
- reader mode,
- search indexing,
- assistive tooling.

The library must make these trade-offs visible and configurable rather than pretending they do not exist.

## 5.7 Economic deterrence, not secrecy

HEO's security claim is not:

> machines cannot read this.

It is:

> high-confidence automated extraction should require materially more work than ordinary web scraping.

---

# 6. Threat Model

HEO should define attack tiers.

## Tier A — Naive scraper

Examples:

- `requests`
- `curl`
- BeautifulSoup
- Cheerio
- basic regex extraction
- raw `textContent`

Expected outcome:

**Strong corruption or incomplete extraction.**

## Tier B — Structured HTML extractor

Examples:

- boilerplate removal,
- Readability,
- DOM heuristics,
- visibility filters,
- Unicode normalization,
- custom font inspection.

Expected outcome:

**Significant semantic uncertainty.**

## Tier C — Browser-aware extractor

Examples:

- Playwright,
- Puppeteer,
- Selenium,
- computed style inspection,
- DOM bounding-box reconstruction,
- CSS-aware ordering.

Expected outcome:

**Recovery becomes possible but materially more expensive.**

## Tier D — Pixel extractor

Examples:

- browser screenshot,
- OCR,
- document vision pipeline,
- screenshot + layout recovery.

Expected outcome:

**Most content may be recoverable, but at significantly increased cost.**

## Tier E — Adaptive HEO-aware extractor

Attacker:

- knows the HEO source code,
- recognizes HEO,
- parses transformations,
- instruments Chromium,
- extracts font mappings,
- identifies HEO markers,
- maintains custom recovery logic.

Expected outcome:

**HEO must remain an economic/maintenance burden through randomized and heterogeneous transformations.**

HEO does not claim to defeat Tier E permanently.

---

# 7. Non-Goals

HEO v0.x should explicitly not attempt to provide:

- authentication,
- authorization,
- paywalls,
- encryption,
- bot identity verification,
- CAPTCHA,
- rate limiting,
- CDN firewall functionality,
- robots policy enforcement,
- legal enforcement,
- DRM,
- guaranteed crawler prevention,
- guaranteed training-data poisoning,
- guaranteed adversarial robustness against arbitrary VLMs.

HEO may later integrate with systems that provide these functions.

---

# 8. System Architecture

The initial architecture should be split into six logical stages.

```text
        ┌───────────────────────┐
        │  1. Response Capture  │
        └───────────┬───────────┘
                    ↓
        ┌───────────────────────┐
        │  2. Protected Region  │
        │      Discovery        │
        └───────────┬───────────┘
                    ↓
        ┌───────────────────────┐
        │  3. Semantic Span     │
        │      Selection        │
        └───────────┬───────────┘
                    ↓
        ┌───────────────────────┐
        │  4. Strategy Planning │
        └───────────┬───────────┘
                    ↓
        ┌───────────────────────┐
        │  5. Representation    │
        │      Rendering        │
        └───────────┬───────────┘
                    ↓
        ┌───────────────────────┐
        │  6. Document Assembly │
        └───────────────────────┘
```

A seventh offline stage should exist for benchmarking:

```text
7. Attack / Extraction Benchmarking
```

---

# 9. Stage 1 — Response Capture

## Purpose

Intercept outgoing HTML documents before they are sent to the client.

## Input

```ts
{
  statusCode: number;
  headers: Headers;
  body: string | Buffer;
}
```

## Responsibilities

- detect HTML responses;
- bypass non-HTML payloads;
- bypass unsupported compressed bodies unless middleware owns decompression;
- optionally skip responses above configured size limits;
- preserve status code;
- preserve unrelated headers;
- update `Content-Length`;
- adjust CSP if required;
- inject HEO assets.

## Initial constraints

v0.x should support:

- UTF-8 HTML;
- uncompressed internal response body;
- server-side HTML responses;
- full-document transforms.

Streaming transforms may come later.

---

# 10. Stage 2 — Protected Region Discovery

## Purpose

Find areas of the document explicitly authorized for transformation.

## Default marker

```html
<section data-heo>
```

## Optional configuration

```ts
{
  selectors: [
    "[data-heo]",
    ".heo-protected"
  ]
}
```

## Rules

HEO must not transform:

- scripts,
- styles,
- form controls,
- navigation unless explicitly included,
- ARIA metadata by default,
- hidden application state,
- JSON-LD,
- metadata,
- title tags,
- structured data.

Protected region discovery should emit an internal tree:

```ts
interface ProtectedRegion {
  id: string;
  element: HTMLElementNode;
  textNodes: TextNode[];
  originalText: string;
}
```

---

# 11. Stage 3 — Semantic Span Selection

## Purpose

Determine which fragments are worth moving away from ordinary machine-readable text.

## v0.x selector

The first implementation should use deterministic rules rather than an LLM.

Suggested high-value detectors:

### Numeric spans

Regex/token rules for:

```text
£14.2m
$700 million
23%
2027
14 September 2026
1.2x
-17%
```

### Negation and polarity

```text
not
never
without
failed
rejected
declined
increased
decreased
approved
denied
```

### Comparison language

```text
more
less
higher
lower
above
below
greater
smaller
```

### Named entities

Initially optional.

May use lightweight deterministic heuristics or external NLP integration later.

### Random baseline sampling

A configured fraction of ordinary words should also be selected.

This prevents attackers from assuming that only financial/semantic tokens receive unusual rendering.

## Selector output

```ts
interface SemanticSpan {
  id: string;
  regionId: string;
  original: string;
  start: number;
  end: number;

  importance:
    | "critical"
    | "high"
    | "normal";

  category?:
    | "number"
    | "date"
    | "negation"
    | "comparison"
    | "entity"
    | "verb"
    | "random";
}
```

---

# 12. Stage 4 — Strategy Planning

## Purpose

Assign each selected span to a rendering strategy.

The planner should be randomized but reproducible when supplied a seed.

Example:

```ts
interface StrategyPlan {
  spanId: string;
  strategy:
    | "native"
    | "decoy"
    | "reorder"
    | "overlay"
    | "svg"
    | "font";

  seed: string;
  options: Record<string, unknown>;
}
```

## Modes

### `subtle`

Goal:

- minimal page overhead;
- defeat naive extraction.

Suggested distribution:

```text
native       60%
decoy        15%
reorder      15%
overlay       5%
font          5%
```

### `balanced`

Goal:

- moderate overhead;
- require layout awareness for high fidelity.

Suggested:

```text
native       35%
decoy        20%
reorder      15%
overlay      15%
svg          10%
font          5%
```

### `hostile`

Goal:

- maximize extraction uncertainty;
- experimental.

Suggested:

```text
native       15%
decoy        20%
reorder      15%
overlay      20%
svg          20%
font         10%
```

These ratios should remain defaults, not protocol guarantees.

---

# 13. Stage 5 — Representation Strategies

Each strategy should conform to a common interface.

```ts
interface Renderer {
  name: string;

  canRender(span: SemanticSpan, ctx: RenderContext): boolean;

  render(
    span: SemanticSpan,
    ctx: RenderContext
  ): RenderResult;
}
```

---

# 14. Strategy: Native

Normal text.

Purpose:

- preserve ordinary page behavior;
- prevent every protected span from appearing suspicious;
- reduce page overhead.

```html
<span>revenue</span>
```

---

# 15. Strategy: Semantic Decoy

The machine-readable text differs from the visually authoritative representation.

Conceptually:

```html
<span class="heo-decoy">
  declined
</span>
```

with a visual layer rendering:

```text
increased
```

The decoy should preferably be:

- grammatical;
- semantically plausible;
- similar in length;
- typographically compatible.

Avoid obvious random garbage.

v0.x decoys can use static dictionaries.

Example:

```ts
{
  increased: ["declined", "remained", "shifted"],
  approved: ["rejected", "delayed", "reviewed"],
  higher: ["lower", "similar"],
}
```

For numbers, bounded transformations may be used in non-authoritative layers:

```text
14.2 → 41.2
23%  → 32%
2026 → 2028
```

Important:

The human-visible representation must remain exact.

---

# 16. Strategy: Reordered DOM

Split text into fragments whose DOM order differs from visual order.

Example DOM:

```html
<span class="heo-grid">
  <span style="--p:3">profit</span>
  <span style="--p:1">Operating</span>
  <span style="--p:4">rose</span>
  <span style="--p:2">margin</span>
</span>
```

CSS determines human reading order.

Attack requirement:

A scraper must inspect layout rather than trust DOM order.

v0.x should operate at word boundaries.

Character-level reordering should be deferred because it risks accessibility and typography issues.

---

# 17. Strategy: Overlay / Compositing

Multiple text layers are placed in the same visual space.

Example conceptual layers:

```text
Layer A: approved acquisition £74m
Layer B: rejected acquisition £740m
Mask:       ██████               █
Visible: rejected acquisition £74m
```

The authoritative text emerges only from composition.

Possible CSS primitives:

- `position:absolute`;
- `clip-path`;
- overflow clipping;
- masks;
- z-index;
- transparent glyph regions;
- transforms.

This strategy is important because neither underlying textual layer necessarily contains the complete visible sentence.

---

# 18. Strategy: SVG Path

Selected words are converted into vector glyph outlines.

Avoid:

```html
<svg>
  <text>£14.2m</text>
</svg>
```

because the semantic text remains extractable.

Prefer:

```html
<svg aria-hidden="true">
  <path d="..."/>
</svg>
```

The initial implementation does not need to rasterize arbitrary fonts perfectly.

A prototype may:

1. choose one bundled compatible font;
2. obtain glyph outlines server-side;
3. construct paths;
4. preserve baseline and width.

Later versions can derive outlines from site fonts.

---

# 19. Strategy: Font Substitution

Use custom font mappings or OpenType substitution so DOM character sequences differ from visually rendered content.

Design objective:

- mappings should be generated per build, deployment, or response;
- a single permanent global mapping should be avoided.

Potential variants:

```text
character permutation
word substitution
ligature substitution
GSUB phrase mapping
```

v0.x should consider this experimental because font generation adds substantial complexity.

The API should support it even if the first release ships it disabled.

---

# 20. Chaff Generator

The chaff system is separate from semantic protection.

Its purpose is to create ambiguous suspicious-looking elements so attackers cannot reliably classify unusual DOM as protected payload.

Possible chaff:

```html
<span style="font-size:0">...</span>
<span style="opacity:0">...</span>
<span style="position:absolute;left:-9999px">...</span>
<span aria-hidden="true">...</span>
```

Other possibilities:

- zero-width Unicode;
- pseudo-element content;
- duplicate words;
- benign SVG;
- invisible overlapping fragments;
- random data attributes.

Rules:

1. chaff must not affect visible layout;
2. chaff must not create interactive elements;
3. chaff volume must be bounded;
4. chaff must be reproducibly generated from a seed for debugging.

---

# 21. Stage 6 — Document Assembly

The assembler combines transformed regions with the original document.

Responsibilities:

- replace protected text nodes;
- inject generated CSS;
- inject generated SVG defs if required;
- add font resources if required;
- add an optional HEO document marker;
- preserve the rest of the HTML unchanged.

Potential marker:

```html
<meta name="heo" content="1">
```

However:

A production mode may omit explicit identification.

The project should distinguish:

```ts
debug: true
```

from normal output.

Debug mode may include:

```html
data-heo-strategy="svg"
data-heo-span-id="..."
```

Production should remove these.

---

# 22. Runtime Assets

v0.x should strive for **zero client-side JavaScript**.

This is important.

If the final human rendering requires HEO JavaScript to reconstruct protected text, an attacker can inspect the same runtime.

Prefer server-generated:

- HTML;
- CSS;
- SVG;
- fonts.

Client-side JavaScript should only be introduced when there is a specific strategy that justifies it.

---

# 23. Determinism and Randomness

HEO should support seeded randomness.

```ts
heoMiddleware({
  seed: process.env.HEO_SEED
});
```

Useful scopes:

```ts
randomization: "build"
randomization: "page"
randomization: "request"
```

### Build

Same transformation until deployment changes.

Best for:

- static sites;
- caching.

### Page

Different mapping per URL/document.

Best balance for many sites.

### Request

Different transformation for repeated requests.

Strongest variation but worst caching characteristics.

The planner should expose a deterministic PRNG abstraction.

---

# 24. Caching

The initial project should document three deployment modes.

## Static transform

Transform HTML during build.

Pros:

- zero runtime transform cost;
- CDN friendly.

Cons:

- transformations remain stable.

## Origin middleware

Transform every origin response.

Pros:

- easiest initial implementation;
- request-level randomization possible.

Cons:

- origin CPU cost;
- cache interactions.

## Edge transform

Future.

Pros:

- high entropy near client;
- CDN integration.

Cons:

- restricted runtimes;
- font/vector tooling may be unavailable.

v0.x should target **origin middleware**.

---

# 25. Configuration API

Initial suggested interface:

```ts
type HeoMode =
  | "off"
  | "subtle"
  | "balanced"
  | "hostile";

interface HeoConfig {
  mode?: HeoMode;

  selectors?: string[];

  randomization?:
    | "build"
    | "page"
    | "request";

  seed?: string;

  strategies?: {
    native?: boolean;
    decoy?: boolean;
    reorder?: boolean;
    overlay?: boolean;
    svg?: boolean;
    font?: boolean;
  };

  selector?: {
    criticalTokens?: boolean;
    numericTokens?: boolean;
    negations?: boolean;
    dates?: boolean;
    randomSampleRate?: number;
  };

  chaff?: {
    enabled?: boolean;
    density?: number;
  };

  accessibility?: {
    mode?: "strict" | "balanced" | "off";
  };

  debug?: boolean;
}
```

Usage:

```ts
app.use(
  heoMiddleware({
    mode: "balanced",
    selectors: ["[data-heo]"],
    randomization: "page",

    selector: {
      numericTokens: true,
      negations: true,
      dates: true,
      randomSampleRate: 0.03
    },

    chaff: {
      enabled: true,
      density: 0.05
    }
  })
);
```

---

# 26. Repository Structure

Start with a TypeScript monorepo even if only one package is initially published.

Recommended structure:

```text
heo/
├── README.md
├── SPEC.md
├── LICENSE
├── LICENSE-COMMERCIAL.md
├── CONTRIBUTING.md
├── SECURITY.md
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
│
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── parser/
│   │   │   ├── selector/
│   │   │   ├── planner/
│   │   │   ├── decoys/
│   │   │   ├── chaff/
│   │   │   ├── renderers/
│   │   │   ├── assembler/
│   │   │   └── index.ts
│   │   └── test/
│   │
│   └── middleware/
│       ├── src/
│       │   ├── node.ts
│       │   └── index.ts
│       └── test/
│
├── benchmark/
│   ├── corpus/
│   ├── extractors/
│   │   ├── raw-html/
│   │   ├── cheerio/
│   │   ├── readability/
│   │   ├── playwright/
│   │   └── ocr/
│   ├── metrics/
│   └── runner/
│
├── examples/
│   └── node-basic/
│
├── website/
│
└── research/
    ├── notes/
    ├── papers/
    └── experiments/
```

The important boundary is:

```text
@heo/core
```

must not know about Express, Next.js, Fastify, Flask, etc.

It should expose roughly:

```ts
const result = transformHtml(html, config);
```

Everything else should be an adapter.

---

# 27. Core Package Interface

```ts
import type { HeoConfig } from "./config";

export interface TransformResult {
  html: string;

  stats: {
    regions: number;
    spans: number;
    strategies: Record<string, number>;
    inputBytes: number;
    outputBytes: number;
    durationMs: number;
  };
}

export function transformHtml(
  html: string,
  config?: HeoConfig
): TransformResult;
```

This interface is deliberately simple.

It allows future adapters to be written in minutes.

---

# 28. Middleware Package Interface

Generic Node middleware concept:

```ts
import { heoMiddleware } from "@heo/middleware";

app.use(
  heoMiddleware({
    mode: "balanced"
  })
);
```

Middleware responsibilities:

1. inspect response content type;
2. buffer HTML;
3. invoke `transformHtml`;
4. update headers;
5. return transformed HTML.

The middleware should not contain transformation logic.

---

# 29. Benchmark Architecture

Benchmarking should be treated as a first-class feature from the beginning.

Every HEO release should be measurable against multiple extractors.

## Corpus

Create synthetic documents containing:

- prose;
- financial statements;
- legal clauses;
- tables;
- dates;
- numbers;
- negation;
- technical terminology.

Each document has an authoritative ground truth.

Example:

```json
{
  "id": "finance-001",
  "groundTruth": "Operating profit increased 23% to £14.2 million.",
  "html": "..."
}
```

## Extractors

Initial baseline extractors:

### Raw

```text
strip tags
normalize whitespace
```

### Cheerio

DOM text extraction.

### Readability

Reader-mode extraction.

### Playwright DOM

Browser-rendered page, then:

```js
document.body.innerText
```

### Playwright visual ordering

Collect:

```text
text node
bounding rect
computed style
```

and reconstruct reading order.

### OCR

Screenshot page and run an OCR backend.

Keep OCR provider pluggable.

---

# 30. Benchmark Metrics

HEO should avoid claiming success based on simple edit distance alone.

Measure:

## Character accuracy

Useful but insufficient.

## Word accuracy

Token-level fidelity.

## Numeric accuracy

Critical.

Example:

```text
£14.2m vs £41.2m
```

should receive a severe penalty.

## Semantic fidelity

Compare meaning against authoritative text.

Initially this can use manually labeled benchmark assertions.

Later it may use model-assisted scoring.

## Critical token recovery

Percentage of selected critical spans recovered correctly.

## Silent corruption rate

Percentage of extractions that:

1. appear syntactically valid;
2. contain incorrect semantics;
3. do not contain obvious corruption markers.

## Extraction latency

```text
milliseconds/page
```

## Compute/resource usage

Where measurable:

```text
CPU time
browser time
OCR requests
model tokens
```

## Page overhead

```text
output HTML bytes / input HTML bytes
generated font bytes
SVG bytes
server transform latency
browser render latency
```

---

# 31. Primary Project KPI

The project's headline metric should be:

> **Cost to achieve a target semantic fidelity.**

For example:

```text
Extractor                     Fidelity   Relative cost

Raw HTML                        61%           1x
DOM heuristics                  79%           4x
Computed layout                 93%          80x
OCR                             97%         900x
OCR + reconciliation            99%        4000x
```

The exact numbers must always be benchmark-derived.

Do not hard-code marketing claims.

---

# 32. Testing

## Unit tests

Each stage independently.

Examples:

```text
selector identifies percentage
selector identifies negation
planner deterministic under seed
SVG renderer preserves expected width
reorder renderer changes DOM order
assembler preserves unprotected HTML
```

## Snapshot tests

Store transformed HTML for deterministic seeds.

## Browser visual regression

Use Playwright screenshots.

Ensure:

```text
original render ≈ HEO render
```

within a defined visual tolerance.

## Semantic regression

Confirm browser-visible authoritative text remains correct.

## Accessibility tests

Run automated accessibility checks.

Track degradation explicitly.

---

# 33. Debugging Mode

Debug mode should make HEO inspectable.

Example:

```ts
{
  debug: true
}
```

Could emit:

```html
<span
  data-heo-span="29"
  data-heo-category="number"
  data-heo-strategy="svg"
>
```

and console/server diagnostics:

```text
HEO
Regions protected:       3
Tokens inspected:      842
Spans transformed:      37
Critical spans:         14

native:                  12
decoy:                    8
reorder:                  7
overlay:                  6
svg:                      4

HTML overhead:          +9.1%
Transform time:         4.8 ms
```

Production mode strips debug attributes.

---

# 34. Safety and Correctness Constraints

HEO must never:

- alter form submissions;
- alter user-generated input fields;
- alter script contents;
- alter executable code;
- alter URLs;
- alter structured machine interfaces accidentally;
- generate misleading visible text;
- create invisible clickable elements;
- interfere with CSRF/security controls;
- change page semantics outside explicitly protected regions.

HEO should default to skipping:

```text
code
pre
script
style
textarea
input
select
option
button
svg
math
```

unless a future version explicitly supports them.

---

# 35. Accessibility Modes

## Strict

Prioritize accessibility.

Allowed:

- modest DOM reordering only when screen-reader order remains correct;
- low-impact chaff;
- no semantic decoy accessible to assistive technology.

Protection strength is lower.

## Balanced

Permit some visual-only representations while attempting usable fallbacks.

This mode should display warnings in development.

## Off

Publisher explicitly accepts accessibility degradation for the protected region.

HEO must require explicit configuration for this mode.

---

# 36. SEO and Indexing

HEO should assume that aggressive protection can degrade:

- search indexing,
- snippets,
- rich results,
- reader-mode extraction.

Therefore documentation should recommend protecting **specific high-value content regions**, not entire public websites indiscriminately.

Possible publisher pattern:

```html
<header>
  machine-readable summary
</header>

<article data-heo>
  protected detailed content
</article>
```

---

# 37. Licensing Model

The desired project model is:

> source-available, free for private, personal, educational, and research use; commercial deployment requires a license.

Do not describe this as OSI-approved open source unless the eventual license qualifies.

Repository should contain:

```text
LICENSE
COMMERCIAL-LICENSE.md
```

The free license should clearly define:

- personal use;
- noncommercial use;
- academic research;
- security research;
- modification;
- redistribution;
- publication of attacks and benchmarks.

Commercial license should cover:

- production deployment by businesses;
- embedding in commercial products;
- managed services;
- OEM use;
- commercial redistribution.

White-glove implementation should remain a separate service offering rather than a software tier.

Legal review is required before release.

---

# 38. Security Research Policy

HEO should actively encourage attempts to defeat it.

`SECURITY.md` should distinguish:

### Vulnerabilities

Examples:

- XSS;
- malformed output;
- CSP bypass;
- arbitrary file access;
- denial of service.

### Successful extraction attacks

These are **not security vulnerabilities**.

They are research contributions.

The project should encourage:

```text
heo-breakers/
```

or benchmark pull requests.

Suggested attitude:

> If you can extract HEO content faster or more accurately, submit the attack.

---

# 39. Version 0.1 Milestone

The first usable release should be deliberately narrow.

## Required

- TypeScript;
- `@heo/core`;
- generic Node middleware;
- `[data-heo]` selector;
- semantic token selection;
- seeded planner;
- native renderer;
- decoy renderer;
- DOM reorder renderer;
- basic chaff;
- Playwright regression tests;
- raw HTML benchmark;
- Cheerio benchmark;
- Playwright `innerText` benchmark;
- example Node server.

## Explicitly deferred

- SVG paths;
- generated fonts;
- raster snippets;
- adversarial OCR perturbations;
- VLM benchmark;
- Python middleware;
- edge execution;
- CDN service;
- cloud control plane.

The goal of v0.1 is to validate the architectural thesis:

> Can a low-overhead middleware transformation substantially reduce extraction fidelity for cheap scrapers without degrading the rendered page?

---

# 40. Version 0.2 Milestone

Add:

- overlay/compositing renderer;
- SVG path renderer;
- visual bounding-box attack benchmark;
- numeric/financial benchmark suite;
- more sophisticated decoy generation;
- page-level strategy randomization;
- page-size and latency telemetry.

---

# 41. Version 0.3 Milestone

Add:

- custom font renderer;
- generated mappings;
- per-page font randomization;
- font inversion benchmark;
- OCR benchmark;
- screenshot pipeline;
- extraction-cost comparison.

---

# 42. Research Track

Research should run beside the production library rather than block it.

Potential research projects:

## Semantic token importance

How few altered tokens are required to substantially reduce extraction reliability?

## Extraction disagreement

Can HEO maximize disagreement between:

```text
raw DOM
innerText
visual ordering
OCR
VLM
```

without affecting human perception?

## Adversarial glyph rendering

Can visually imperceptible glyph perturbations reduce OCR/VLM reliability across multiple models?

## Transferability

Do perturbations transfer between:

- Tesseract;
- cloud OCR;
- browser OCR;
- multimodal models?

## Compression robustness

Do effects survive:

- screenshots;
- JPEG;
- WebP;
- resizing;
- device pixel ratio changes?

## Adaptive attackers

How quickly can an HEO-aware extractor recover?

## Economics

What is the cost ratio between:

```text
ordinary extraction
```

and

```text
99.9% reliable extraction
```

under each HEO mode?

---

# 43. Infrastructure

Initial infrastructure should stay small.

## GitHub

Use:

- GitHub Actions;
- Dependabot/Renovate;
- issue templates;
- benchmark result artifacts;
- branch protection.

## Package management

Recommended:

```text
pnpm
```

with workspaces.

## Build

Recommended:

```text
tsup
```

or equivalent lightweight ESM/CJS build tooling.

## Tests

```text
Vitest
Playwright
```

## Formatting/linting

Choose one low-friction stack.

For example:

```text
Biome
```

or:

```text
ESLint + Prettier
```

Avoid unnecessary tooling complexity in the first release.

---

# 44. Continuous Integration

Every pull request should run:

```text
typecheck
unit tests
browser tests
visual regression
benchmark smoke test
bundle-size check
```

Nightly or manual benchmark runs can execute the expensive extractor matrix.

CI should produce a machine-readable report:

```json
{
  "version": "0.1.0",
  "extractors": {
    "raw": {...},
    "cheerio": {...},
    "playwright-innertext": {...}
  }
}
```

This makes longitudinal benchmarking straightforward.

---

# 45. Example End-to-End Flow

Input:

```html
<article data-heo>
  Operating profit increased 23% to £14.2 million in 2026.
</article>
```

Selector detects:

```text
increased
23%
£14.2 million
2026
```

Planner assigns:

```text
increased       decoy
23%             reorder
£14.2 million   overlay
2026            native
```

Assembler might emit conceptually:

```html
<article data-heo>
  Operating profit

  <!-- decoy-backed visual representation -->
  ...

  <!-- reordered percentage -->
  ...

  <!-- composited currency value -->
  ...

  in 2026.
</article>
```

Human render:

```text
Operating profit increased 23% to £14.2 million in 2026.
```

Cheap DOM extraction:

```text
Operating profit declined 32% to £41.2 million in 2026.
```

Browser-aware extraction:

```text
Operating profit increased 23% to £41.2 million in 2026.
```

Pixel extraction:

```text
Operating profit increased 23% to £14.2 million in 2026.
```

The desired property is progressive recovery with progressive cost.

---

# 46. Recommended Initial Implementation Order

Build in this order:

```text
1. monorepo scaffolding
2. core HTML parser
3. protected-region discovery
4. text tokenization
5. semantic selector
6. deterministic planner
7. native renderer
8. decoy renderer
9. reorder renderer
10. chaff generator
11. assembler
12. Node middleware
13. demo website
14. raw/DOM extraction benchmark
15. Playwright benchmark
16. visual regression
17. package documentation
```

Do **not** start with fonts or adversarial OCR.

Those are interesting but would slow validation of the core architecture.

---

# 47. Definition of Success for the First Prototype

HEO v0.1 succeeds if all of the following are true:

1. Integration into a basic Node website requires fewer than roughly ten lines of configuration.
2. Developers can mark protected content with `data-heo`.
3. Human-visible rendering remains effectively indistinguishable from the original.
4. Raw HTML extraction loses substantial semantic fidelity.
5. Generic DOM extraction performs materially worse than against the original document.
6. Browser-based recovery performs better, demonstrating the intended escalation path.
7. HEO adds acceptably low page weight and server latency.
8. Transformations are reproducible under a fixed seed.
9. Strategy modules can be added without changing the middleware API.
10. The benchmark suite makes claims reproducible.

---

# 48. Long-Term Architecture

If the initial hypothesis succeeds, the architecture can expand without breaking the original API:

```text
                       @heo/core
                           │
            ┌──────────────┼──────────────┐
            │              │              │
          Node           Python          Edge
            │              │              │
         Express         ASGI          Workers
         Fastify         WSGI          CDN
         Next.js         Django
```

All integrations should continue to reduce to:

```text
HTML in
→ HEO transform
→ HTML out
```

This keeps the project conceptually simple even as the research becomes sophisticated.

---

# 49. Project Identity

Recommended project description:

> **HEO — Human Eyes Only**
>
> Adversarial rendering middleware for human-first web publishing.

Possible tagline:

> **Publish for humans. Make machines earn certainty.**

Alternative:

> **The web has a rendering engine. Make scrapers use it.**

The README should be explicit about the project's limits:

> HEO does not make public information secret. It increases the cost and uncertainty of automated extraction by deliberately separating machine-readable structure from authoritative human-visible rendering.

---

# 50. Immediate Next Step

The first repository commit should contain only:

```text
README.md
SPEC.md
LICENSE placeholder
package.json
pnpm-workspace.yaml
packages/core/
packages/middleware/
examples/node-basic/
benchmark/
```

Then implement the smallest possible vertical slice:

```text
[data-heo]
→ parse protected region
→ replace one selected token with a decoy/visual pair
→ serve through middleware
→ prove raw extraction differs from browser-visible text
```

Once that path works end-to-end, add additional strategies one at a time and require each strategy to demonstrate measurable benefit in the benchmark suite before it becomes enabled by default.

# Decisions

Why HEO is built the way it is, for the parts that belong to no single file.

Most of the reasoning has a home in the code it governs, and that is where it
lives: why a carrier is one `<path>` is in the generator, why concealment is a
class and never a `style` attribute is in the stylesheet, why a mark holds text
and never markup is in the parser. [design.md](design.md) is how the system
works, [CONTRIBUTING.md](../CONTRIBUTING.md) holds the invariants, and
[ROADMAP.md](../ROADMAP.md) holds the state, the known defects and the open
measurements. What is left here is two things that would otherwise be written
nowhere: the dead ends, so nobody rebuilds one, and the questions the project
has not answered.

## Dead ends

**Font substitution is dead, not experimental.** Every Chinese cmap-remapping
deployment fell to under 200 lines of attacker code, and ShieldFont — the
GSUB-ligature variant built to dodge exactly that attack, and the closest
existing project to HEO — was inverted by joining two tables in the same file,
11,962 of 11,962 pairs, by its own authors. A font that ships with the page ships
its own inverse. This is why carriers are drawn outlines rather than a remapped
face, and it takes static cmap remapping with it.

**Raster carriers are rejected.** They are 3.7x the gzipped weight of the vector
form, but weight is not what settles it. **CSP has no way out**: a nonce
authorises a `<style>` or `<script>` element and can never authorise an image, so
raster reinstates a permanent refusal on every strict-CSP page — the case vector
delivery exists to survive. **Theming is lost**, because `currentColor` is what
inherits dark mode. And **it does not buy what it is for**: the attacker holds
the font, so matching its rendered glyphs against the bitmap is the same attack
in pixel space with the off-the-shelf half made easier, and a shipped bitmap is
already the input Tesseract wants. The general lesson is the part worth keeping —
**the representation is not the vulnerability.** Changing the container only
picks which matcher they write; what raises the cost is rendering *unfaithfully*
in ways a reader tolerates, and making a successful match still not resolve the
value.

**Glyph perturbation is closed.** Gradient-based perturbation is unavailable to
us: published cross-model transfer runs 6–33%, and the one paper reaching 83–100%
*untargeted* transfer to Tesseract reaches 0–19.6% *targeted*, halved again by a
2×2 blur. HEO needs the targeted, black-box, unknown-stack case, and that cell is
empty in every published table. The cheap typographic levers are worse than
useless, because stroke weight, per-glyph jitter, rotation and irregular
baselines are named augmentations in the recognisers' own training pipelines
(STRAug, MJSynth) — so jitter stays a cache-defeating cost lever and is not
described as protection. The strategic conclusion is what orders the roadmap:
**supplying a wrong answer is cheaper than inducing one**, so decoys and
candidate sets come before any perturbation work. One question a stage earlier is
still open; see below.

**Side-channel payload rewriting is out of scope permanently, not deferred.**
HEO once scanned a served page for a marked value sitting in a `<meta>`
description, a JSON-LD payload, `<noscript>` or a `data-*` attribute, and refused
to serve when it found one. Three reasons outrank that. **The mechanisms cannot
reach there anyway** — everything HEO does is a rendering trick and a meta tag is
not rendered, so the guard could only decline to do its job elsewhere and explain
why. **It is inconsistent with the engine protecting what the publisher marked
and nothing else**, which is the same "we know better" removed from selection.
And **refusing a production page over a meta tag is a hostile default for
middleware**: the failure is advisory, and the publisher who marked the span
knows what else is on their page. What was lost, stated plainly: a publisher can
mark a figure their own JSON-LD republishes, get a clean 200, and be no better
protected than before, with nothing in the system to say so. The README says so
instead, and `benchmark/corpus/T0-minimal/{json-ld,meta}-duplicate` keep two
worked examples.

**Whole-document rendering.** It multiplies page weight, breaks reflow, and
protects character count rather than information density. Which spans are worth
the bill is the publisher's editorial judgement, and this takes it away.

**HEO emitting its own Content-Security-Policy.** A policy is default-deny once
present, so emitting `style-src 'nonce-abc'` onto a page that had none takes the
publisher's own styles off the list; policies combine by intersection, so a
second header can only restrict further; and there is no per-origin-of-markup
scoping, so any rule tight enough to discipline HEO's output breaks the
publisher's. Editing a policy that already exists is a different act and is what
HEO does.

**`subtle` / `balanced` / `hostile` modes are deferred until the rungs exist.**
They were defined against a strategy set that has since changed twice, and naming
points on a ladder before the rungs exist is guessing. Build each mechanism,
verify it, measure what it costs and what it buys; the useful groupings will be
visible in the data. Until then there is one behaviour with direct parameters and
no mode selector ships.

**Reject any strategy whose stated mechanism is that it breaks the tokeniser**,
before implementation rather than after. The literature is consistent that models
are largely invariant to word-order permutation (Sinha et al. ACL 2021; Cao et
al. EMNLP 2023; Liu et al. 2025), and none of it reports the silent confident
error such a strategy is after. Permutation survives in HEO as a *cost*
mechanism, which is a claim about the tier of tool an attacker needs and not
about corruption.

**Tarpits are a different product.** Something like Cloudflare AI Labyrinth traps
a crawler to waste its budget; HEO serves the page once and lets it leave
believing it has the contents.

**Not dead — untested at our tier.** Homoglyphs, zero-width characters and the
Unicode tag block are patched by frontier providers and sophisticated scrapers,
which is not the same thing as dead against the commodity extractors most
crawling runs on. More generally, check the tier a finding was measured at before
treating it as settled: most published robustness results are about frontier
models or targeted attackers, and a verdict from the wrong tier is a hypothesis
rather than a result.

## What is open

**There is no extraction benchmark, so there is no measured protection claim.**
Everything the project says about cost is an argument until the suite exists. Two
requirements on it are already known. It must report a **pair** — cost to reach a
fidelity target alongside cost to reach a *verified* fidelity target, because
what breaks autonomy is whether the extractor can tell which part it got wrong,
and the gap between those columns is the product. And it must report
**per-extractor** rather than in aggregate, or it will flatter the project:
chaff is priced as dilution against naive extractors and `aria-hidden` is a
default discard rule in the two most-used ones.

**Two structural randomisation axes are unbuilt and load-bearing.** An attacker
holding the font — which they do, because it is served to the browser — can parse
a carrier's `d` attribute and match contours against the font's own outlines
without rasterising anything. That is the standard published counter to
font-based anti-scraping and jitter does not stop it. **Subpath start rotation
and path decomposition order do**, because they change the structure while
leaving the ink identical, and what makes the published technique cheap is that
the same glyph serializes the same way every time. Until they exist the honest
claim is "forces vision *or* bespoke tooling", not "forces OCR".

**Whether advance widths can steer a detector into segmenting wrongly** — and
whether the recogniser then returns a confident wrong string rather than nothing
— is the one part of the perturbation space that is not closed (M6). It sits a
stage earlier than glyph perturbation, at detection rather than recognition.

**Reader mode is an unaccounted failure path.** ShieldFont documents Safari
Reader Mode showing the human the decoy: invariant 1 failing in the reader's
favour, on an engine nobody has tested HEO against, and no compatibility gate
covers it (M15).

**A compliance exposure nobody has written about.** DSM Article 7(2) pulls in
InfoSoc Article 6(4) — Germany's §95b UrhG lists both §44b and §60d — obliging a
rightholder whose technical measure blocks a lawful-access beneficiary to supply
the means to benefit. The answer HEO would give is an **authenticated
out-of-band** channel: identity-bound, granted per requester, never offered by
the page and untrippable by a crawler, which is a different mechanism from the
in-band channel the project rejects. That is an argument, not advice, and it is
still on the legal review list.

**Page weight has no guidance.** Carriers run 1.52x input and 2.29x with decoys
and chaff, measured on a short page at protection rate 1, so both are upper
bounds. Nobody has said what a publisher should accept, or at what point the bill
argues for marking fewer spans (M1, M5).

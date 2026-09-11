# compat — the compatibility gate

Answers one question, on every change: **how much real-world HTML can HEO touch
without breaking it?** For each corpus document, transform it and assert the
result is equivalent everywhere a human or a legitimate consumer can observe.

| ID  | Gate                        | Assertion                                                      | Needs |
| --- | --------------------------- | -------------------------------------------------------------- | ----- |
| R   | Refusal expectation         | A document marked `expectRefusal` is refused, and nothing else is | — |
| C1  | Re-parse stability          | Parse-serialize is a fixed point                                | — |
| C2  | Non-interference away from a mark | Input and output trees identical except at a tagged element | — |
| C3  | Visual fidelity             | Page width, reading order and painted ink, 3 viewports, light and dark | browser |
| C4  | Clean console               | No new errors, CSP violations, or hydration warnings            | browser |
| C5  | Executable script untouched | Every `<script>` byte-identical, in order                       | — |
| C8  | Structural non-interference | Forms, inputs, styles and URLs preserved; no `style` attribute added | — |
| C9  | Idempotence                 | `transform(transform(x))` equals `transform(x)`                 | — |
| C10 | Budget                      | `output <= fixed + ratio * input` for the document's size class | — |
| C12 | No span-level marker survives | No `heo-*` element and no `data-heo*` attribute in a transformed response | — |

Everything except C3 and C4 runs on a parsed document, fast enough for every push.
Every gate except C10 is absolute — one violation fails the document.

**C3 gates page width, reading order and painted ink**, and reports page height,
horizontal displacement and the raw pixel ratio without gating them. The rule it
encodes is that the reader gets the same words in the same order; they do not
have to get the same line breaks. A raw pixel ratio cannot distinguish anything
— a chaff sentence painting in full view measured 0.084% differing pixels and a
sub-pixel glyph shift measured 0.349% — while ink separates the two by three
orders of magnitude.

**C10 is a fixed term plus a ratio**, not a bare ratio: the document-level
declaration does not scale with the document, so on a 300-byte page it is the
entire measurement.

**C12 exists because it was checked rather than assumed.** With the stripping pass
disabled the engine still scored a clean 29/29 on every other gate. A surviving
`heo-*` element is an index of exactly which spans are worth vision compute and,
where candidates were written, the list an attacker would otherwise have to
resolve. The gate is conditioned on the document marker, so identity passes
without exemption.

## Waivers

`waivers.json` is the third option between a gate that stays red and a gate
loosened until it passes. A waived document is never counted as clean, a waiver
whose gate did not fail is stale and fails the run, and waivers are scoped to a
transformation. The list is empty, and that is the state to keep it in.

## Asserted directly, not per document

**Concealment neutrality.** Whether a chaff node costs layout is a property of
the CSS declarations, not of twenty-nine documents, so `concealment.ts` renders
each kind with the runtime stylesheet applied and requires the page to be
byte-identical with the node present and absent. Five of five pass, and every
kind is gated rather than some reported. The declarations are delivered as an
opaque class rather than a `style` attribute, the way the engine delivers them,
so the check tests the cascade HEO actually ships.

**Carrier alignment.** A carrier is drawn from the publisher's own font file,
and a corpus document has none, so a corpus-wide carrier run would measure the
distance between two fonts on whichever machine ran it. `carrier.ts` builds a
TrueType font in memory, embeds it as a `data:` URL and hands the generator the
same bytes, then compares token for token: within half a pixel in x, y and
width, ink within 2%, page the same size. Five cases, including a page under
`style-src 'self'` and the two halves of a glyph the primary face cannot draw.
It needs the generator built and reports itself **skipped** rather than passing
when it is not.

## Running it

```bash
pnpm compat                       # identity transform, every tier, static gates
pnpm compat -- --transform heo    # the engine
pnpm compat -- --browser          # add C3 and C4
pnpm compat -- --tiers T0,T4
pnpm compat -- --filter table
```

`--browser` needs Chromium:
`pnpm --filter @human-eyes-only/benchmark exec playwright install chromium`.

Exit status is the gate. The identity transform must score 100% — anything less is
a bug in the harness, found while it is still free. The headline output is the
percentage of documents per tier transformed with zero violations, reported by
failure cause.

**Never trade a gate for a score.** See [ROADMAP.md](../../ROADMAP.md).

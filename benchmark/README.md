# HEO benchmark harness

Two kinds of measurement, and they are not equal.

- **A gate is pass or fail.** Does the transformed page still work for a human, a
  screen reader, a translator, and the publisher's own framework?
  [`compat/`](compat/) is the gate, and it is built.
- **A score is continuous.** How much does extraction cost, and how often does it
  fail silently? The extraction suite is not built; what it has to report is in
  [ROADMAP.md](../ROADMAP.md).

> **Never trade a gate for a score.**

```text
corpus/       frozen HTML snapshots with ground truth, tiers T0-T4
compat/       the compatibility gate: R, C1-C5, C8-C10, C12
runner/       orchestration and machine-readable report emission
optical/      M10's OCR half: what an engine reads at sub-perceptual contrast
```

[`optical/`](optical/) is neither a gate nor a score. It is a standalone Python
suite answering one open measurement, kept out of the pnpm workspace because it
has no runtime relationship to `@heo/core`.

```bash
pnpm compat                       # the gate, identity transform, every tier
pnpm compat -- --transform heo    # the gate against the engine
pnpm compat -- --transform heo-carrier   # and with carriers actually drawn
pnpm compat -- --browser          # plus C3's pixel diff and C4's console
```

The browser run also asserts two things directly rather than inferring them from
whichever corpus document happens to expose them: that every chaff concealment
is layout-neutral, and that a carrier lands on the baseline of the text it
replaced.

Every suite here runs against the **identity transform** before it runs against
the engine: the gate must score 100% on identity, and anything less is a bug in
the harness found while it is still free. JSON reports land in `results/` and are
not tracked.

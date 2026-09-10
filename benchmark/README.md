# HEO benchmark harness

Two harnesses, and they are not equal.

- **[`compat/`](compat/) is a gate.** Pass or fail. Does the transformed page
  still work for a human, a screen reader, a translator, and the publisher's own
  framework? A change that breaks a page is rejected regardless of how much
  protection it adds.
- **[`extraction/`](extraction/) is a score.** Continuous. How much does
  extraction cost, and how often does it fail silently?

> **Never trade a gate for a score.**

Every protection technique makes a page stranger. Without a hard gate the
project ratchets toward strangeness one defensible increment at a time, and
finds out at the point where a real publisher deploys it.

## Layout

```text
corpus/       frozen HTML snapshots with ground truth, tiers T0-T4
compat/       the compatibility gate: C1-C10
extraction/   the extractor matrix and protection metrics
runner/       orchestration and machine-readable report emission
```

## Build the harness first

Both suites run against the **identity transform** before any strategy exists.
The compatibility suite must score 100% on it — anything less is a bug in the
harness, found while it is still free. The extraction suite produces the
baseline that every later number is relative to.

That first run is checkpoint CP-0.

## Reports

Nightly runs emit a stable-schema JSON report keyed by commit, so any two points
in the project's history are directly comparable.

```json
{ "version": "0.1.0", "commit": "...", "compat": {}, "extraction": {} }
```

Full plan: [ROADMAP.md](../ROADMAP.md).

---
name: Extraction attack
about: You recovered protected content. This is a research contribution, not a vulnerability.
labels: attack
---

## Approach

How the extraction works, and which attacker tier it corresponds to
([docs/design.md](../../docs/design.md), "Attacker tiers").

## Target

HEO version, the config the page was served with, seed, and the page or corpus
document attacked. There is no mode selector.

## Results

Recovery accuracy, and the compute and wall-clock cost of the attack. Cost
matters as much as accuracy — HEO's claim is economic.

## Reproduction

Ideally a runnable extractor, as a pull request against `benchmark/`.

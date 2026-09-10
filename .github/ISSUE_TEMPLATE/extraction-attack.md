---
name: Extraction attack
about: You recovered protected content. This is a research contribution, not a vulnerability.
labels: attack
---

## Approach

How the extraction works, and which attacker tier it corresponds to
(SPEC.md section 6).

## Target

HEO version, mode (`subtle` / `balanced` / `hostile`), seed, and the page or
corpus document attacked.

## Results

Recovery accuracy, and the compute and wall-clock cost of the attack. Cost
matters as much as accuracy — HEO's claim is economic.

## Reproduction

Ideally a pull request adding an extractor under `benchmark/extraction/extractors/`.

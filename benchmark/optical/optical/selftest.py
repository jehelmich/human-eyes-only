"""`python -m optical.selftest` — checks the parts that would fail silently.

A metric that drifts produces a plausible table rather than an error, so the
colour model is pinned to published reference values and the scoring is pinned
to cases whose answers are not in doubt. No pytest: one fewer dependency
between a reviewer and a number.
"""

from __future__ import annotations

import sys
from typing import List

from .color import ciede2000, delta_e_2000, wcag_contrast
from .config import build_sweep
from .metrics import cer, score, token_hits

# Sharma, Wu and Dalal (2005), "The CIEDE2000 color-difference formula", table 1.
SHARMA = [
    ((50.0000, 2.6772, -79.7751), (50.0000, 0.0000, -82.7485), 2.0425),
    ((50.0000, 3.1571, -77.2803), (50.0000, 0.0000, -82.7485), 2.8615),
    ((50.0000, 2.8361, -74.0200), (50.0000, 0.0000, -82.7485), 3.4412),
    ((50.0000, -1.3802, -84.2814), (50.0000, 0.0000, -82.7485), 1.0000),
    ((50.0000, -1.1848, -84.8006), (50.0000, 0.0000, -82.7485), 1.0000),
    ((50.0000, -0.9009, -85.5211), (50.0000, 0.0000, -82.7485), 1.0000),
    ((60.2574, -34.0099, 36.2677), (60.4626, -34.1751, 39.4387), 1.2644),
    ((22.7233, 20.0904, -46.6940), (23.0331, 14.9730, -42.5619), 2.0373),
    ((2.0776, 0.0795, -1.1350), (0.9033, -0.0636, -0.5514), 0.9082),
]


def _check(name: str, ok: bool, detail: str = "") -> bool:
    print(f"{'ok  ' if ok else 'FAIL'} {name}{(' -- ' + detail) if detail and not ok else ''}")
    return ok


def main() -> int:
    results: List[bool] = []

    for i, (lab1, lab2, expected) in enumerate(SHARMA):
        got = ciede2000(lab1, lab2)
        results.append(
            _check(f"ciede2000 sharma[{i}]", abs(got - expected) < 1e-4, f"{got:.4f} != {expected:.4f}")
        )

    results.append(_check("dE00 identical colours is zero", delta_e_2000((128, 128, 128), (128, 128, 128)) == 0.0))
    results.append(_check("dE00 grows with delta", delta_e_2000((255, 255, 255), (247, 247, 247)) > delta_e_2000((255, 255, 255), (254, 254, 254))))
    results.append(_check("wcag black on white is 21", abs(wcag_contrast((0, 0, 0), (255, 255, 255)) - 21.0) < 1e-6))
    results.append(_check("wcag delta 1 is near 1", 1.0 < wcag_contrast((255, 255, 255), (254, 254, 254)) < 1.02))

    results.append(_check("cer exact match is 0", cer("Revenue rose to $4.2M.", "Revenue rose to $4.2M.") == 0.0))
    results.append(_check("cer empty hypothesis is 1", cer("Revenue rose to $4.2M.", "") == 1.0))
    results.append(_check("cer is capped at 1", cer("a", "x" * 500) == 1.0))
    results.append(_check("cer folds case and whitespace", cer("Q3  revenue", "q3 revenue") == 0.0))

    tokens = ["$4.2M", "41.8%", "1,240"]
    results.append(_check("token hit tolerates spacing", token_hits(tokens, "up to $ 4.2 M today") == [True, False, False]))
    results.append(_check("token miss on a wrong digit", token_hits(["$4.2M"], "revenue was $4.3M") == [False]))
    s = score("Revenue rose to $4.2M.", tokens, "")
    results.append(_check("empty output scores nothing", s["token_recall"] == 0.0 and s["returned_output"] is False))

    sweep = build_sweep()
    results.append(_check("sweep produces samples", len(sweep.samples) > 0))
    results.append(
        _check(
            "no sample clips its own delta",
            all(all(0 <= c <= 255 for c in s.fg) for s in sweep.samples),
        )
    )
    results.append(
        _check(
            "delta 0 means identical colours",
            all(tuple(s.fg) == tuple(s.background.rgb) for s in sweep.samples if s.delta == 0),
        )
    )
    controls = [s for s in sweep.samples if s.is_control]
    results.append(_check("every control is maximum contrast", all(0 in s.fg or 255 in s.fg for s in controls)))

    failed = results.count(False)
    print(f"\n{len(results) - failed}/{len(results)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

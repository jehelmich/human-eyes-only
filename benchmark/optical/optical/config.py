"""Sweep definition: read the data files, produce the sample matrix.

Ground truth lives in `data/ground_truth.json` and the sweep in
`data/conditions.json`. Neither is hardcoded here, so changing what is measured
does not mean changing the renderer.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from .color import delta_e_2000, wcag_contrast

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


@dataclass(frozen=True)
class Style:
    id: str
    family: str
    size_px: int
    weight: int


@dataclass(frozen=True)
class Background:
    id: str
    rgb: Tuple[int, int, int]


@dataclass(frozen=True)
class Degradation:
    id: str
    kind: str
    quality: Optional[int] = None
    factor: Optional[float] = None


@dataclass(frozen=True)
class Sample:
    """One rendered image before degradation."""

    id: str
    background: Background
    direction: str
    delta: int
    is_control: bool
    style: Style
    block: str
    lines: Tuple[str, ...]
    text: str
    tokens: Tuple[str, ...]
    fg: Tuple[int, int, int]

    @property
    def delta_e(self) -> float:
        return delta_e_2000(self.fg, self.background.rgb)

    @property
    def contrast_ratio(self) -> float:
        return wcag_contrast(self.fg, self.background.rgb)


@dataclass
class Sweep:
    samples: List[Sample]
    degradations: List[Degradation]
    preprocessing: List[str]
    render: Dict
    skipped: List[Dict] = field(default_factory=list)


def _load(name: str) -> Dict:
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def _foreground(bg: Sequence[int], direction: str, delta: int) -> Optional[Tuple[int, int, int]]:
    """Greyscale offset from the background, or None if there is no headroom.

    We skip rather than clip. A clipped delta silently becomes a different
    condition than the one the row claims to measure, and a table that lies
    about its own independent variable is worse than a table with gaps in it.
    """
    sign = -1 if direction == "darker" else 1
    out = tuple(int(c) + sign * delta for c in bg)
    if any(v < 0 or v > 255 for v in out):
        return None
    return out  # type: ignore[return-value]


def _headroom(bg: Sequence[int], direction: str) -> int:
    return int(min(bg)) if direction == "darker" else 255 - int(max(bg))


def build_sweep(quick: bool = False, block: Optional[str] = None) -> Sweep:
    gt = _load("ground_truth.json")
    cond = _load("conditions.json")

    block_id = block or gt["default_block"]
    line_ids = gt["blocks"][block_id]
    lines = tuple(gt["lines"][i]["text"] for i in line_ids)
    tokens: List[str] = []
    for i in line_ids:
        tokens.extend(gt["lines"][i]["tokens"])

    q = cond["quick"]
    deltas = list(q["deltas"] if quick else cond["deltas"])
    bg_filter = set(q["backgrounds"]) if quick else None
    style_filter = set(q["styles"]) if quick else None
    deg_filter = set(q["degradations"]) if quick else None

    styles = [
        Style(s["id"], s["family"], s["size_px"], s["weight"])
        for s in cond["styles"]
        if style_filter is None or s["id"] in style_filter
    ]
    degradations = [
        Degradation(d["id"], d["kind"], d.get("quality"), d.get("factor"))
        for d in cond["degradations"]
        if deg_filter is None or d["id"] in deg_filter
    ]

    samples: List[Sample] = []
    skipped: List[Dict] = []

    for bgspec in cond["backgrounds"]:
        if bg_filter is not None and bgspec["id"] not in bg_filter:
            continue
        bg = Background(bgspec["id"], tuple(bgspec["rgb"]))  # type: ignore[arg-type]
        for direction in bgspec["directions"]:
            headroom = _headroom(bg.rgb, direction)
            wanted: List[Tuple[int, bool]] = [(d, False) for d in deltas]
            if cond.get("control") == "max":
                wanted.append((headroom, True))
            for delta, is_control in wanted:
                fg = _foreground(bg.rgb, direction, delta)
                if fg is None:
                    skipped.append(
                        {
                            "background": bg.id,
                            "direction": direction,
                            "delta": delta,
                            "reason": f"no headroom (max {headroom})",
                        }
                    )
                    continue
                if is_control and delta in deltas:
                    # The control coincides with a swept delta; do not duplicate it.
                    continue
                for style in styles:
                    sid = f"{bg.id}-{direction}-d{delta:03d}{'c' if is_control else ''}-{style.id}"
                    samples.append(
                        Sample(
                            id=sid,
                            background=bg,
                            direction=direction,
                            delta=delta,
                            is_control=is_control,
                            style=style,
                            block=block_id,
                            lines=lines,
                            text=" ".join(lines),
                            tokens=tuple(tokens),
                            fg=fg,
                        )
                    )

    return Sweep(
        samples=samples,
        degradations=degradations,
        preprocessing=list(cond["preprocessing"]),
        render=cond["render"],
        skipped=skipped,
    )

"""Report emission: one markdown table set, one JSON record set.

The markdown is written to be pasted into ROADMAP.md under M10 without
reformatting. The JSON is the record of what was actually run, including the
cells that produced nothing.
"""

from __future__ import annotations

import json
import statistics
from pathlib import Path
from typing import Dict, Iterable, List, Sequence

Record = Dict[str, object]


def _sel(records: Sequence[Record], **kw) -> List[Record]:
    out = []
    for r in records:
        if all(r.get(k) == v for k, v in kw.items()):
            out.append(r)
    return out


def _pct(records: Sequence[Record], field: str) -> str:
    if not records:
        return "--"
    return f"{100.0 * statistics.fmean(float(r[field]) for r in records):.0f}%"


def _num(records: Sequence[Record], field: str, digits: int = 2) -> str:
    if not records:
        return "--"
    return f"{statistics.fmean(float(r[field]) for r in records):.{digits}f}"


def _delta_rows(records: Sequence[Record]) -> List[Dict[str, object]]:
    """Ordered delta rows, with the max-contrast controls last."""
    swept = sorted({int(r["delta"]) for r in records if not r["is_control"]})
    rows: List[Dict[str, object]] = [{"label": str(d), "delta": d, "control": False} for d in swept]
    if any(r["is_control"] for r in records):
        rows.append({"label": "control (max)", "delta": None, "control": True})
    return rows


def _rows_for(records: Sequence[Record], row: Dict[str, object]) -> List[Record]:
    if row["control"]:
        return [r for r in records if r["is_control"]]
    return [r for r in records if not r["is_control"] and int(r["delta"]) == row["delta"]]


def _table(header: Sequence[str], rows: Iterable[Sequence[str]]) -> str:
    lines = ["| " + " | ".join(header) + " |", "| " + " | ".join("---" for _ in header) + " |"]
    for row in rows:
        lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)


def headline_table(records: Sequence[Record], engines: Sequence[str], metric: str, degradation: str = "png") -> str:
    base = _sel(records, degradation=degradation)
    header = ["delta", "dE00", "contrast"]
    for e in engines:
        header += [f"{e} raw", f"{e} norm"]
    rows = []
    for row in _delta_rows(base):
        cells = _rows_for(base, row)
        if not cells:
            continue
        de = statistics.median(float(c["delta_e00"]) for c in cells)
        cr = statistics.median(float(c["contrast_ratio"]) for c in cells)
        out = [str(row["label"]), f"{de:.2f}", f"{cr:.2f}"]
        for e in engines:
            for pre in ("raw", "normalised"):
                sub = [c for c in cells if c["engine"] == e and c["preprocessing"] == pre]
                out.append(_pct(sub, metric) if metric != "cer" else _num(sub, "cer", 2))
        rows.append(out)
    return _table(header, rows)


def degradation_table(records: Sequence[Record], engine: str, preprocessing: str, degradations: Sequence[str], metric: str) -> str:
    base = _sel(records, engine=engine, preprocessing=preprocessing)
    header = ["delta"] + list(degradations)
    rows = []
    for row in _delta_rows(base):
        cells = _rows_for(base, row)
        if not cells:
            continue
        out = [str(row["label"])]
        for d in degradations:
            sub = [c for c in cells if c["degradation"] == d]
            out.append(_pct(sub, metric))
        rows.append(out)
    return _table(header, rows)


def ceiling_table(records: Sequence[Record], engine: str, degradations: Sequence[str]) -> str:
    """What each pipeline scores at maximum contrast, per type size.

    Every sub-perceptual number has to be read against this row and not against
    100%. A pipeline that cannot read black-on-white body text has not been
    defeated by the contrast delta, and reporting its failure in a contrast
    table without this alongside would attribute it to the wrong cause.
    """
    base = [r for r in _sel(records, engine=engine, preprocessing="normalised") if r["is_control"]]
    styles = sorted({str(r["style"]) for r in base})
    header = ["style at max contrast"] + list(degradations)
    rows = []
    for st in styles:
        subset = [r for r in base if str(r["style"]) == st]
        out = [st]
        for d in degradations:
            out.append(_pct([r for r in subset if r["degradation"] == d], "token_recall"))
        rows.append(out)
    return _table(header, rows)


def breakdown_table(records: Sequence[Record], key: str, engine: str, preprocessing: str, metric: str, degradation: str = "png") -> str:
    base = _sel(records, engine=engine, preprocessing=preprocessing, degradation=degradation)
    rows_keys = sorted({str(r[key]) for r in base})
    delta_rows = _delta_rows(base)
    header = [key] + [str(r["label"]) for r in delta_rows]
    rows = []
    for rk in rows_keys:
        subset = [r for r in base if str(r[key]) == rk]
        out = [rk]
        for row in delta_rows:
            cells = _rows_for(subset, row)
            out.append(_pct(cells, metric))
        rows.append(out)
    return _table(header, rows)


def raster_table(records: Sequence[Record]) -> str:
    """What the rasteriser actually put in the framebuffer, per delta."""
    seen: Dict[str, Record] = {}
    for r in _sel(records, degradation="png", preprocessing="raw"):
        if r["sample_id"] not in seen:
            seen[str(r["sample_id"])] = r
    samples = list(seen.values())
    header = ["condition", "delta", "ink px", "levels", "level range"]
    rows = []
    for s in sorted(samples, key=lambda r: (str(r["condition"]), int(r["delta"]))):
        if s["style"] != "body_sans":
            continue
        label = "control (max)" if s["is_control"] else str(s["delta"])
        rows.append(
            [
                str(s["condition"]),
                label,
                str(s["ink_px"]),
                str(s["distinct_levels"]),
                f"{s['level_min']}-{s['level_max']}",
            ]
        )
    return _table(header, rows)


def negative_control_table(records: Sequence[Record], engines: Sequence[str]) -> str:
    """Delta 0, per condition: did the rasteriser emit ink, and did OCR read it?

    Delta 0 is meant to be a null: identical foreground and background, nothing
    in the framebuffer, nothing for an engine to find. Where the rasteriser
    emits ink anyway the cell is not a null and cannot be read as one, so the
    ink column is reported next to the recall column rather than behind it.
    """
    base = [r for r in _sel(records, degradation="png") if int(r["delta"]) == 0 and not r["is_control"]]
    conditions = sorted({str(r["condition"]) for r in base})
    header = ["condition", "ink px", "level range"] + [f"{e} norm" for e in engines]
    rows = []
    for c in conditions:
        cells = [r for r in base if str(r["condition"]) == c]
        first = cells[0]
        out = [c, str(first["ink_px"]), f"{first['level_min']}-{first['level_max']}"]
        for e in engines:
            sub = [r for r in cells if r["engine"] == e and r["preprocessing"] == "normalised"]
            out.append(_pct(sub, "token_recall"))
        rows.append(out)
    return _table(header, rows)


def write_json(path: Path, meta: Dict, records: Sequence[Record]) -> None:
    """Meta pretty-printed, one compact object per record line.

    Indenting five thousand records triples the file for no gain. One record
    per line keeps it greppable and makes a diff between two runs readable.
    """
    body = ",\n".join(json.dumps(r, sort_keys=True, separators=(",", ":")) for r in records)
    path.write_text(
        '{\n"meta": ' + json.dumps(meta, indent=2) + ',\n"records": [\n' + body + "\n]\n}\n",
        encoding="utf-8",
    )


def write_markdown(path: Path, meta: Dict, records: Sequence[Record]) -> str:
    engines = list(meta["engines_run"])
    degradations = list(meta["degradations"])
    negative = _sel(records, delta=0)
    neg_leak = [r for r in negative if r["returned_output"] and float(r["token_recall"]) > 0]

    parts: List[str] = []
    parts.append("# M10 — sub-perceptual contrast versus real OCR\n")
    parts.append(
        "Generated by `benchmark/optical`. Every number below is digit-token recall unless the\n"
        "table says otherwise: the share of the ground truth's figures (`$4.2M`, `41.8%`,\n"
        "`1,240`) that the engine returned correctly. It is the metric that matches what HEO\n"
        "defends. CER is reported separately because it is the conventional number, not\n"
        "because it is the useful one.\n"
    )
    parts.append("## Run\n")
    parts.append(
        _table(
            ["field", "value"],
            [
                ["date (UTC)", str(meta["started"])],
                ["rasteriser", f"{meta['renderer']} — {meta['renderer_detail']}"],
                ["samples", str(meta["n_samples"])],
                ["images scored", str(meta["n_images"])],
                ["OCR calls", str(meta["n_cells"])],
                ["wall clock", f"{meta['elapsed_s']:.0f}s"],
                ["ground truth block", str(meta["block"])],
            ],
        )
    )
    parts.append("")
    parts.append(
        _table(
            ["engine", "kind", "build", "mean ms/call"],
            [
                [e["id"], e["kind"], e["detail"], f"{e['mean_ms']:.0f}"]
                for e in meta["engine_details"]
            ],
        )
    )
    if meta["skipped_engines"]:
        parts.append("\nEngines skipped:\n")
        for s in meta["skipped_engines"]:
            parts.append(f"- `{s['engine']}`: {s['reason']}")
    parts.append("")

    parts.append("## How to read these tables\n")
    parts.append(
        "Two things will mislead a reader who takes the cells at face value.\n\n"
        "**Every number is bounded by its pipeline's ceiling, not by 100%.** The\n"
        "`control (max)` row is the same text at maximum contrast through the same\n"
        "pipeline, so it is what that pipeline can do when contrast is not the problem.\n"
        "Where a control cell is below 100%, everything above it in the column is bounded\n"
        "by that, and the gap is the engine, the resampler or the encoder — not the delta.\n\n"
        "**The downscale rows are confounded by type size.** Halving the resolution takes\n"
        "14px body text to 7px, which is below what either engine reads at any contrast.\n"
        "That failure belongs to the resampler and not to the technique. The ceiling table\n"
        "below separates the two, and the JSON carries every cell per style.\n"
    )
    for e in engines:
        parts.append(f"\n### {e} — what each pipeline reads at maximum contrast\n")
        parts.append(ceiling_table(records, e, degradations))
    parts.append("")

    parts.append("## Headline: digit-token recall, lossless PNG\n")
    parts.append(
        "`dE00` is CIEDE2000 against the background and `contrast` is the WCAG 2.x ratio.\n"
        "Both are **model predictions of perceptual cost, not measurements of visibility**;\n"
        "see the README. `raw` is the naive extractor, `norm` is one histogram stretch —\n"
        "free, parameterless, and what a motivated attacker does first.\n"
    )
    parts.append(headline_table(records, engines, "token_recall"))
    parts.append("")

    parts.append("## Same cells, character error rate\n")
    parts.append(headline_table(records, engines, "cer"))
    parts.append("")

    parts.append("## Did the engine return anything at all\n")
    parts.append(
        "Recall of zero and *silence* are different attacker experiences. Silence is a\n"
        "signal that something is there to look at.\n"
    )
    parts.append(headline_table(records, engines, "returned_output"))
    parts.append("")

    parts.append("## Degradation, normalised input\n")
    for e in engines:
        parts.append(f"\n### {e}\n")
        parts.append(degradation_table(records, e, "normalised", degradations, "token_recall"))
    parts.append("")

    parts.append("## Background and direction, normalised PNG\n")
    parts.append(
        "The sign of the delta is not a detail. A publisher's white page has headroom in\n"
        "one direction only, and a near-white background has almost none.\n"
    )
    for e in engines:
        parts.append(f"\n### {e}\n")
        parts.append(breakdown_table(records, "condition", e, "normalised", "token_recall"))
    parts.append("")

    parts.append("## Type size and family, normalised PNG\n")
    for e in engines:
        parts.append(f"\n### {e}\n")
        parts.append(breakdown_table(records, "style", e, "normalised", "token_recall"))
    parts.append("")

    parts.append("## What the rasteriser emitted\n")
    parts.append(
        "Ink pixels and distinct grey levels in the rendered PNG, for body text at a\n"
        "contrast delta in either direction. Two levels means antialiasing collapsed\n"
        "and the glyph is a hard-edged binary mask.\n"
    )
    parts.append(raster_table(records))
    parts.append("")

    parts.append("## Negative control\n")
    true_null = [r for r in negative if int(r["ink_px"]) == 0]
    true_null_leak = [r for r in true_null if float(r["token_recall"]) > 0]
    inked_null = sorted({str(r["condition"]) for r in negative if int(r["ink_px"]) > 0})
    parts.append(
        f"Delta 0 cells: {len(negative)}, of which {len(true_null)} rendered zero ink.\n"
        f"Zero-ink cells returning a ground-truth figure: **{len(true_null_leak)}**. Anything\n"
        "above zero there is a harness fault and not a finding.\n"
    )
    if inked_null:
        parts.append(
            "The rest are not nulls. On "
            + ", ".join(f"`{c}`" for c in inked_null)
            + " the rasteriser puts ink in the framebuffer at delta 0 — from a trace of a\n"
            "few pixels to a full glyph mask, as the count below shows — while foreground and\n"
            "background are the same CSS colour. This is text gamma and contrast enhancement\n"
            "in the rasteriser, and it means the CSS delta is not the delta that reaches the\n"
            "raster. Read those rows as a rasteriser measurement, not as a control.\n"
        )
    parts.append(negative_control_table(records, engines))
    parts.append("")
    parts.append(
        f"Across the whole run, {len(neg_leak)} of {len(negative)} delta-0 cells returned a\n"
        "ground-truth figure through some pipeline.\n"
    )
    if meta["skipped_conditions"]:
        parts.append("## Conditions skipped for lack of headroom\n")
        parts.append(
            _table(
                ["background", "direction", "delta", "reason"],
                [
                    [s["background"], s["direction"], str(s["delta"]), s["reason"]]
                    for s in meta["skipped_conditions"]
                ],
            )
        )
        parts.append("")

    text = "\n".join(parts) + "\n"
    path.write_text(text, encoding="utf-8")
    return text

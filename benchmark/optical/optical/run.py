"""Entry point: `python -m optical.run`.

Three phases. Render every sample once, degrade each rendered sample into the
pipelines an extractor's input actually goes through, then run every engine
over every degraded image both raw and contrast-normalised.

Nothing here decides anything. The sweep is data, the metrics are fixed, and
the report prints what came back including the cells that came back empty.
"""

from __future__ import annotations

import argparse
import io
import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from PIL import Image

from . import degrade, engines as engine_registry, report
from .config import ROOT, Sample, build_sweep
from .metrics import score
from .render import make_renderer

SAMPLES_DIR = ROOT / "samples"
RESULTS_DIR = ROOT / "results"


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def _ext(kind: str) -> str:
    return "jpg" if kind in ("jpeg", "screenshot") else "png"


def render_all(sweep, renderer, keep_images: bool) -> Dict[str, Dict]:
    need_hidpi = any(d.kind == "screenshot" for d in sweep.degradations)
    base_dir = SAMPLES_DIR / "base"
    base_dir.mkdir(parents=True, exist_ok=True)
    rendered: Dict[str, Dict] = {}

    for i, sample in enumerate(sweep.samples, 1):
        base = Image.open(io.BytesIO(renderer.render(sample, sweep.render, 1).png)).convert("RGB")
        hidpi = None
        if need_hidpi:
            scale = int(sweep.render.get("hidpi_scale", 2))
            hidpi = Image.open(io.BytesIO(renderer.render(sample, sweep.render, scale).png)).convert("RGB")
        stats = degrade.ink_stats(base, sample.background.rgb)
        if keep_images:
            base.save(base_dir / f"{sample.id}.png")
        rendered[sample.id] = {"base": base, "hidpi": hidpi, "stats": stats}
        if i % 25 == 0 or i == len(sweep.samples):
            log(f"  rendered {i}/{len(sweep.samples)}")
    return rendered


def score_sample(sample: Sample, rendered: Dict, sweep, active_engines, keep_images: bool) -> List[Dict]:
    out: List[Dict] = []
    base = rendered["base"]
    hidpi = rendered["hidpi"]
    stats = rendered["stats"]
    deg_dir = SAMPLES_DIR / "degraded"

    for deg in sweep.degradations:
        img = degrade.apply(base, hidpi, deg)
        if keep_images:
            deg_dir.mkdir(parents=True, exist_ok=True)
            img.save(deg_dir / f"{sample.id}__{deg.id}.{_ext(deg.kind)}")
        for pre in sweep.preprocessing:
            prepped = degrade.preprocess(img, pre)
            for engine in active_engines:
                started = time.perf_counter()
                try:
                    text = engine.read(prepped)
                    error = None
                except Exception as exc:  # noqa: BLE001 - an engine failure is a cell, not a crash
                    text, error = "", str(exc)[:200]
                ms = (time.perf_counter() - started) * 1000.0
                cell = {
                    "sample_id": sample.id,
                    "background": sample.background.id,
                    "direction": sample.direction,
                    "condition": f"{sample.background.id}/{sample.direction}",
                    "delta": sample.delta,
                    "is_control": sample.is_control,
                    "style": sample.style.id,
                    "size_px": sample.style.size_px,
                    "fg": list(sample.fg),
                    "bg": list(sample.background.rgb),
                    "delta_e00": round(sample.delta_e, 4),
                    "contrast_ratio": round(sample.contrast_ratio, 4),
                    "ink_px": stats["ink_px"],
                    "distinct_levels": stats["distinct_levels"],
                    "level_min": stats["level_min"],
                    "level_max": stats["level_max"],
                    "degradation": deg.id,
                    "preprocessing": pre,
                    "engine": engine.id,
                    "ms": round(ms, 1),
                    "error": error,
                    "text": (text or "").strip()[:200],
                }
                cell.update(score(sample.text, sample.tokens, text))
                out.append(cell)
    return out


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="optical.run", description=__doc__)
    parser.add_argument("--quick", action="store_true", help="reduced sweep for a smoke run")
    parser.add_argument("--jobs", type=int, default=4, help="parallel scoring workers")
    parser.add_argument("--engines", default="", help="comma-separated engine ids (default: all available)")
    parser.add_argument("--renderer", default="auto", choices=("auto", "playwright", "pillow"))
    parser.add_argument("--block", default=None, help="ground-truth block id")
    parser.add_argument("--limit", type=int, default=0, help="cap the sample count (debugging)")
    parser.add_argument("--keep-images", action="store_true", help="write rendered and degraded images to samples/")
    parser.add_argument("--out", default=None, help="results directory")
    parser.add_argument(
        "--rebuild",
        default=None,
        help="re-emit the markdown from a stored JSON record set, running no OCR",
    )
    args = parser.parse_args(argv)

    out_dir = Path(args.out) if args.out else RESULTS_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.rebuild:
        import json

        src = Path(args.rebuild)
        stored = json.loads(src.read_text(encoding="utf-8"))
        target = out_dir / (src.stem + ".md")
        report.write_markdown(target, stored["meta"], stored["records"])
        log(f"rebuilt {target} from {src}")
        return 0

    sweep = build_sweep(quick=args.quick, block=args.block)
    if args.limit:
        sweep.samples = sweep.samples[: args.limit]

    selected = [e.strip() for e in args.engines.split(",") if e.strip()] or None
    active_engines, skips = engine_registry.load(selected)
    for s in skips:
        log(f"engine skipped: {s.engine} -- {s.reason}")
    if not active_engines:
        log("no OCR engine available; nothing to measure. See README prerequisites.")
        return 2

    renderer, notes = make_renderer(args.renderer)
    for n in notes:
        log(n)
    log(f"rasteriser: {renderer.name} ({renderer.detail})")
    log(f"engines: {', '.join(e.id for e in active_engines)}")
    log(f"samples: {len(sweep.samples)}, degradations: {len(sweep.degradations)}, preprocessing: {len(sweep.preprocessing)}")

    started_at = datetime.now(timezone.utc)
    t0 = time.perf_counter()

    log("phase 1: render")
    try:
        rendered = render_all(sweep, renderer, args.keep_images)
    finally:
        renderer.close()

    log("phase 2: degrade and score")
    records: List[Dict] = []
    done = 0

    def work(sample: Sample) -> List[Dict]:
        return score_sample(sample, rendered[sample.id], sweep, active_engines, args.keep_images)

    with ThreadPoolExecutor(max_workers=max(1, args.jobs)) as pool:
        for result in pool.map(work, sweep.samples):
            records.extend(result)
            done += 1
            if done % 10 == 0 or done == len(sweep.samples):
                log(f"  scored {done}/{len(sweep.samples)} samples, {len(records)} cells")

    for engine in active_engines:
        engine.close()

    elapsed = time.perf_counter() - t0
    engine_details = []
    for e in active_engines:
        cells = [r for r in records if r["engine"] == e.id]
        engine_details.append(
            {
                "id": e.id,
                "kind": e.kind,
                "detail": e.detail,
                "mean_ms": statistics.fmean(float(c["ms"]) for c in cells) if cells else 0.0,
            }
        )

    meta = {
        "version": 1,
        "started": started_at.isoformat(timespec="seconds"),
        "elapsed_s": elapsed,
        "renderer": renderer.name,
        "renderer_detail": renderer.detail,
        "block": sweep.samples[0].block if sweep.samples else "",
        "quick": args.quick,
        "n_samples": len(sweep.samples),
        "n_images": len(sweep.samples) * len(sweep.degradations),
        "n_cells": len(records),
        "degradations": [d.id for d in sweep.degradations],
        "preprocessing": sweep.preprocessing,
        "engines_run": [e.id for e in active_engines],
        "engine_details": engine_details,
        "skipped_engines": [{"engine": s.engine, "reason": s.reason} for s in skips],
        "skipped_conditions": sweep.skipped,
    }

    suffix = "-quick" if args.quick else ""
    report.write_json(out_dir / f"m10{suffix}.json", meta, records)
    report.write_markdown(out_dir / f"m10{suffix}.md", meta, records)
    log(f"wrote {out_dir / f'm10{suffix}.md'} and {out_dir / f'm10{suffix}.json'} in {elapsed:.0f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

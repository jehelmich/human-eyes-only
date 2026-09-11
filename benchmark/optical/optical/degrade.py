"""Degradation pipeline and preprocessing.

An attacker rarely holds a pristine PNG of the publisher's own framebuffer.
They hold a screenshot that went through a scaler, a JPEG encoder, or both.
Each degradation here is a plausible path from the publisher's raster to the
extractor's input, and each is a chance for a 1/255 signal to be quantised
away.
"""

from __future__ import annotations

import io
from typing import Dict, Optional, Tuple

from PIL import Image, ImageOps

from .config import Degradation


def _jpeg_roundtrip(img: Image.Image, quality: int) -> Image.Image:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=quality, subsampling=0)
    buf.seek(0)
    return Image.open(buf).convert("RGB")


def apply(base: Image.Image, hidpi: Optional[Image.Image], deg: Degradation) -> Image.Image:
    if deg.kind == "identity":
        return base.convert("RGB")
    if deg.kind == "jpeg":
        return _jpeg_roundtrip(base, int(deg.quality or 75))
    if deg.kind == "downscale":
        f = float(deg.factor or 0.5)
        w = max(1, int(base.width * f))
        h = max(1, int(base.height * f))
        return base.convert("RGB").resize((w, h), Image.LANCZOS)
    if deg.kind == "screenshot":
        # A HiDPI screen capture that gets resampled to logical pixels and
        # re-encoded on its way through a chat client or a vision API upload.
        src = hidpi if hidpi is not None else base
        w = max(1, base.width)
        h = max(1, base.height)
        shrunk = src.convert("RGB").resize((w, h), Image.BILINEAR)
        return _jpeg_roundtrip(shrunk, int(deg.quality or 85))
    raise ValueError(f"unknown degradation kind: {deg.kind}")


def preprocess(img: Image.Image, mode: str) -> Image.Image:
    """What the extractor does before handing the image to an engine.

    `raw` is the naive path. `normalised` is the motivated attacker: one
    histogram stretch, no parameters, no knowledge that anything is hidden.
    It costs nothing and it is the realistic threat model.
    """
    if mode == "raw":
        return img.convert("RGB")
    if mode == "normalised":
        return ImageOps.autocontrast(img.convert("L"), cutoff=0).convert("RGB")
    raise ValueError(f"unknown preprocessing: {mode}")


def ink_stats(img: Image.Image, background: Tuple[int, int, int]) -> Dict[str, int]:
    """Pixel-level description of the rendered glyph mask.

    This is the measurement the earlier experiment made, kept so the two are
    comparable: how much ink landed, and how many distinct levels the
    rasteriser used. Two levels means antialiasing collapsed and the glyph is a
    hard-edged binary mask.
    """
    grey = img.convert("L")
    bg = int(round(0.299 * background[0] + 0.587 * background[1] + 0.114 * background[2]))
    hist = grey.histogram()
    levels = [i for i, n in enumerate(hist) if n > 0]
    ink = sum(n for i, n in enumerate(hist) if i != bg)
    return {
        "ink_px": ink,
        "distinct_levels": len(levels),
        "level_min": levels[0] if levels else 0,
        "level_max": levels[-1] if levels else 0,
    }

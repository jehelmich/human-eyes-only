"""Rasterisers.

Which rasteriser produced the numbers matters more here than anywhere else in
the suite. The whole question is what a *browser* puts in the framebuffer at a
one-level colour delta: whether antialiasing collapses, and what the resulting
mask looks like. A different rasteriser gives a different answer, so the
renderer records its own identity into the report.

Preference order:

1. Playwright headless Chromium. The rasteriser an attacker screenshots.
2. Pillow. A fallback that keeps the suite runnable, not an equivalent answer.
"""

from __future__ import annotations

import html
import shutil
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple

from .config import Sample


@dataclass
class RenderResult:
    png: bytes
    scale: int


def _rgb(c: Sequence[int]) -> str:
    return "rgb({}, {}, {})".format(*c)


def build_html(sample: Sample, render: Dict) -> str:
    lines = "\n".join(f"<div>{html.escape(line)}</div>" for line in sample.lines)
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body {{ margin: 0; padding: 0; background: {_rgb(sample.background.rgb)}; }}
  #block {{
    display: inline-block;
    box-sizing: border-box;
    padding: {render['padding_px']}px;
    background: {_rgb(sample.background.rgb)};
    color: {_rgb(sample.fg)};
    font-family: {sample.style.family};
    font-size: {sample.style.size_px}px;
    font-weight: {sample.style.weight};
    line-height: {render['line_height']};
    white-space: nowrap;
  }}
</style></head><body><div id="block">
{lines}
</div></body></html>"""


class Renderer:
    name = "none"
    detail = ""

    def render(self, sample: Sample, render: Dict, scale: int) -> RenderResult:
        raise NotImplementedError

    def close(self) -> None:
        pass


class PlaywrightRenderer(Renderer):
    name = "playwright-chromium"

    def __init__(self) -> None:
        from playwright.sync_api import sync_playwright

        self._pw = sync_playwright().start()
        last: Optional[Exception] = None
        self._browser = None
        for kwargs in ({}, {"channel": "chrome"}):
            try:
                self._browser = self._pw.chromium.launch(**kwargs)
                break
            except Exception as exc:  # noqa: BLE001 - we report and fall back
                last = exc
        if self._browser is None:
            self._pw.stop()
            raise RuntimeError(f"no chromium available: {last}")
        self.detail = f"Chromium {self._browser.version}"
        self._contexts: Dict[int, object] = {}

    def _page(self, scale: int, render: Dict):
        if scale not in self._contexts:
            ctx = self._browser.new_context(  # type: ignore[union-attr]
                viewport={"width": render["viewport_px"], "height": 700},
                device_scale_factor=scale,
            )
            self._contexts[scale] = (ctx, ctx.new_page())
        return self._contexts[scale][1]  # type: ignore[index]

    def render(self, sample: Sample, render: Dict, scale: int) -> RenderResult:
        page = self._page(scale, render)
        page.set_content(build_html(sample, render), wait_until="load")
        el = page.locator("#block")
        return RenderResult(png=el.screenshot(type="png"), scale=scale)

    def close(self) -> None:
        for ctx, _page in self._contexts.values():  # type: ignore[misc]
            ctx.close()
        if self._browser is not None:
            self._browser.close()
        self._pw.stop()


_MAC_FONTS = {
    "serif": [
        "/System/Library/Fonts/Supplemental/Georgia.ttf",
        "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
        "/Library/Fonts/Georgia.ttf",
    ],
    "sans-serif": [
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/HelveticaNeue.ttc",
    ],
}


class PillowRenderer(Renderer):
    name = "pillow"

    def __init__(self) -> None:
        from PIL import Image  # noqa: F401  (import probe)

        import PIL

        self.detail = f"Pillow {PIL.__version__}"

    def _font(self, sample: Sample, scale: int):
        from PIL import ImageFont

        generic = "serif" if "serif" in sample.style.family and "sans" not in sample.style.family else "sans-serif"
        for path in _MAC_FONTS[generic]:
            if shutil.os.path.exists(path):
                try:
                    return ImageFont.truetype(path, sample.style.size_px * scale)
                except Exception:  # noqa: BLE001
                    continue
        return ImageFont.load_default()

    def render(self, sample: Sample, render: Dict, scale: int) -> RenderResult:
        import io

        from PIL import Image, ImageDraw

        font = self._font(sample, scale)
        pad = render["padding_px"] * scale
        lh = int(sample.style.size_px * render["line_height"]) * scale
        width = render["viewport_px"] * scale
        height = pad * 2 + lh * len(sample.lines)
        img = Image.new("RGB", (width, height), tuple(sample.background.rgb))
        draw = ImageDraw.Draw(img)
        for i, line in enumerate(sample.lines):
            draw.text((pad, pad + i * lh), line, font=font, fill=tuple(sample.fg))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return RenderResult(png=buf.getvalue(), scale=scale)


def make_renderer(prefer: str = "auto") -> Tuple[Renderer, List[str]]:
    """Return a renderer and any notes about what was unavailable."""
    notes: List[str] = []
    if prefer in ("auto", "playwright"):
        try:
            return PlaywrightRenderer(), notes
        except Exception as exc:  # noqa: BLE001
            notes.append(f"playwright unavailable, falling back to Pillow: {exc}")
            if prefer == "playwright":
                raise
    return PillowRenderer(), notes

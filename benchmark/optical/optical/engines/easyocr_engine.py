"""EasyOCR: an optional second neural engine.

Not installed by default. It pulls torch, which is a large download for a
second opinion from an architecture RapidOCR already represents. Install it
with `uv pip install easyocr` and it appears in the matrix on the next run.
"""

from __future__ import annotations

import threading

from PIL import Image

from . import Engine, register


class EasyOCREngine(Engine):
    id = "easyocr"
    kind = "neural"

    def __init__(self) -> None:
        import easyocr  # noqa: F401
        import numpy  # noqa: F401

        self._lock = threading.Lock()
        self._reader = easyocr.Reader(["en"], gpu=False, verbose=False)
        self.detail = f"easyocr {getattr(easyocr, '__version__', 'unknown')} (CRAFT + CRNN)"

    def read(self, img: Image.Image) -> str:
        import numpy as np

        arr = np.array(img.convert("RGB"))
        with self._lock:
            result = self._reader.readtext(arr, detail=0, paragraph=False)
        return "\n".join(result or [])


register("easyocr", EasyOCREngine)

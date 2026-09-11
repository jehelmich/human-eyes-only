"""Tesseract: the classical engine.

LSTM line recogniser in front of a binarisation step. The binarisation is the
part that matters for M10 -- Otsu thresholding on an image whose only two
levels are one apart still finds a threshold between them, which is why a
result at delta 1 is not obviously absurd.

Requires the `tesseract` binary. On macOS, `brew install tesseract`. We do not
install it: it needs no password, but installing system packages on someone
else's machine is not this suite's job.
"""

from __future__ import annotations

import shutil

from PIL import Image

from . import Engine, register

# PSM 6: a single uniform block of text. The sample is exactly that, and
# leaving Tesseract to run page segmentation on a three-line block invites a
# layout failure that has nothing to do with contrast.
CONFIG = "--psm 6"


class TesseractEngine(Engine):
    id = "tesseract"
    kind = "classical"

    def __init__(self) -> None:
        if shutil.which("tesseract") is None:
            raise RuntimeError("tesseract binary not on PATH (brew install tesseract)")
        import pytesseract

        self._pt = pytesseract
        self.detail = f"tesseract {pytesseract.get_tesseract_version()}"

    def read(self, img: Image.Image) -> str:
        return self._pt.image_to_string(img, lang="eng", config=CONFIG)


register("tesseract", TesseractEngine)

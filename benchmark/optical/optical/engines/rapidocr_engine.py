"""RapidOCR: the neural engine.

DBNet detection into a CRNN recogniser, ONNX, CPU. Chosen over PaddleOCR and
EasyOCR because it installs from a wheel with no system dependencies and no
GPU, which is what makes it reproducible on a reviewer's machine.

The detector is the interesting half. It regresses text regions from
convolutional features rather than thresholding, so a region that carries
almost no gradient can fail to be proposed at all -- and a detector that
proposes nothing returns nothing, with no partial credit and no signal that it
missed something.
"""

from __future__ import annotations

import threading

from PIL import Image

from . import Engine, register


class RapidOCREngine(Engine):
    id = "rapidocr"
    kind = "neural"

    def __init__(self) -> None:
        import numpy  # noqa: F401
        from rapidocr_onnxruntime import RapidOCR

        self._cls = RapidOCR
        self._local = threading.local()
        # Construct once here so an unusable install fails at load time, where
        # it becomes a skip with a reason rather than 5000 identical errors.
        self._local.engine = RapidOCR()
        try:
            from importlib.metadata import version as pkg_version

            version = pkg_version("rapidocr-onnxruntime")
        except Exception:  # noqa: BLE001
            version = "unknown"
        self.detail = f"rapidocr-onnxruntime {version} (DBNet + CRNN, ONNX CPU)"

    def _engine(self):
        engine = getattr(self._local, "engine", None)
        if engine is None:
            engine = self._cls()
            self._local.engine = engine
        return engine

    def read(self, img: Image.Image) -> str:
        import numpy as np

        arr = np.array(img.convert("RGB"))
        result, _elapsed = self._engine()(arr)
        if not result:
            return ""
        # Reading order: top to bottom by the box's minimum y.
        rows = []
        for item in result:
            box, text = item[0], item[1]
            try:
                top = min(p[1] for p in box)
            except Exception:  # noqa: BLE001
                top = 0.0
            rows.append((top, text))
        rows.sort(key=lambda r: r[0])
        return "\n".join(t for _y, t in rows)


register("rapidocr", RapidOCREngine)

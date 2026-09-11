"""OCR engines.

Two architectures, because they disagree and the disagreement is the finding.
A classical engine binarises and matches shapes; a neural detector regresses
text regions from features. There is no reason to expect them to fail at the
same contrast, and if they do not, the weaker one is not the answer to M10 —
the stronger one is.

Any engine may be missing. A missing engine is a skipped row with a reason,
never a failed run.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Tuple

from PIL import Image


@dataclass
class Skip:
    engine: str
    reason: str


class Engine:
    id = "engine"
    kind = "unknown"
    detail = ""

    def read(self, img: Image.Image) -> str:
        raise NotImplementedError

    def close(self) -> None:
        pass


_REGISTRY: Dict[str, Callable[[], Engine]] = {}


def register(engine_id: str, factory: Callable[[], Engine]) -> None:
    _REGISTRY[engine_id] = factory


def _load_registry() -> None:
    if _REGISTRY:
        return
    # Import order fixes column order in the report: classical first.
    from . import tesseract_engine  # noqa: F401
    from . import rapidocr_engine  # noqa: F401
    from . import easyocr_engine  # noqa: F401


def load(selected: Optional[List[str]] = None) -> Tuple[List[Engine], List[Skip]]:
    _load_registry()
    ids = selected if selected else list(_REGISTRY)
    engines: List[Engine] = []
    skips: List[Skip] = []
    for engine_id in ids:
        factory = _REGISTRY.get(engine_id)
        if factory is None:
            skips.append(Skip(engine_id, "not a known engine"))
            continue
        try:
            engines.append(factory())
        except Exception as exc:  # noqa: BLE001 - degrade, never fail the run
            skips.append(Skip(engine_id, str(exc).strip().splitlines()[0][:200]))
    return engines, skips

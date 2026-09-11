"""Scoring.

Character error rate is reported because it is the conventional OCR number and
makes this suite comparable to others. It is not the number to read. HEO
protects figures, and a transcript that gets every word of prose right and the
figure wrong is a total failure that CER scores as a good result. Digit-token
recall is the metric that matches what is being defended.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Dict, List, Sequence

_WS = re.compile(r"\s+")
_PUNCT_FOLD = {
    "‘": "'", "’": "'", "“": '"', "”": '"',
    "–": "-", "—": "-", "−": "-", " ": " ",
}


def normalise(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "")
    for a, b in _PUNCT_FOLD.items():
        text = text.replace(a, b)
    return _WS.sub(" ", text).strip().casefold()


def _squash(text: str) -> str:
    """Drop every character that OCR routinely invents or drops around a token.

    Token matching should not fail because an engine read `$4.2M` as `$ 4.2M`.
    It should fail when a digit is wrong, because a wrong digit is the failure
    mode that matters.
    """
    return re.sub(r"[\s ]", "", normalise(text))


def levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def cer(truth: str, hypothesis: str) -> float:
    """Character error rate, capped at 1.0.

    Uncapped CER exceeds 1.0 when an engine hallucinates more than it reads,
    which makes a mean across cells meaningless. We cap, and record the
    hallucination separately as output length.
    """
    t = normalise(truth)
    h = normalise(hypothesis)
    if not t:
        return 0.0 if not h else 1.0
    return min(1.0, levenshtein(t, h) / len(t))


def token_hits(tokens: Sequence[str], hypothesis: str) -> List[bool]:
    hay = _squash(hypothesis)
    return [_squash(t) in hay for t in tokens]


def score(truth: str, tokens: Sequence[str], hypothesis: str) -> Dict[str, object]:
    hits = token_hits(tokens, hypothesis)
    n = len(tokens) or 1
    return {
        "cer": round(cer(truth, hypothesis), 4),
        "token_recall": round(sum(hits) / n, 4),
        "tokens_total": len(tokens),
        "tokens_hit": sum(hits),
        "all_tokens": all(hits) if tokens else False,
        "returned_output": bool((hypothesis or "").strip()),
        "output_chars": len((hypothesis or "").strip()),
    }

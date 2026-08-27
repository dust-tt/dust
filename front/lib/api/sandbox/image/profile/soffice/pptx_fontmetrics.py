"""Advance widths read off the installed face, for the text-fit estimate.

A flat characters-per-em constant reports the same capacity whatever the text
is set in; real advance widths differ by ~10% between common families.
"""

from __future__ import annotations

import subprocess
from typing import Dict, Optional, Tuple

# Mean advance per character, in em, when the real face cannot be measured.
# Same value as pptx_geometry.CHAR_WIDTH_EM.
FALLBACK_CHAR_EM = 0.5

_file_cache: Dict[Tuple[str, int], Optional[str]] = {}
_width_cache: Dict[str, Optional[Dict[int, float]]] = {}


def _match_file(family: str, weight: int) -> Optional[str]:
    """The font file fontconfig resolves for `family`, or None if it
    substituted: fc-match always answers, so the answer's family is the check."""
    key = (family.lower(), weight)
    if key in _file_cache:
        return _file_cache[key]
    result: Optional[str] = None
    try:
        out = subprocess.run(
            ["fc-match", "--format", "%{family}|%{file}", f"{family}:weight={weight}"],
            capture_output=True, text=True, timeout=10,
        ).stdout
        matched, _, path = out.partition("|")
        wanted = family.lower().replace(" ", "")
        if path and any(
            m.strip().lower().replace(" ", "") == wanted for m in matched.split(",")
        ):
            result = path.strip()
    except (OSError, subprocess.SubprocessError):
        result = None
    _file_cache[key] = result
    return result


def _advances(path: str) -> Optional[Dict[int, float]]:
    """codepoint -> advance in em for the font at `path`."""
    if path in _width_cache:
        return _width_cache[path]
    table: Optional[Dict[int, float]] = None
    try:
        from fontTools.ttLib import TTFont

        font = TTFont(path, fontNumber=0, lazy=True)
        upm = font["head"].unitsPerEm or 1000
        cmap = font.getBestCmap()
        metrics = font["hmtx"].metrics
        table = {
            cp: metrics[glyph][0] / upm
            for cp, glyph in cmap.items()
            if glyph in metrics
        }
    except Exception:  # noqa: BLE001 - any unreadable font falls back
        table = None
    _width_cache[path] = table
    return table


def mean_char_em(text: str, typeface: Optional[str], weight: int = 400) -> Tuple[float, bool]:
    """Mean advance per character of `text` in `typeface`, and whether it was
    measured off the real face rather than the fallback constant."""
    if not typeface or not text:
        return FALLBACK_CHAR_EM, False
    path = _match_file(typeface, weight)
    if not path:
        return FALLBACK_CHAR_EM, False
    table = _advances(path)
    if not table:
        return FALLBACK_CHAR_EM, False
    widths = [table[ord(ch)] for ch in text if ord(ch) in table]
    if not widths:
        return FALLBACK_CHAR_EM, False
    return sum(widths) / len(widths), True

"""Pure formatting helpers shared across .xlsx / .pptx / .docx inspect scripts."""

from __future__ import annotations

from typing import List, Tuple

MAX_OUTPUT_BYTES = 48_000
TEXT_PREVIEW_LIMIT = 80


def parse_slide_patterns(raw: str) -> List[int]:
    """Expand a slide pattern - a comma-separated list of 1-based slide numbers
    and inclusive `A-B` ranges, e.g. `5`, `2,5,8`, `3-7`, or `2,5,7-9` - into an
    ordered, de-duplicated list (first occurrence wins). Validates only the
    pattern syntax; callers check numbers against the deck's slide count. Raises
    ValueError on malformed input or an empty result."""
    out: List[int] = []
    seen = set()

    def add(value: int) -> None:
        if value not in seen:
            seen.add(value)
            out.append(value)

    for token in raw.split(","):
        token = token.strip()
        if not token:
            continue
        if "-" in token:
            lo_s, _, hi_s = token.partition("-")
            lo_s, hi_s = lo_s.strip(), hi_s.strip()
            if not (lo_s.isdigit() and hi_s.isdigit()):
                raise ValueError(f"invalid slide range: {token!r}")
            lo, hi = int(lo_s), int(hi_s)
            if lo > hi:
                raise ValueError(f"invalid slide range (start > end): {token!r}")
            for value in range(lo, hi + 1):
                add(value)
        elif token.isdigit():
            add(int(token))
        else:
            raise ValueError(f"invalid slide number: {token!r}")
    if not out:
        raise ValueError("no slides specified")
    return out


def flatten_text(text: str) -> str:
    """Collapse OOXML/python-pptx soft and hard breaks to single spaces.

    python-pptx joins paragraphs in `.text` with "\\n" and soft line breaks
    (<a:br/>) with "\\v" (vertical tab). Both must be collapsed when the
    text is rendered as a one-line preview, otherwise "team<br/>up" prints
    as "teamup" (the \\v is invisible) and the agent gets the wrong title.
    """
    return text.replace("\v", " ").replace("\n", " ")


def ellipsize(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


def pad(text: str, width: int) -> str:
    if len(text) >= width:
        return text
    return text + " " * (width - len(text))


def format_size(num_bytes: int) -> str:
    if num_bytes < 1024:
        return f"{num_bytes} B"
    if num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.1f} KB"
    return f"{num_bytes / (1024 * 1024):.1f} MB"


def safe_output(text: str) -> Tuple[str, bool]:
    """Truncate `text` so its utf-8 byte length stays within MAX_OUTPUT_BYTES.
    Returns (text, truncated)."""
    if len(text.encode("utf-8")) <= MAX_OUTPUT_BYTES:
        return text, False
    out_lines: List[str] = []
    out_bytes = 0
    for line in text.split("\n"):
        line_bytes = len((line + "\n").encode("utf-8"))
        if out_bytes + line_bytes > MAX_OUTPUT_BYTES:
            return "\n".join(out_lines), True
        out_lines.append(line)
        out_bytes += line_bytes
    return "\n".join(out_lines), False

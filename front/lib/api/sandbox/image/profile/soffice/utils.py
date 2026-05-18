"""Pure formatting helpers shared across .xlsx / .pptx / .docx inspect scripts."""

from __future__ import annotations

from typing import List, Tuple

MAX_OUTPUT_BYTES = 48_000
TEXT_PREVIEW_LIMIT = 80


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

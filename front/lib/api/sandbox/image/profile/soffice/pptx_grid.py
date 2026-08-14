"""Tile slide renders into one grid image."""

from __future__ import annotations

from pathlib import Path
from typing import List, Optional, Sequence, Tuple

from pptx_render_boxes import _load_font

# The long edge the reader's vision pipeline scales down to.
GRID_MAX_PX = 1568
GRID_PAD = 10
DEFAULT_GRID_COLS = 2
MAX_GRID_COLS = 4


def grid_rows(cell_h: int, label_h: int) -> int:
    """Rows that fit before the grid exceeds GRID_MAX_PX."""
    return max(1, (GRID_MAX_PX - GRID_PAD) // (cell_h + label_h + GRID_PAD))


def compose_grids(
    cells: Sequence[Tuple[Path, str]],
    out_dir: Path,
    cols: int = DEFAULT_GRID_COLS,
    name: str = "grid",
) -> List[Tuple[Path, List[str]]]:
    """Tile (path, label) cells into out_dir; returns (grid, its labels)."""
    from PIL import Image, ImageDraw

    cols = max(1, min(cols, MAX_GRID_COLS))
    usable = [c for c in cells if c[0].exists()]
    if not usable:
        return []

    with Image.open(usable[0][0]) as first:
        aspect = first.height / first.width if first.width else 0.5625
    cell_w = (GRID_MAX_PX - (cols + 1) * GRID_PAD) // cols
    cell_h = int(cell_w * aspect)
    label_h = max(18, cell_w // 26)
    font = _load_font(max(13, int(label_h * 0.8)))
    row_h = cell_h + label_h + GRID_PAD
    per_image = cols * grid_rows(cell_h, label_h)

    out_dir.mkdir(parents=True, exist_ok=True)
    grids: List[Tuple[Path, List[str]]] = []

    for n, start in enumerate(range(0, len(usable), per_image), start=1):
        chunk = usable[start : start + per_image]
        chunk_rows = (len(chunk) + cols - 1) // cols
        canvas = Image.new(
            "RGB", (GRID_MAX_PX, chunk_rows * row_h + GRID_PAD), (24, 24, 24)
        )
        draw = ImageDraw.Draw(canvas)
        for i, (path, label) in enumerate(chunk):
            x = GRID_PAD + (i % cols) * (cell_w + GRID_PAD)
            y = GRID_PAD + (i // cols) * row_h
            draw.text((x, y), label, fill=(255, 214, 10), font=font)
            try:
                with Image.open(path) as img:
                    thumb = img.convert("RGB")
                    thumb.thumbnail((cell_w, cell_h), Image.Resampling.LANCZOS)
                    canvas.paste(thumb, (x, y + label_h))
            except (OSError, ValueError):
                continue
        dest = out_dir / f"{name}-{n:03d}.jpg"
        canvas.save(dest, "JPEG", quality=85)
        grids.append((dest, [label for _, label in chunk]))
    return grids


def grid_lines(
    grids: List[Tuple[Path, Optional[str], List[int]]],
) -> List[str]:
    """One `grid N (slides ...): path` line per image."""
    return [
        f"  grid {n} (slides {','.join(str(s) for s in slide_nos)}): "
        f"{scoped or f'{dest} (not on the conversation mount)'}"
        for n, (dest, scoped, slide_nos) in enumerate(grids, start=1)
    ]

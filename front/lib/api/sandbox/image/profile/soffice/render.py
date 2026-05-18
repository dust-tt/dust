"""LibreOffice + pdftoppm rasterization pipeline shared by docx / pptx."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path
from typing import List, Optional, Tuple


def render_via_soffice(
    file_path: str,
    *,
    out_root: Path,
    item_name: str,
    item_idx: Optional[int] = None,
) -> Tuple[Path, List[Path]]:
    """Convert `file_path` to PDF via soffice, then rasterize each page to
    `<out_root>/<basename>/<item_name>-NNN.jpg` at 100 dpi (3-digit
    zero-padded so paths sort lexically and stay stable across runs).

    When `item_idx` is None, regenerate from scratch and clear any existing
    output directory. Otherwise rasterize that single page only.

    Returns `(out_dir, sorted_rendered_paths)`. Raises ValueError with a
    tail-of-stderr message on soffice or pdftoppm failure.
    """
    basename = os.path.splitext(os.path.basename(file_path))[0]
    out_dir = out_root / basename

    if item_idx is None and out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    pdf_path = out_dir / f"{basename}.pdf"
    soffice = subprocess.run(
        [
            "soffice",
            "--headless",
            "--convert-to", "pdf",
            "--outdir", str(out_dir),
            file_path,
        ],
        capture_output=True,
        text=True,
        timeout=180,
    )
    if soffice.returncode != 0 or not pdf_path.exists():
        tail = (soffice.stderr or soffice.stdout or "").strip().splitlines()
        msg = tail[-1] if tail else "soffice produced no output"
        raise ValueError(f"pdf conversion failed: {msg}")

    pdftoppm_args = ["pdftoppm", "-jpeg", "-r", "100"]
    if item_idx is not None:
        pdftoppm_args.extend(["-f", str(item_idx), "-l", str(item_idx)])
    pdftoppm_args.extend([str(pdf_path), str(out_dir / item_name)])
    pdftoppm = subprocess.run(
        pdftoppm_args,
        capture_output=True,
        text=True,
        timeout=180,
    )
    if pdftoppm.returncode != 0:
        tail = (pdftoppm.stderr or pdftoppm.stdout or "").strip().splitlines()
        msg = tail[-1] if tail else "pdftoppm produced no output"
        raise ValueError(f"page rasterization failed: {msg}")

    rendered: List[Path] = sorted(out_dir.glob(f"{item_name}-*.jpg"))
    if not rendered:
        raise ValueError("no page images produced")

    # pdftoppm zero-pads its index to the page count's width. Renormalize so
    # paths sort and look consistent across runs.
    normalized: List[Path] = []
    for src in rendered:
        stem = src.stem
        try:
            n = int(stem.split("-", 1)[1])
        except (IndexError, ValueError):
            continue
        target = out_dir / f"{item_name}-{n:03d}.jpg"
        if src != target:
            src.rename(target)
        normalized.append(target)
    normalized.sort()
    return out_dir, normalized

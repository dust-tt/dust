"""LibreOffice + pdftoppm rasterization pipeline shared by docx / pptx."""

from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
from pathlib import Path
from typing import List, Optional, Tuple


def _pdf_is_fresh(pdf_path: Path, source_path: str) -> bool:
    """True when a previously converted PDF can be reused: it exists and was
    written strictly after the source file's last modification. Any edit bumps
    the source mtime, so a stale PDF returns False and the caller reconverts.
    Equal mtimes are treated as stale (prefer correctness over a reuse)."""
    if not pdf_path.exists():
        return False
    return pdf_path.stat().st_mtime_ns > os.stat(source_path).st_mtime_ns


def cache_dir_name(file_path: str) -> str:
    """Directory name holding one source file's converted PDF and rasters.

    Keyed on the whole path, not just the basename: two decks called deck.pptx
    in different folders would otherwise share a cache directory, and the mtime
    check then hands the second one the first one's PDF - a QA pass read off the
    wrong deck, reported as clean."""
    digest = hashlib.sha1(
        os.path.abspath(file_path).encode("utf-8", "replace")
    ).hexdigest()[:8]
    return f"{os.path.splitext(os.path.basename(file_path))[0]}-{digest}"


def render_via_soffice(
    file_path: str,
    *,
    out_root: Path,
    item_name: str,
    item_idx: Optional[int] = None,
) -> Tuple[Path, List[Path]]:
    """Convert `file_path` to PDF via soffice, then rasterize each page to
    `<out_root>/<basename>-<hash>/<item_name>-NNN.jpg` at 100 dpi (3-digit
    zero-padded so paths sort lexically and stay stable across runs).

    When `item_idx` is None, regenerate from scratch and clear any existing
    output directory. Otherwise rasterize that single page only.

    Returns `(out_dir, sorted_rendered_paths)`. Raises ValueError with a
    tail-of-stderr message on soffice or pdftoppm failure.
    """
    basename = os.path.splitext(os.path.basename(file_path))[0]
    out_dir = out_root / cache_dir_name(file_path)

    if item_idx is None and out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    pdf_path = out_dir / f"{basename}.pdf"
    # soffice conversion (cold start + full-deck render) is the dominant cost
    # and produces the whole deck's PDF no matter which page we want. The QA
    # loop renders slides one at a time, so without caching an N-slide pass pays
    # N conversions and blows the command timeout. Reuse the PDF while it is
    # newer than the source; the item_idx-is-None path above already cleared
    # out_dir, so full renders still reconvert from scratch.
    if not _pdf_is_fresh(pdf_path, file_path):
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

    # 150 dpi, not 100: a 10in slide rasterizes to 1500px, which is what the
    # reader's vision pipeline keeps (it downscales to a 1568px long edge). At
    # 100 dpi a third of that resolution was thrown away for nothing, and 10pt
    # captions - exactly the copy that goes wrong - were unreadable in the QA
    # image. The published JPEG is still capped by render_publish.
    pdftoppm_args = ["pdftoppm", "-jpeg", "-r", "150"]
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
    # A stale padded variant (slide-8 vs slide-008 from an earlier run) can
    # normalize onto the same name and be appended twice - de-dupe.
    normalized = sorted(set(normalized))
    # A single-slide render must return ONLY that slide. The output dir is not
    # cleared for a single page (so post-fix re-checks are fast), which means
    # the glob above also picks up siblings left by previous renders; keep just
    # the page we rendered.
    if item_idx is not None:
        target = out_dir / f"{item_name}-{item_idx:03d}.jpg"
        if target.exists():
            normalized = [target]
    return out_dir, normalized

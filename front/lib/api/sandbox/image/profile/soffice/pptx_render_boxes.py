"""Bounding-box render overlay for pptx_inspect: draw each shape's box on the
rasterized slide, detect rendered text-row positions by edge density, and flag
decorative-marker runs left with no text row beside them.

The top layer of the visual QA — depends on geometry (shape_kind,
_classify_overlap, EMU) and PIL; the CLI calls _annotate_boxes from --render.
"""
from __future__ import annotations

from pathlib import Path
from typing import List, Optional, Tuple

from pptx.shapes.base import BaseShape
from pptx.slide import Slide

from pptx_geometry import EMU_PER_INCH, _classify_overlap, shape_kind


# Text-row detection by horizontal EDGE density. A box that spans a gradient or
# blob background has a constant colour-vs-median "ink" baseline that collapses
# to one fake row, but glyph strokes still produce many sharp horizontal
# transitions while smooth backgrounds produce ~none — so edge count separates
# text from background regardless of contrast polarity or gradient. Returns each
# detected line's vertical centre (px): the input for marker alignment.
#
# Per-row colour and contrast were tried here and dropped: legible white-on-brand
# text over the template's gradient measures only ~1.4-3.0 (no threshold
# separates intended low-contrast from broken), and the per-strip ink colour is
# too noisy to judge colour uniformity. The deterministic `--compare` slot audit
# catches the colour-mismatch defect at its source instead.
TEXTROW_EDGE_DELTA = 60  # adjacent-sample manhattan diff that marks a glyph edge
TEXTROW_X_STEP = 2  # sample every Nth column (speed; detection is robust to it)


def _text_row_centers(
    rgb_image, box_px: Tuple[float, float, float, float]
) -> List[float]:
    x0, y0, x1, y1 = (int(box_px[0]), int(box_px[1]),
                      int(box_px[2]), int(box_px[3]))
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(rgb_image.width, x1), min(rgb_image.height, y1)
    if x1 - x0 < 6 or y1 - y0 < 6:
        return []
    px = rgb_image.load()
    xs = list(range(x0, x1, TEXTROW_X_STEP))
    edge_min = max(8, len(xs) // 15)  # text rows show many edges; background ~0-3

    def edge_count(y):
        line = [px[x, y] for x in xs]
        return sum(
            1 for a, b in zip(line, line[1:])
            if abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])
            > TEXTROW_EDGE_DELTA
        )

    out: List[float] = []
    group: List[int] = []

    def flush():
        if len(group) >= 2:  # a text line spans more than one pixel row
            out.append((min(group) + max(group)) / 2.0)

    for y in range(y0, y1):
        if edge_count(y) >= edge_min:
            group.append(y)
        else:
            flush()
            group = []
    flush()
    return out


_BOX_PALETTE = [
    (255, 64, 64), (64, 160, 255), (0, 200, 120), (255, 170, 0),
    (200, 80, 255), (0, 200, 200), (255, 90, 170), (150, 210, 0),
]

# Decorative row-markers (checkmarks, bullets, numbers, icons) are placed at
# FIXED positions to sit beside specific text rows. When filled copy wraps, the
# rendered rows drift off those positions and a marker strands in empty space —
# a defect box-geometry can't see (the marker didn't move; the text reflowed).
# Detect a marker as a small shape that forms a regular vertical run of >=3
# beside a text box, then check each one has a rendered text row near it.
MARKER_MAX_DIM_EMU = int(EMU_PER_INCH * 0.6)  # a row-marker is small both ways
MARKER_X_TOL_EMU = int(EMU_PER_INCH * 0.15)  # same-column left tolerance
MARKER_MIN_RUN = 3  # a run is at least this many aligned markers
MARKER_PAIR_GAP_EMU = EMU_PER_INCH  # max horizontal gap to pair a run to a text box
MARKER_ALIGN_TOL_IN = 0.15  # a marker within this of a text row counts as aligned


def _marker_runs(shapes: List[BaseShape]) -> List[List[BaseShape]]:
    """Group small decorative shapes into vertical runs (>=3 sharing a left
    edge). Each run is returned sorted top-to-bottom."""
    cands = sorted(
        [
            s for s in shapes
            if shape_kind(s) in ("pic", "auto")
            and s.width and s.height
            and s.width <= MARKER_MAX_DIM_EMU and s.height <= MARKER_MAX_DIM_EMU
        ],
        key=lambda s: s.left,
    )
    runs: List[List[BaseShape]] = []
    used = [False] * len(cands)
    for i, s in enumerate(cands):
        if used[i]:
            continue
        col = [s]
        used[i] = True
        for j in range(i + 1, len(cands)):
            if not used[j] and abs(cands[j].left - s.left) <= MARKER_X_TOL_EMU:
                col.append(cands[j])
                used[j] = True
        if len(col) >= MARKER_MIN_RUN:
            runs.append(sorted(col, key=lambda s: s.top))
    return runs


def _pair_run_to_text(
    run: List[BaseShape], text_shapes: List[BaseShape]
) -> Optional[BaseShape]:
    """The text box a marker run belongs to: the nearest text shape (within
    MARKER_PAIR_GAP_EMU horizontally) whose vertical span overlaps the run."""
    run_left = min(s.left for s in run)
    run_right = max(s.left + s.width for s in run)
    run_top = min(s.top for s in run)
    run_bot = max(s.top + s.height for s in run)
    best, best_gap = None, None
    for t in text_shapes:
        if min(run_bot, t.top + t.height) - max(run_top, t.top) <= 0:
            continue  # no vertical overlap
        if t.left >= run_right:
            gap = t.left - run_right
        elif t.left + t.width <= run_left:
            gap = run_left - (t.left + t.width)
        else:
            gap = 0
        if gap <= MARKER_PAIR_GAP_EMU and (best_gap is None or gap < best_gap):
            best, best_gap = t, gap
    return best


def _annotate_boxes(
    image_path: Path, slide: Slide, slide_w_emu: int, slide_h_emu: int
):
    """Overlay each top-level shape's exact bounding box on the slide image and
    compute pixel metrics. Box positions are read from the file (exact even
    though text is LibreOffice-rendered); the rest is measured on the rendered
    pixels (colors/positions are faithful). Draws box outlines, an `#id` label
    just OUTSIDE each box (detail goes to stdout, not onto the image), a tint on
    text boxes, and a red wash over peer-overlap regions. Returns
    (out_path, findings) where findings has keys: "overlaps" [(a, b, pen_in)] and
    "markers" [(id, off_in)] (decorative markers in a run with no rendered text
    row near them). None if the image is unreadable."""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return None
    if not slide_w_emu or not slide_h_emu:
        return None
    try:
        base = Image.open(image_path).convert("RGBA")
    except (OSError, ValueError):
        return None
    width_px, height_px = base.size
    sample = base.convert("RGB")  # clean pixels for metrics (before overlay)
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    try:
        font = ImageFont.load_default()
    except Exception:  # noqa: BLE001 - label font is optional
        font = None

    findings = {"overlaps": [], "markers": []}
    ppi = width_px / (slide_w_emu / EMU_PER_INCH)

    def to_px(sh):
        return (
            sh.left / slide_w_emu * width_px,
            sh.top / slide_h_emu * height_px,
            (sh.left + sh.width) / slide_w_emu * width_px,
            (sh.top + sh.height) / slide_h_emu * height_px,
        )

    def has_text(sh):
        return sh.has_text_frame and any(
            (p.text or "").strip() for p in sh.text_frame.paragraphs
        )

    shapes = [
        s for s in slide.shapes
        if None not in (s.left, s.top, s.width, s.height)
    ]

    # Shade peer-overlap intersection regions (the "collision zones").
    for i, a in enumerate(shapes):
        for b in shapes[i + 1:]:
            kind, pen, _ = _classify_overlap(
                (a.left, a.top, a.width, a.height),
                (b.left, b.top, b.width, b.height),
            )
            if kind != "peer":
                continue
            ax0, ay0, ax1, ay1 = to_px(a)
            bx0, by0, bx1, by1 = to_px(b)
            ix0, iy0 = max(ax0, bx0), max(ay0, by0)
            ix1, iy1 = min(ax1, bx1), min(ay1, by1)
            if ix1 > ix0 and iy1 > iy0:
                draw.rectangle([ix0, iy0, ix1, iy1], fill=(255, 0, 0, 130))
                findings["overlaps"].append(
                    (a.shape_id, b.shape_id, pen / EMU_PER_INCH)
                )

    # Decorative-marker alignment: each marker in a run should have a rendered
    # text row near it in the text box it pairs with. Detect each text box's row
    # positions once, then check the runs against the box each pairs with.
    text_shapes = [s for s in shapes if has_text(s)]
    rows_by_id = {
        s.shape_id: _text_row_centers(sample, to_px(s)) for s in text_shapes
    }
    for run in _marker_runs(shapes):
        paired = _pair_run_to_text(run, text_shapes)
        if paired is None:
            continue  # standalone decoration, not row-markers
        rows = rows_by_id.get(paired.shape_id) or []
        if not rows:
            continue
        for m in run:
            my = (m.top + m.height / 2) / slide_h_emu * height_px
            nearest = min(abs(yc - my) for yc in rows)
            if nearest / ppi > MARKER_ALIGN_TOL_IN:
                findings["markers"].append((m.shape_id, nearest / ppi))

    for i, shape in enumerate(shapes):
        x0, y0, x1, y1 = to_px(shape)
        color = _BOX_PALETTE[i % len(_BOX_PALETTE)]
        if has_text(shape):
            draw.rectangle([x0, y0, x1, y1], fill=color + (40,))
        draw.rectangle([x0, y0, x1, y1], outline=color + (255,), width=3)
        # Label OUTSIDE the box (above-left), so it never occludes content; the
        # per-shape detail lives in the stdout digest, keyed by this #id.
        ly = y0 - 13 if y0 >= 13 else y0 + 1
        draw.text((x0, ly), f"#{shape.shape_id}", fill=color + (255,), font=font)

    out_path = image_path.with_name(image_path.stem + "-boxes.png")
    try:
        Image.alpha_composite(base, overlay).convert("RGB").save(out_path)
    except (OSError, ValueError):
        return None
    return out_path, findings

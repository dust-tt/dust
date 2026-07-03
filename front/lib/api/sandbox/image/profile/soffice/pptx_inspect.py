#!/opt/venv/bin/python3
"""pptx_inspect — paginated structural inspection of .pptx decks.

Backed by python-pptx for slide/shape/placeholder/text traversal; the
shared `ooxml` helpers and stdlib `zipfile` are used for chart titles
and embedded media listing where python-pptx is awkward or silent.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import zipfile
from pathlib import Path
from typing import Dict, Iterable, List, NamedTuple, Optional, Tuple

import ooxml
import render
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE
from pptx.enum.text import MSO_AUTO_SIZE
from pptx.oxml.ns import qn
from pptx.presentation import Presentation as PresentationType
from pptx.shapes.base import BaseShape
from pptx.slide import Slide
from utils import (
    TEXT_PREVIEW_LIMIT,
    ellipsize,
    flatten_text,
    format_size,
    pad,
    safe_output,
)

from pptx_typography import (
    _read_clr_map,
    _read_layout_chain,
    _read_theme_for_master,
    _resolve_scheme_color,
    format_placeholder_defaults,
    placeholder_type,
    resolve_placeholder_defaults,
    text_frame_lines,
)

DEFAULT_MAX_SHAPES = 200
EMU_PER_INCH = 914_400
EDGE_EPSILON_EMU = 45_720  # 0.05" tolerance before flagging edge overflow.

# Text-fit estimation. What decides whether text fits is the box geometry at
# the chosen font size, not the word count — so we estimate how many characters
# a box holds and surface it, to stop the agent sizing text blindly. It is a
# rough ESTIMATE (real wrapping depends on glyph metrics / line spacing we don't
# reproduce), so the overset warning only fires on GROSS overflow of a genuine
# multi-line container, never on a box short enough to be a nominal-height label
# (text overflows those by design) or one set to grow to fit its text.
CHAR_WIDTH_EM = 0.5  # avg proportional Latin glyph advance, in em
LINE_HEIGHT_FACTOR = 1.2  # typical single line height, in em
TEXTBOX_MARGIN_W_IN = 0.2  # PowerPoint default internal left+right inset
TEXTBOX_MARGIN_H_IN = 0.1  # PowerPoint default internal top+bottom inset
OVERSET_TOLERANCE = 1.8  # flag only when text exceeds capacity by this factor
FILL_FLOATING = 0.30  # text using less than this fraction of a real box "floats"


# Drawing-namespace handles for detecting embedded images anywhere in a shape
# subtree. A populated picture placeholder reports shape_type PLACEHOLDER (not
# PICTURE), and a picture *fill* on an auto shape or the slide background is not
# a picture shape at all — but all of them carry a populated <a:blip>.
A_BLIP = qn("a:blip")
R_EMBED = qn("r:embed")
R_LINK = qn("r:link")
P_BG = qn("p:bg")


def _has_embedded_blip(element) -> bool:
    """True if the element subtree contains a populated <a:blip> (an embedded or
    linked image). Catches imagery that shape_type alone misses."""
    if element is None:
        return False
    for blip in element.iter(A_BLIP):
        if blip.get(R_EMBED) or blip.get(R_LINK):
            return True
    return False


class SlideContext(NamedTuple):
    width_emu: int
    height_emu: int

USAGE = (
    "pptx_inspect <file> [--slide N] [--layouts] [--text] [--media] "
    "[--render [--no-boxes]] [--compare FILE] [--max-shapes N] [--offset N]"
)

HELP_TEXT = (
    "pptx_inspect - Inspect .pptx deck structure\n"
    "\n"
    f"Usage: {USAGE}\n"
    "\n"
    "Arguments:\n"
    "  file              Path to .pptx deck (required)\n"
    "\n"
    "Options:\n"
    "  --slide N         Show one slide's shapes (1-indexed): kind, position,\n"
    "                    size, text, formatting, placeholder type, and a text-fit\n"
    "                    estimate per text shape (holds~Nch@Spt / ~Nch/line@Spt),\n"
    "                    with a [!] TEXT OVERSET flag when text won't fit the box.\n"
    "  --layouts         List slide masters and their layouts with placeholder slots,\n"
    "                    including each placeholder's resolved default typeface,\n"
    "                    size, weight, color, and alignment (from layout / master /\n"
    "                    theme inheritance).\n"
    "  --text            Extract readable text per slide (preserves slide/shape boundaries).\n"
    "  --media           List embedded media (images, audio, video) with file sizes.\n"
    "  --render          Rasterize slides via LibreOffice + pdftoppm AND overlay each\n"
    "                    shape's exact bounding box (labeled '#id' just outside it,\n"
    "                    text shapes tinted) so overflow, overlap, distorted images,\n"
    "                    and stranded decorative markers are visible. A red wash\n"
    "                    marks peer-overlap regions; a Pixel-metrics line notes\n"
    "                    marker runs (checkmarks/icons) with no text row beside them.\n"
    "                    Writes slide-NNN-boxes.png (one path per slide). Combine\n"
    "                    with --slide N to re-render one slide after a fix. The\n"
    "                    boxed render is the core visual-QA signal — always use it.\n"
    "  --no-boxes        With --render: emit the clean JPEG only (no overlay).\n"
    "  --compare FILE    Compare <file> (your edited output) against FILE (the\n"
    "                    source/template): slide count, embedded media, embedded\n"
    "                    fonts, imagery/layout/density, and per-shape content-slot\n"
    "                    fidelity (text written into the template's spacer\n"
    "                    paragraphs). Ends with a [QA: PASS/FAIL] verdict.\n"
    "  --max-shapes N    Maximum shapes to print in slide view (default 200).\n"
    "  --offset N        Skip first N shapes in slide view (default 0).\n"
    "\n"
    "Output (slide view, one shape per line, paragraphs indented):\n"
    "  <id>  <kind>  <left,top inWxinH>  [ph=<type>]  <summary>\n"
    "    p[i]: <text>  [<font hints>]\n"
    "Paragraphs are addressed by index p[i]; empty spacer paragraphs are shown\n"
    "(trailing ones collapsed to a count); long text is ellipsized."
)


def emu_to_inches(emu: Optional[int]) -> Optional[float]:
    if emu is None:
        return None
    return emu / EMU_PER_INCH


def format_box(shape: BaseShape) -> str:
    left = emu_to_inches(shape.left)
    top = emu_to_inches(shape.top)
    width = emu_to_inches(shape.width)
    height = emu_to_inches(shape.height)
    if None in (left, top, width, height):
        return "(?,?)"
    return f"({left:.1f},{top:.1f}) {width:.1f}x{height:.1f}\""


def shape_kind(shape: BaseShape) -> str:
    if shape.has_chart:
        return "chart"
    if shape.has_table:
        return "table"
    st = shape.shape_type
    if st == MSO_SHAPE_TYPE.PICTURE:
        return "pic"
    if st == MSO_SHAPE_TYPE.GROUP:
        return "group"
    if st == MSO_SHAPE_TYPE.TEXT_BOX:
        return "text"
    if st == MSO_SHAPE_TYPE.PLACEHOLDER:
        return "ph"
    if st == MSO_SHAPE_TYPE.AUTO_SHAPE:
        return "auto"
    if st == MSO_SHAPE_TYPE.LINE:
        return "line"
    if st == MSO_SHAPE_TYPE.FREEFORM:
        return "free"
    if st == MSO_SHAPE_TYPE.MEDIA:
        return "media"
    name = getattr(st, "name", None)
    return name.lower() if name else "shape"


def picture_summary(shape: BaseShape) -> str:
    image = getattr(shape, "image", None)
    if image is None:
        return ""
    parts: List[str] = []
    filename = getattr(image, "filename", None)
    if filename:
        parts.append(filename)
    size = getattr(image, "size", None)
    if isinstance(size, tuple) and len(size) == 2:
        parts.append(f"{size[0]}x{size[1]}px")
    content_type = getattr(image, "content_type", None)
    if content_type:
        parts.append(content_type)
    return "  ".join(parts)


def chart_summary(shape: BaseShape) -> str:
    chart = shape.chart
    parts: List[str] = []
    chart_type = getattr(chart, "chart_type", None)
    if chart_type is not None:
        type_name = getattr(chart_type, "name", str(chart_type))
        parts.append(type_name.lower())
    series_count = sum(1 for _ in chart.series)
    parts.append(f"series:{series_count}")
    title = ""
    if getattr(chart, "has_title", False):
        try:
            title = flatten_text(chart.chart_title.text_frame.text or "").strip()
        except (AttributeError, ValueError):
            title = ""
    if not title:
        title = flatten_text(chart_title_via_zip(shape)).strip()
    if title:
        parts.append(f'title:"{ellipsize(title, TEXT_PREVIEW_LIMIT)}"')
    return "  ".join(parts)


def chart_title_via_zip(shape: BaseShape) -> str:
    """Fallback: resolve the chart part via the slide's rels and parse the
    DrawingML title with the shared ooxml helper."""
    chart = getattr(shape, "chart", None)
    if chart is None:
        return ""
    part = getattr(chart, "part", None)
    partname = getattr(part, "partname", None)
    if not partname:
        return ""
    chart_path = str(partname).lstrip("/")
    pkg = getattr(part, "package", None)
    pkg_path = getattr(pkg, "_path", None) or getattr(pkg, "path", None)
    if not pkg_path:
        return ""
    try:
        zf = zipfile.ZipFile(pkg_path)
    except (zipfile.BadZipFile, OSError):
        return ""
    with zf:
        return ooxml.parse_chart_title(zf, chart_path) or ""


def table_summary(shape: BaseShape) -> Tuple[str, List[str]]:
    table = shape.table
    rows = list(table.rows)
    nrows = len(rows)
    ncols = len(rows[0].cells) if rows else 0
    summary = f"{nrows}x{ncols}"
    cell_lines: List[str] = []
    for r, row in enumerate(rows):
        for c, cell in enumerate(row.cells):
            text = flatten_text(cell.text or "").strip()
            if not text:
                continue
            cell_lines.append(
                f"  ({r + 1},{c + 1}) {ellipsize(text, TEXT_PREVIEW_LIMIT)}"
            )
    return summary, cell_lines


def slide_title(slide: Slide) -> str:
    title_shape = slide.shapes.title
    if title_shape is None or not title_shape.has_text_frame:
        return ""
    return flatten_text(title_shape.text_frame.text or "").strip()


def slide_is_hidden(slide: Slide) -> bool:
    return slide.element.get("show") == "0"


def _shape_text_iter(shape: BaseShape) -> Iterable[str]:
    kind = shape_kind(shape)
    if kind == "group":
        for inner in shape.shapes:
            yield from _shape_text_iter(inner)
        return
    if kind == "table":
        for row in shape.table.rows:
            for cell in row.cells:
                yield cell.text or ""
        return
    if shape.has_text_frame:
        for paragraph in shape.text_frame.paragraphs:
            yield paragraph.text or ""


def slide_word_count(slide: Slide) -> int:
    count = 0
    for shape in slide.shapes:
        for text in _shape_text_iter(shape):
            count += len(text.split())
    return count


def count_shapes_by_kind(shapes: Iterable[BaseShape]) -> dict:
    counts = {"text": 0, "pic": 0, "chart": 0, "table": 0, "other": 0}
    for shape in shapes:
        if shape.has_chart:
            counts["chart"] += 1
        elif shape.has_table:
            counts["table"] += 1
        elif shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
            counts["pic"] += 1
        elif _has_embedded_blip(getattr(shape, "_element", None)):
            counts["pic"] += 1  # picture placeholder / picture-filled shape
        elif shape.has_text_frame and (shape.text_frame.text or "").strip():
            counts["text"] += 1
        else:
            counts["other"] += 1
    return counts


CoverRect = Tuple[int, int, int, int, int]  # (shape_id, left, top, width, height)


def _cover_candidates(shapes: Iterable[BaseShape]) -> List[CoverRect]:
    """Bounding boxes of non-placeholder shapes on the slide, used to decide
    whether an empty placeholder is actually covered by visible content."""
    out: List[CoverRect] = []
    for shape in shapes:
        if placeholder_type(shape) is not None:
            continue
        left, top, width, height = (
            shape.left,
            shape.top,
            shape.width,
            shape.height,
        )
        if None in (left, top, width, height):
            continue
        out.append((shape.shape_id, left, top, width, height))
    return out


def _find_covering_shape(
    placeholder: BaseShape, candidates: List[CoverRect]
) -> Optional[int]:
    """Return the shape_id of a non-placeholder shape whose bounding box
    covers ≥50% of the placeholder's box, or None if no shape does. Used to
    flip the empty-placeholder marker from "populate" to "delete"."""
    pl_left = placeholder.left
    pl_top = placeholder.top
    pl_w = placeholder.width
    pl_h = placeholder.height
    if None in (pl_left, pl_top, pl_w, pl_h) or pl_w <= 0 or pl_h <= 0:
        return None
    pl_right = pl_left + pl_w
    pl_bottom = pl_top + pl_h
    pl_area = pl_w * pl_h
    for shape_id, left, top, w, h in candidates:
        ix = max(0, min(pl_right, left + w) - max(pl_left, left))
        iy = max(0, min(pl_bottom, top + h) - max(pl_top, top))
        if ix * iy * 2 >= pl_area:
            return shape_id
    return None


class FitEstimate(NamedTuple):
    chars_per_line: int
    capacity: Optional[int]  # total chars; None when height isn't a real constraint


def _effective_font_size_pt(shape: BaseShape, layout_chain) -> Optional[float]:
    """The size text in this shape renders at: an explicit run size if set,
    else the placeholder's resolved layout default."""
    if shape.has_text_frame:
        for paragraph in shape.text_frame.paragraphs:
            for run in paragraph.runs:
                size = getattr(run.font, "size", None)
                if size is not None:
                    return size.pt
    ph = placeholder_type(shape)
    if ph and layout_chain is not None:
        layout_xml, master_xml, theme_xml, clr_map, theme_colors = layout_chain
        pf = getattr(shape, "placeholder_format", None)
        idx = pf.idx if pf else None
        defaults = resolve_placeholder_defaults(
            layout_xml, master_xml, theme_xml, clr_map, theme_colors, idx, ph
        )
        size_pt = defaults.get("size_pt")
        if size_pt:
            return float(size_pt)
    return None


def _frame_text_len(shape: BaseShape) -> int:
    if not shape.has_text_frame:
        return 0
    return sum(len(p.text or "") for p in shape.text_frame.paragraphs)


def _fit_estimate(shape: BaseShape, size_pt: float) -> Optional[FitEstimate]:
    if shape.width is None or shape.height is None or size_pt <= 0:
        return None
    w_in = shape.width / EMU_PER_INCH
    h_in = shape.height / EMU_PER_INCH
    char_w = size_pt * CHAR_WIDTH_EM / 72.0
    line_h = size_pt * LINE_HEIGHT_FACTOR / 72.0
    if char_w <= 0 or line_h <= 0:
        return None
    cpl = int(max(0.0, w_in - TEXTBOX_MARGIN_W_IN) / char_w)
    lines = int(max(0.0, h_in - TEXTBOX_MARGIN_H_IN) / line_h)
    if cpl < 1:
        return None
    # Height constrains only genuine multi-line containers; a box shorter than
    # ~2 lines is a nominal-height label whose text overflows by design.
    capacity = cpl * lines if lines >= 2 else None
    return FitEstimate(cpl, capacity)


def _grows_to_fit(shape: BaseShape) -> bool:
    return (
        shape.has_text_frame
        and shape.text_frame.auto_size == MSO_AUTO_SIZE.SHAPE_TO_FIT_TEXT
    )


def _fit_tokens(shape: BaseShape, layout_chain) -> List[str]:
    """A capacity annotation for any sized text shape, plus an overset marker
    when text grossly exceeds a real container's estimated capacity."""
    used = _frame_text_len(shape)
    if used == 0:
        return []
    size_pt = _effective_font_size_pt(shape, layout_chain)
    if size_pt is None:
        return []
    est = _fit_estimate(shape, size_pt)
    if est is None:
        return []
    size_label = (
        int(size_pt) if float(size_pt).is_integer() else round(size_pt, 1)
    )
    if est.capacity is None:
        return [f"~{est.chars_per_line}ch/line@{size_label}pt"]
    tokens = [f"holds~{est.capacity}ch@{size_label}pt"]
    if not _grows_to_fit(shape):
        if used > est.capacity * OVERSET_TOLERANCE:
            tokens.append(
                f"[!] text overset (est) — ~{used} chars; box holds "
                f"~{est.capacity} at {size_label}pt"
            )
        elif used < est.capacity * FILL_FLOATING:
            tokens.append(
                f"[i] underfilled — ~{used} of ~{est.capacity}ch used"
            )
    return tokens


def describe_shape(
    shape: BaseShape,
    *,
    ctx: Optional[SlideContext] = None,
    cover_candidates: Optional[List[CoverRect]] = None,
    all_boxes: Optional[List[CoverRect]] = None,
    layout_chain=None,
    indent: str = "",
) -> List[str]:
    kind = shape_kind(shape)
    box = format_box(shape)
    parts = [pad(f"#{shape.shape_id}", 6), pad(kind, 6), pad(box, 24)]
    ph = placeholder_type(shape)
    if ph:
        parts.append(pad(f"ph={ph}", 14))

    sub_lines: List[str] = []
    summary = ""
    if kind == "chart":
        summary = chart_summary(shape)
    elif kind == "pic":
        summary = picture_summary(shape)
    elif kind == "table":
        ts, cell_lines = table_summary(shape)
        summary = ts
        sub_lines.extend(cell_lines)
    elif kind == "group":
        nested = list(shape.shapes)
        summary = f"shapes:{len(nested)}"
        for inner in nested:
            # Cover detection doesn't translate into groups: children's
            # coordinates are group-local, and "siblings" inside the group
            # are typically arranged on purpose. Drop the candidate list.
            sub_lines.extend(
                describe_shape(inner, ctx=ctx, layout_chain=layout_chain, indent="    ")
            )
        if shape.has_text_frame:
            sub_lines.extend(text_frame_lines(shape, indent="  "))
    else:
        text_lines = text_frame_lines(shape, indent="  ")
        if text_lines:
            sub_lines.extend(text_lines)
        else:
            name = (shape.name or "").strip()
            if name:
                summary = f'name:"{ellipsize(name, 40)}"'

    if summary:
        parts.append(summary)
    # Vertical anchor (how text sits in its box): surfaced so floating text — a
    # short string anchored top in a much taller box — is diagnosable alongside
    # the boxed render. Explicit value when set; text boxes/auto shapes default
    # to top; placeholders inherit (left unstated).
    if kind != "group" and shape.has_text_frame:
        has_text = any(
            (p.text or "").strip() for p in shape.text_frame.paragraphs
        )
        if has_text:
            va = getattr(shape.text_frame, "vertical_anchor", None)
            va_name = getattr(va, "name", None)
            if va_name:
                parts.append(f"vanchor={va_name.lower()}")
            elif not ph:
                parts.append("vanchor=top")
    for marker in _shape_warning_markers(
        shape, ph, ctx, cover_candidates, all_boxes
    ):
        parts.append(marker)
    for token in _fit_tokens(shape, layout_chain):
        parts.append(token)

    head = indent + "  ".join(parts).rstrip()
    return [head] + [indent + line for line in sub_lines]


ASPECT_TOLERANCE = 1.18  # flag image stretch/squish beyond ~15%
MIN_IMAGE_DPI = 70  # flag pictures displayed below this effective resolution
# Overlap classification. Overlap is often intentional (a label on a photo, a
# caption on a pill), so raw intersection is not a defect. We separate three
# cases by per-box containment (intersection / each box's area):
#   - both boxes >= STACKED_CONT covered  -> the boxes coincide (STACKED): a
#     real bug (e.g. a title and body dropped at the same spot) -> [!] blocker.
#   - one box >= CONTAINMENT_TAU inside the other -> foreground on background
#     (caption on a photo, text on a pill): intentional -> suppressed.
#   - otherwise, shallower-axis overlap >= PEER_PENETRATION_EMU -> a partial
#     peer overlap: could be a designed overlay or an accidental collision, so
#     it is surfaced as a quantitative [i] ADVISORY (judge it in the render),
#     never a hard blocker — that would fail the template's own overlays.
STACKED_CONT = 0.90  # both boxes >= this covered => effectively the same box
CONTAINMENT_TAU = 0.85  # one box >= this fraction inside the other => fg/bg, ok
PEER_PENETRATION_EMU = EMU_PER_INCH // 10  # 0.1" shallow-axis overlap to note it
CENTER_OFFSET_EMU = int(EMU_PER_INCH * 0.2)  # inner box off-center beyond this => advisory
SAFE_MARGIN_EMU = int(EMU_PER_INCH * 0.2)  # text crowding within this of an edge => advisory
FULL_SPAN = 0.9  # a shape covering >= this fraction of a slide axis is a banner/background


def _image_markers(shape: BaseShape) -> List[str]:
    """Aspect-ratio distortion and low-resolution warnings for a picture (or a
    populated picture placeholder). Distortion compares the display box ratio to
    the image's crop-adjusted native ratio — squished/stretched photos read as
    sloppy even when nothing overflows."""
    image = getattr(shape, "image", None)
    if image is None:
        return []
    size = getattr(image, "size", None)
    if not (isinstance(size, tuple) and len(size) == 2):
        return []
    nat_w, nat_h = size
    w, h = shape.width, shape.height
    if not w or not h or nat_w <= 0 or nat_h <= 0:
        return []
    try:
        cl = float(getattr(shape, "crop_left", 0) or 0)
        cr = float(getattr(shape, "crop_right", 0) or 0)
        ct = float(getattr(shape, "crop_top", 0) or 0)
        cb = float(getattr(shape, "crop_bottom", 0) or 0)
    except (TypeError, ValueError):
        cl = cr = ct = cb = 0.0
    vis_w = nat_w * max(1e-6, 1.0 - cl - cr)
    vis_h = nat_h * max(1e-6, 1.0 - ct - cb)
    nat_ratio = vis_w / vis_h
    disp_ratio = w / h
    markers: List[str] = []
    if nat_ratio > 0:
        rel = disp_ratio / nat_ratio
        if rel > ASPECT_TOLERANCE or rel < 1 / ASPECT_TOLERANCE:
            markers.append(
                f"[!] image distorted — box {disp_ratio:.2f}:1 vs image native "
                f"{nat_ratio:.2f}:1"
            )
    disp_w_in = w / EMU_PER_INCH
    if disp_w_in > 0:
        eff_dpi = vis_w / disp_w_in
        if eff_dpi < MIN_IMAGE_DPI:
            markers.append(
                f"[!] low-res image — ~{int(eff_dpi)} dpi at display size"
            )
    return markers


def _classify_overlap(a: Tuple[int, int, int, int],
                      b: Tuple[int, int, int, int]):
    """Classify the overlap of two (left, top, width, height) boxes.
    Returns (kind, penetration_emu, axis):
      - ("stacked", 0, "")     both boxes >= STACKED_CONT covered (coincide)
      - ("contained", 0, "")   one box >= CONTAINMENT_TAU inside the other (fg/bg)
      - ("peer", pen, axis)    partial overlap >= PEER_PENETRATION_EMU on the
                               shallow axis (a designed overlay or a collision)
      - (None, 0, "")          no/negligible overlap
    Shared by the --slide text lint and the --render overlap shading so both
    agree on what counts as a collision."""
    al, at, aw, ah = a
    bl, bt, bw, bh = b
    if min(aw, ah, bw, bh) <= 0:
        return (None, 0, "")
    ix = min(al + aw, bl + bw) - max(al, bl)
    iy = min(at + ah, bt + bh) - max(at, bt)
    if ix <= 0 or iy <= 0:
        return (None, 0, "")
    inter = ix * iy
    cont_a = inter / (aw * ah)
    cont_b = inter / (bw * bh)
    if min(cont_a, cont_b) >= STACKED_CONT:
        return ("stacked", 0, "")
    if max(cont_a, cont_b) >= CONTAINMENT_TAU:
        return ("contained", 0, "")
    if min(ix, iy) >= PEER_PENETRATION_EMU:
        return ("peer", min(ix, iy), "horizontally" if ix < iy else "vertically")
    return (None, 0, "")


def _overlap_markers(
    shape: BaseShape, all_boxes: Optional[List[CoverRect]]
) -> List[str]:
    """Flag this shape's overlaps quantitatively (each pair once, on the lower
    shape id): stacked -> [!] blocker; partial peer overlap -> [i] advisory with
    the inches to separate and the axis; containment (fg/bg) -> suppressed."""
    if not all_boxes:
        return []
    left, top, width, height = shape.left, shape.top, shape.width, shape.height
    if None in (left, top, width, height) or width <= 0 or height <= 0:
        return []
    out: List[str] = []
    for oid, ol, ot, ow, oh in all_boxes:
        if oid <= shape.shape_id or None in (ol, ot, ow, oh):
            continue
        kind, pen, axis = _classify_overlap(
            (left, top, width, height), (ol, ot, ow, oh)
        )
        if kind == "stacked":
            out.append(f"[!] stacked with shape #{oid} — boxes coincide")
        elif kind == "peer":
            out.append(
                f"[i] overlaps shape #{oid} by {pen / EMU_PER_INCH:.2f}in {axis}"
            )
        elif kind == "contained":
            # the smaller box sits inside the larger (fg/bg): note if the inner
            # box is markedly off-centre (a number floating high in its card).
            dx = abs((left + width / 2) - (ol + ow / 2))
            dy = abs((top + height / 2) - (ot + oh / 2))
            if max(dx, dy) >= CENTER_OFFSET_EMU:
                off = "horizontally" if dx >= dy else "vertically"
                out.append(
                    f"[i] off-centre from shape #{oid} by "
                    f"{max(dx, dy) / EMU_PER_INCH:.2f}in {off}"
                )
    return out


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


def _shape_warning_markers(
    shape: BaseShape,
    ph: Optional[str],
    ctx: Optional[SlideContext],
    cover_candidates: Optional[List[CoverRect]] = None,
    all_boxes: Optional[List[CoverRect]] = None,
) -> List[str]:
    markers: List[str] = []
    if ctx is not None:
        left, top, width, height = (
            shape.left,
            shape.top,
            shape.width,
            shape.height,
        )
        if None not in (left, top, width, height):
            if (
                left < -EDGE_EPSILON_EMU
                or top < -EDGE_EPSILON_EMU
                or left + width > ctx.width_emu + EDGE_EPSILON_EMU
                or top + height > ctx.height_emu + EDGE_EPSILON_EMU
            ):
                markers.append("[!] extends past slide edge")
            elif ctx.width_emu and ctx.height_emu and shape.has_text_frame and any(
                (p.text or "").strip() for p in shape.text_frame.paragraphs
            ):
                # Text crowding a slide edge (advisory). Skip full-span banners,
                # which legitimately bleed to the edge.
                if (
                    width < FULL_SPAN * ctx.width_emu
                    and height < FULL_SPAN * ctx.height_emu
                ):
                    gap = min(
                        left, top,
                        ctx.width_emu - (left + width),
                        ctx.height_emu - (top + height),
                    )
                    if 0 <= gap < SAFE_MARGIN_EMU:
                        markers.append(
                            f"[i] text {gap / EMU_PER_INCH:.2f}in from nearest "
                            "slide edge"
                        )
    markers.extend(_image_markers(shape))
    markers.extend(_overlap_markers(shape, all_boxes))
    if ph and shape.has_text_frame:
        has_text = any(
            (p.text or "").strip() for p in shape.text_frame.paragraphs
        )
        if not has_text:
            cover_id = (
                _find_covering_shape(shape, cover_candidates)
                if cover_candidates
                else None
            )
            if cover_id is not None:
                markers.append(
                    f"[!] empty placeholder, covered by shape #{cover_id}"
                )
            else:
                markers.append(
                    "[!] empty placeholder (renders the layout's prompt text)"
                )
    return markers


TITLE_PH_TYPES = frozenset({"title", "ctr_title", "center_title", "centertitle"})
BODY_PH_TYPES = frozenset({"body", "subtitle", "obj"})


def _theme_summary_line(file_path: str) -> Optional[str]:
    """One-line theme summary for the overview: name, bg/tx/accent colors.
    Fonts are reported separately by `_deck_fonts_line` so the agent does
    not conflate the theme's fallback typeface with the deck's actual one.
    Returns None if the package isn't readable."""
    try:
        zf = zipfile.ZipFile(file_path)
    except (zipfile.BadZipFile, OSError):
        return None
    with zf:
        pres_rels = ooxml.read_xml(
            zf, ooxml.rels_path_for("ppt/presentation.xml"))
        if pres_rels is None:
            return None
        master_path: Optional[str] = None
        for rel in pres_rels.findall("pr:Relationship", ooxml.NS):
            if rel.attrib.get("Type", "").endswith("/slideMaster"):
                master_path = ooxml.resolve_rel_target(
                    ooxml.rels_path_for("ppt/presentation.xml"),
                    rel.attrib["Target"],
                )
                break
        if not master_path:
            return None
        master_xml = ooxml.read_xml(zf, master_path)
        _, theme_xml = _read_theme_for_master(zf, master_path)
        if theme_xml is None:
            return None
        clr_map = _read_clr_map(master_xml)
        theme_colors = ooxml.theme_colors_by_name(theme_xml)
        theme_name = theme_xml.attrib.get("name") or "?"

        def _resolved(token: str) -> str:
            hx = _resolve_scheme_color(token, clr_map, theme_colors)
            return f"#{hx}" if hx else "—"

        accents = " ".join(_resolved(f"accent{i}") for i in range(1, 7))
        parts = [
            f"theme:{theme_name}",
            f"bg1:{_resolved('bg1')}",
            f"tx1:{_resolved('tx1')}",
            f"accents:{accents}",
        ]
        return "[" + " | ".join(parts) + "]"


def _format_font_key(
    key: Tuple[Optional[str], Optional[float], bool], varies: bool
) -> Optional[str]:
    typeface, size_pt, bold = key
    parts: List[str] = []
    if typeface:
        parts.append(typeface)
    if size_pt is not None:
        if float(size_pt).is_integer():
            parts.append(f"{int(size_pt)}pt")
        else:
            parts.append(f"{size_pt:.1f}pt")
    if bold:
        parts.append("bold")
    if not parts:
        return None
    rendered = " ".join(parts)
    return f"{rendered} (varies)" if varies else rendered


def _deck_fonts_line(prs: PresentationType, file_path: str) -> Optional[str]:
    """Resolve the dominant title and body placeholder typography across all
    layouts and report them alongside the theme's major/minor fallback.

    The theme's `major:`/`minor:` typefaces from <a:fontScheme> are only what
    runs outside placeholders inherit — many decks (e.g. the Dust template)
    declare Arial there but override every layout with Lexend. Reporting
    them as the deck's font misleads the agent into picking Arial for
    custom shapes. So we surface what the layouts actually resolve to, and
    keep the theme fallback only when it diverges from what the layouts use.
    """
    try:
        zf = zipfile.ZipFile(file_path)
    except (zipfile.BadZipFile, OSError):
        return None

    title_counts: Dict[Tuple[Optional[str], Optional[float], bool], int] = {}
    body_counts: Dict[Tuple[Optional[str], Optional[float], bool], int] = {}
    fallback_major: Optional[str] = None
    fallback_minor: Optional[str] = None

    with zf:
        for master in prs.slide_masters:
            for layout in master.slide_layouts:
                layout_path = _layout_part_path(layout)
                if not layout_path:
                    continue
                (
                    layout_xml,
                    master_xml,
                    theme_xml,
                    clr_map,
                    theme_colors,
                ) = _read_layout_chain(zf, layout_path)
                if fallback_major is None:
                    fallback_major = ooxml.theme_font(theme_xml, "major")
                if fallback_minor is None:
                    fallback_minor = ooxml.theme_font(theme_xml, "minor")
                if layout_xml is None:
                    continue
                for ph in layout.placeholders:
                    ph_name = placeholder_type(ph) or ""
                    if ph_name not in TITLE_PH_TYPES and ph_name not in BODY_PH_TYPES:
                        continue
                    pf = ph.placeholder_format
                    ph_idx = pf.idx if pf else None
                    defaults = resolve_placeholder_defaults(
                        layout_xml,
                        master_xml,
                        theme_xml,
                        clr_map,
                        theme_colors,
                        ph_idx=ph_idx,
                        ph_type=ph_name,
                    )
                    key = (
                        defaults.get("typeface"),
                        defaults.get("size_pt"),
                        bool(defaults.get("bold")),
                    )
                    bucket = title_counts if ph_name in TITLE_PH_TYPES else body_counts
                    bucket[key] = bucket.get(key, 0) + 1

    def _dominant(
        counts: Dict[Tuple[Optional[str], Optional[float], bool], int],
    ) -> Tuple[Optional[Tuple[Optional[str], Optional[float], bool]], bool]:
        if not counts:
            return None, False
        top_key = max(counts.items(), key=lambda kv: kv[1])[0]
        return top_key, len(counts) > 1

    title_key, title_varies = _dominant(title_counts)
    body_key, body_varies = _dominant(body_counts)

    title_str = _format_font_key(title_key, title_varies) if title_key else None
    body_str = _format_font_key(body_key, body_varies) if body_key else None

    title_face = title_key[0] if title_key else None
    body_face = body_key[0] if body_key else None
    title_matches_fallback = (
        fallback_major is not None and title_face == fallback_major
    )
    body_matches_fallback = (
        fallback_minor is not None and body_face == fallback_minor
    )
    show_fallback = bool(fallback_major or fallback_minor) and not (
        title_matches_fallback and body_matches_fallback
    )

    parts: List[str] = []
    if title_str:
        parts.append(f"title={title_str}")
    if body_str:
        parts.append(f"body={body_str}")
    if show_fallback:
        parts.append(
            f"theme-fallback={fallback_major or '—'}/{fallback_minor or '—'}"
        )
    if not parts:
        return None
    return "[fonts: " + " | ".join(parts) + "]"


def print_overview(prs: PresentationType, file_path: str) -> str:
    width = emu_to_inches(prs.slide_width) or 0.0
    height = emu_to_inches(prs.slide_height) or 0.0
    slide_count = len(prs.slides)
    layout_count = sum(len(m.slide_layouts) for m in prs.slide_masters)

    word_counts = [slide_word_count(slide) for slide in prs.slides]
    avg_words = sum(word_counts) // len(word_counts) if word_counts else 0
    max_words = max(word_counts) if word_counts else 0

    lines = [
        f"[Slides: {slide_count} | "
        f"size: {width:.1f}x{height:.1f}\" | "
        f"masters: {len(prs.slide_masters)} | "
        f"layouts: {layout_count} | "
        f"words/slide: avg={avg_words} max={max_words}]"
    ]
    theme_line = _theme_summary_line(file_path)
    if theme_line:
        lines.append(theme_line)
    fonts_line = _deck_fonts_line(prs, file_path)
    if fonts_line:
        lines.append(fonts_line)
    for idx, slide in enumerate(prs.slides, start=1):
        layout = slide.slide_layout.name or "?"
        title = slide_title(slide)
        counts = count_shapes_by_kind(slide.shapes)
        words = word_counts[idx - 1]
        flags: List[str] = []
        if slide.has_notes_slide and slide.notes_slide.notes_text_frame.text.strip():
            flags.append("notes")
        if slide_is_hidden(slide):
            flags.append("hidden")

        title_str = f'"{ellipsize(title, 40)}"' if title else ""
        counts_str = (
            f"shapes:{sum(counts.values())}  "
            f"text:{counts['text']}  pic:{counts['pic']}  "
            f"chart:{counts['chart']}  table:{counts['table']}  "
            f"words:{words}"
        )
        flags_str = f"  [{','.join(flags)}]" if flags else ""
        lines.append(
            f"  {pad(str(idx), 3)} {pad(ellipsize(layout, 24), 26)}"
            f"{pad(title_str, 42)}  {counts_str}{flags_str}"
        )
    return "\n".join(lines)


def find_slide(prs: PresentationType, idx: int) -> Slide:
    if idx < 1 or idx > len(prs.slides):
        raise ValueError(
            f"slide index out of range: {
                idx} (deck has {len(prs.slides)} slides)"
        )
    return prs.slides[idx - 1]


def print_slide(
    prs: PresentationType,
    file_path: str,
    idx: int,
    offset: int,
    max_shapes: int,
) -> str:
    slide = find_slide(prs, idx)
    shapes = list(slide.shapes)
    total = len(shapes)
    layout = slide.slide_layout.name or "?"
    title = slide_title(slide)
    title_str = f' | "{ellipsize(title, 60)}"' if title else ""
    flags: List[str] = []
    if slide_is_hidden(slide):
        flags.append("hidden")
    flags_str = f" | {','.join(flags)}" if flags else ""

    header = (
        f"[Slide {idx}/{len(prs.slides)} | layout: {layout}"
        f"{title_str}{flags_str} | shapes: {total}]"
    )
    lines = [header]

    ctx = SlideContext(
        width_emu=prs.slide_width or 0,
        height_emu=prs.slide_height or 0,
    )
    cover_candidates = _cover_candidates(shapes)
    all_boxes: List[CoverRect] = [
        (s.shape_id, s.left, s.top, s.width, s.height)
        for s in shapes
        if None not in (s.left, s.top, s.width, s.height)
    ]

    # Resolve the slide's layout chain once so fit estimates can use each
    # placeholder's inherited font size. Parsed elements outlive the zip.
    layout_chain = None
    try:
        zf: Optional[zipfile.ZipFile] = zipfile.ZipFile(file_path)
    except (zipfile.BadZipFile, OSError):
        zf = None
    if zf is not None:
        with zf:
            layout_path = _layout_part_path(slide.slide_layout)
            if layout_path:
                layout_chain = _read_layout_chain(zf, layout_path)

    end = min(total, offset + max_shapes)
    for shape in shapes[offset:end]:
        lines.extend(
            describe_shape(
                shape,
                ctx=ctx,
                cover_candidates=cover_candidates,
                all_boxes=all_boxes,
                layout_chain=layout_chain,
            )
        )

    if end < total:
        lines.append("")
        lines.append(
            f"[Showing shapes {offset + 1}-{end} of {total}. "
            f"Use --offset {end} for the next page.]"
        )

    if slide.has_notes_slide:
        notes = (slide.notes_slide.notes_text_frame.text or "").strip()
        if notes:
            lines.append("")
            lines.append("[Notes]")
            for paragraph in notes.split("\n"):
                paragraph = flatten_text(paragraph).strip()
                if paragraph:
                    lines.append(
                        f"  {ellipsize(paragraph, TEXT_PREVIEW_LIMIT)}")
    return "\n".join(lines)


def _layout_part_path(layout) -> Optional[str]:
    """Layout XML path inside the .pptx zip, e.g. 'ppt/slideLayouts/slideLayout3.xml'."""
    partname = getattr(getattr(layout, "part", None), "partname", None)
    if partname is None:
        return None
    return str(partname).lstrip("/")


def print_layouts(prs: PresentationType, file_path: str) -> str:
    lines = [f"[Masters: {len(prs.slide_masters)}]"]
    try:
        zf: Optional[zipfile.ZipFile] = zipfile.ZipFile(file_path)
    except (zipfile.BadZipFile, OSError):
        zf = None
    try:
        for mi, master in enumerate(prs.slide_masters, start=1):
            master_name = (master.name or "").strip() or f"master{mi}"
            lines.append("")
            lines.append(
                f"# Master {mi}: {master_name}  layouts: {
                    len(master.slide_layouts)}"
            )
            for layout in master.slide_layouts:
                placeholders = list(layout.placeholders)
                lines.append(
                    f"- {pad(layout.name or '?', 28)
                         } placeholders: {len(placeholders)}"
                )

                layout_path = _layout_part_path(layout)
                layout_xml = master_xml = theme_xml = None
                clr_map: Dict[str, str] = {}
                theme_colors: Dict[str, str] = {}
                if zf is not None and layout_path:
                    (
                        layout_xml,
                        master_xml,
                        theme_xml,
                        clr_map,
                        theme_colors,
                    ) = _read_layout_chain(zf, layout_path)

                for ph in placeholders:
                    ph_name = placeholder_type(ph) or "unknown"
                    pf = ph.placeholder_format
                    idx = pf.idx if pf else None
                    idx_str = str(idx) if idx is not None else "?"
                    box = format_box(ph)
                    head = f"    [{idx_str}] {pad(ph_name, 14)} {pad(box, 24)}"
                    if layout_xml is not None:
                        defaults = resolve_placeholder_defaults(
                            layout_xml,
                            master_xml,
                            theme_xml,
                            clr_map,
                            theme_colors,
                            ph_idx=idx,
                            ph_type=ph_name,
                        )
                        defaults_str = format_placeholder_defaults(defaults)
                        if defaults_str:
                            head = f"{head}  {defaults_str}"
                    lines.append(head.rstrip())
    finally:
        if zf is not None:
            zf.close()
    return "\n".join(lines)


# Text that looks like un-filled template scaffolding: bracketed/angled
# prompts, lorem/placeholder fillers. Repeated-across-slides copy (e.g.
# "Subject title", "Summary") is detected separately in print_text.
_LEFTOVER_RE = re.compile(
    r"^[\[<].*[\]>]$|lorem ipsum|^x{3,}$|click to add|<[^>]+>", re.IGNORECASE
)


def _is_leftover_suspect(text: str) -> bool:
    t = text.strip()
    return bool(t) and bool(_LEFTOVER_RE.search(t))


def print_text(prs: PresentationType) -> str:
    # Pass 1: find distinctive copy repeated across the deck — template
    # scaffolding the author forgot to replace ("Subject title", "Summary",
    # "Title of the slide"). Count total occurrences (catches repeats within a
    # single slide too); require length >= 8 so content words ("Dust") don't trip.
    repeat_counts: Dict[str, int] = {}
    for slide in prs.slides:
        for shape in slide.shapes:
            for raw in _shape_text_iter(shape):
                t = flatten_text(raw).strip()
                if len(t) >= 8:
                    repeat_counts[t] = repeat_counts.get(t, 0) + 1
    repeated = sorted(
        (t for t, c in repeat_counts.items() if c >= 3),
        key=lambda t: -repeat_counts[t],
    )

    blocks: List[str] = []
    total_chars = 0
    for idx, slide in enumerate(prs.slides, start=1):
        slide_lines: List[str] = []
        for shape in slide.shapes:
            slide_lines.extend(_collect_text(shape))
        if slide.has_notes_slide:
            notes = flatten_text(
                slide.notes_slide.notes_text_frame.text or ""
            ).strip()
            if notes:
                slide_lines.append(
                    f"  [notes] {ellipsize(notes, TEXT_PREVIEW_LIMIT)}")
        if slide_lines:
            title = slide_title(slide)
            header = f"# Slide {idx} (words:{slide_word_count(slide)})"
            if title:
                header += f': "{ellipsize(title, 60)}"'
            blocks.append(header)
            blocks.extend(slide_lines)
            blocks.append("")
            total_chars += sum(len(line) for line in slide_lines)
    if not blocks:
        return "[No text in deck]"
    if blocks and blocks[-1] == "":
        blocks.pop()
    head = f"[Text: {total_chars} chars across {len(prs.slides)} slides | " \
           "each line is tagged with its shape #id — match against --render box " \
           "labels for readback]"
    if repeated:
        shown = ", ".join(
            f'"{ellipsize(t, 30)}" x{repeat_counts[t]}' for t in repeated[:6]
        )
        head += f"\n[i] copy repeated 3+ times: {shown}"
    return head + "\n\n" + "\n".join(blocks)


def _collect_text(shape: BaseShape, indent: str = "  ") -> List[str]:
    lines: List[str] = []
    kind = shape_kind(shape)
    if kind == "group":
        for inner in shape.shapes:
            lines.extend(_collect_text(inner, indent))
        return lines
    sid = shape.shape_id
    if kind == "table":
        _, cell_lines = table_summary(shape)
        lines.extend(f"{indent}#{sid} {cl.strip()}" for cl in cell_lines)
        return lines
    if shape.has_text_frame:
        for paragraph in shape.text_frame.paragraphs:
            text = flatten_text(paragraph.text or "").strip()
            if not text:
                continue
            level = paragraph.level or 0
            mark = " [leftover?]" if _is_leftover_suspect(text) else ""
            lines.append(
                f"{indent}#{sid} p{level}: "
                f"{ellipsize(text, TEXT_PREVIEW_LIMIT)}{mark}"
            )
    return lines


def _package_names(path: str, prefix: str) -> Optional[set]:
    """Set of zip entry names under `prefix` (skipping directory entries),
    or None if the file isn't a readable package."""
    try:
        zf = zipfile.ZipFile(path)
    except (zipfile.BadZipFile, OSError):
        return None
    with zf:
        return {
            name
            for name in zf.namelist()
            if name.startswith(prefix) and not name.endswith("/")
        }


def _count_slides(path: str) -> int:
    names = _package_names(path, "ppt/slides/slide") or set()
    return sum(
        1 for name in names if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)
    )


# ---------------------------------------------------------------------------
# Template-fidelity audit (--compare).
#
# `--compare` is the authoritative structural QA gate. Beyond "did you drop
# media/fonts" it answers "does this deck still respect the template, or did
# you rebuild it as a wall of text on the template's background?" — the single
# most common way template edits go wrong. Each threshold is tuned to flag the
# rebuilt-as-text failure mode while leaving a faithful reskin alone.
# ---------------------------------------------------------------------------

# Template counts as image-rich above this fraction of slides carrying imagery.
IMAGERY_RICH_TEMPLATE = 0.34
# Flag when the output keeps less than this fraction of the template's per-slide
# imagery rate (catches "stripped every picture", output rate 0).
IMAGERY_STRIP_RATIO = 0.5
# A "bare" slide has no imagery and no placeholders — content hand-drawn on an
# empty canvas. Flag when bare slides exceed this fraction of the output...
BARE_RATE = 0.34
# ...and exceed the template's own bare-slide rate by this margin, so a template
# that itself ships bare (shape-built) slides doesn't fail a faithful deck.
BARE_MARGIN = 0.25
# Per-slide content checks (imagery, bare-canvas) are skipped for tiny extracts:
# a deck reduced to this many slides or fewer is a deliberate excerpt, not a
# rebuild, and should not be judged for dropping the template's imagery.
MIN_SLIDES_FOR_CONTENT_AUDIT = 2
# Flag slides whose word count exceeds the template's max by more than this
# factor (a little headroom so a slide a few words over isn't nagged).
DENSITY_TOLERANCE = 1.15
# Shape retention vs the cloned exemplar. Trimming surplus elements is expected
# (legitimate clean-room decks bottom out around 0.79 kept), so the advisory
# only fires well below that: a slide kept < this fraction AND dropped at least
# SHAPE_DROP_MIN shapes has been gutted rather than adapted. Advisory, not a
# blocker — heavy adaptation is sometimes the right call.
SHAPE_RETENTION_FLOOR = 0.6
SHAPE_DROP_MIN = 2


def _imagery_in_shape(shape: BaseShape) -> int:
    """Count pictures, charts, tables, and any image-bearing shape (a picture
    placeholder or picture-filled auto shape), recursing into groups."""
    kind = shape_kind(shape)
    if kind == "group":
        return sum(_imagery_in_shape(inner) for inner in shape.shapes)
    if kind in ("pic", "chart", "table"):
        return 1
    if _has_embedded_blip(getattr(shape, "_element", None)):
        return 1
    return 0


def _slide_bg_has_image(slide: Slide) -> bool:
    """True if the slide sets its own picture background — a full-bleed image
    that reads as imagery but is not a shape."""
    bg = slide._element.cSld.find(P_BG)
    return _has_embedded_blip(bg) if bg is not None else False


class DeckFidelity(NamedTuple):
    total: int  # slides in the slide list (what renders), not orphaned parts
    imagery_slides: int
    imagery_objs: int
    bare_slides: int
    layout_counts: Dict[str, int]
    word_counts: List[int]


def _deck_fidelity(prs: PresentationType) -> DeckFidelity:
    """Per-deck structure used by the audit. python-pptx walks only the slide
    list, so orphaned slide parts are correctly excluded here."""
    layout_counts: Dict[str, int] = {}
    word_counts: List[int] = []
    imagery_slides = 0
    imagery_objs = 0
    bare_slides = 0
    for slide in prs.slides:
        name = slide.slide_layout.name or "?"
        layout_counts[name] = layout_counts.get(name, 0) + 1
        n = sum(_imagery_in_shape(s) for s in slide.shapes)
        imagery_objs += n
        has_imagery = n > 0 or _slide_bg_has_image(slide)
        if has_imagery:
            imagery_slides += 1
        has_placeholder = any(
            getattr(s, "is_placeholder", False) for s in slide.shapes
        )
        if not has_imagery and not has_placeholder:
            bare_slides += 1
        word_counts.append(slide_word_count(slide))
    return DeckFidelity(
        total=len(prs.slides),
        imagery_slides=imagery_slides,
        imagery_objs=imagery_objs,
        bare_slides=bare_slides,
        layout_counts=layout_counts,
        word_counts=word_counts,
    )


def _listed_slide_count(path: str) -> Optional[int]:
    """Slides referenced by presentation.xml's <p:sldIdLst> — what actually
    renders — read without python-pptx, so the orphan check still works when a
    deck fails to parse."""
    try:
        zf = zipfile.ZipFile(path)
    except (zipfile.BadZipFile, OSError):
        return None
    with zf:
        try:
            pres = zf.read("ppt/presentation.xml").decode("utf-8", "ignore")
        except KeyError:
            return None
    m = re.search(r"<[\w]*:?sldIdLst[\s>](.*?)</[\w]*:?sldIdLst>", pres, re.S)
    if not m:
        return None
    return len(re.findall(r"<[\w]*:?sldId[\s>/]", m.group(1)))


def _deck_structural_tally(path: str) -> Optional[Dict[str, int]]:
    """Roll up per-slide structural issues across the deck: stacked boxes,
    distorted images, and shapes off the slide. Informational at the deck level
    (some may be inherited from the template), so the agent knows to look — the
    per-slide --slide view is where each is judged and fixed."""
    try:
        prs = Presentation(path)
    except Exception:  # noqa: BLE001
        return None
    sw, sh = prs.slide_width or 0, prs.slide_height or 0
    stacked = distorted = off_slide = 0
    for slide in prs.slides:
        shapes = [
            s for s in slide.shapes
            if None not in (s.left, s.top, s.width, s.height)
        ]
        for i, a in enumerate(shapes):
            if sw and sh and (
                a.left < -EDGE_EPSILON_EMU or a.top < -EDGE_EPSILON_EMU
                or a.left + a.width > sw + EDGE_EPSILON_EMU
                or a.top + a.height > sh + EDGE_EPSILON_EMU
            ):
                off_slide += 1
            if any("distorted" in m for m in _image_markers(a)):
                distorted += 1
            for b in shapes[i + 1:]:
                kind, _, _ = _classify_overlap(
                    (a.left, a.top, a.width, a.height),
                    (b.left, b.top, b.width, b.height),
                )
                if kind == "stacked":
                    stacked += 1
    return {"stacked": stacked, "distorted": distorted, "off_slide": off_slide}


def _content_slot_indices(shape: BaseShape) -> set:
    """Indices of the non-empty paragraphs in a text frame — the slots that
    actually carry content (vs the empty spacer paragraphs between them)."""
    if not shape.has_text_frame:
        return set()
    return {
        i
        for i, p in enumerate(shape.text_frame.paragraphs)
        if flatten_text(p.text or "").strip()
    }


def _filled_spacer_slots(out_shape: BaseShape, src_shape: BaseShape) -> set:
    """Paragraph slots the output filled that are INTERIOR spacers in the
    template — empty in the template and sitting between its content slots.
    Writing here is the wrong-slot fill that breaks color (a new run inherits a
    darker default) and strands the markers pinned to the content rows. Returns
    empty unless the template box has a real skeleton (>=2 content slots), so a
    plain placeholder or a box filled with fewer items than the template never
    trips it."""
    src_content = _content_slot_indices(src_shape)
    if len(src_content) < 2:
        return set()
    lo, hi = min(src_content), max(src_content)
    return {
        i
        for i in _content_slot_indices(out_shape)
        if i not in src_content and lo < i < hi
    }


def _slot_audit(
    file_path: str, source_path: str
) -> List[Tuple[int, int, set, set]]:
    """Per-slide, per-shape content-slot comparison against the template. Each
    output slide is matched to the template slide it was cloned from by shape-id
    overlap (ids survive cloning); shared text boxes are then checked for fills
    that landed in the template's spacer paragraphs. Returns
    (slide_no, shape_id, filled_spacers, template_content_slots)."""
    try:
        out_prs = Presentation(file_path)
        src_prs = Presentation(source_path)
    except Exception:  # noqa: BLE001 - degrade visibly in the caller
        return []
    src_slides = [
        ({sh.shape_id for sh in s.shapes},
         {sh.shape_id: sh for sh in s.shapes if sh.has_text_frame})
        for s in src_prs.slides
    ]
    findings: List[Tuple[int, int, set, set]] = []
    for out_no, out_slide in enumerate(out_prs.slides, start=1):
        out_ids = {sh.shape_id for sh in out_slide.shapes}
        best_map, best_overlap = None, 0
        for ids, text_map in src_slides:
            overlap = len(out_ids & ids)
            if overlap > best_overlap:
                best_overlap, best_map = overlap, text_map
        # <2 shared ids => no template counterpart (e.g. a from-scratch slide);
        # nothing to diff against.
        if best_map is None or best_overlap < 2:
            continue
        for sh in out_slide.shapes:
            src_sh = best_map.get(sh.shape_id) if sh.has_text_frame else None
            if src_sh is None:
                continue
            spacers = _filled_spacer_slots(sh, src_sh)
            if spacers:
                findings.append(
                    (out_no, sh.shape_id, spacers,
                     _content_slot_indices(src_sh))
                )
    return findings


def _drop_audit(
    file_path: str, source_path: str
) -> List[Tuple[int, int, int, int]]:
    """Per-slide shape retention vs the exemplar each output slide was cloned
    from (matched by shape-id overlap). Trimming surplus elements is expected;
    dropping most of an exemplar's shapes means the wrong exemplar was chosen.
    Returns (slide_no, src_slide_no, kept, dropped) for slides that dropped
    >= SHAPE_DROP_MIN shapes AND kept < SHAPE_RETENTION_FLOOR of the exemplar."""
    try:
        out_prs = Presentation(file_path)
        src_prs = Presentation(source_path)
    except Exception:  # noqa: BLE001 - degrade visibly in the caller
        return []
    src_slides = [{sh.shape_id for sh in s.shapes} for s in src_prs.slides]
    findings: List[Tuple[int, int, int, int]] = []
    for out_no, out_slide in enumerate(out_prs.slides, start=1):
        out_ids = {sh.shape_id for sh in out_slide.shapes}
        best_i, best_overlap = None, 0
        for i, ids in enumerate(src_slides):
            overlap = len(out_ids & ids)
            if overlap > best_overlap:
                best_overlap, best_i = overlap, i
        if best_i is None or best_overlap < 2:
            continue
        src_ids = src_slides[best_i]
        kept = len(out_ids & src_ids)
        dropped = len(src_ids - out_ids)
        if dropped >= SHAPE_DROP_MIN and kept / len(src_ids) < SHAPE_RETENTION_FLOOR:
            findings.append((out_no, best_i + 1, kept, dropped))
    return findings


def print_compare(file_path: str, source_path: str) -> str:
    """Compare the edited deck (file_path) against its source/template
    (source_path) and gate the result. Surfaces the regressions that mean the
    deck no longer respects the template: orphaned slide parts (hand-deleted
    instead of via pptx_slides), embedded media or fonts dropped, the template's
    imagery stripped, slides collapsed onto one catch-all layout, or density
    blown past the template's ceiling. Ends with a [QA: PASS/FAIL] verdict —
    do not deliver until it reads PASS."""
    out_media = _package_names(file_path, "ppt/media/")
    src_media = _package_names(source_path, "ppt/media/")
    out_fonts = _package_names(file_path, "ppt/fonts/")
    src_fonts = _package_names(source_path, "ppt/fonts/")
    if None in (out_media, src_media, out_fonts, src_fonts):
        return "[Compare: could not read one of the files as a .pptx package]"

    def delta(out_n: int, src_n: int) -> str:
        d = out_n - src_n
        return f"{d:+d}" if d else "0"

    blockers = 0

    # Parse each deck independently so one failing to parse doesn't silently
    # blind the whole audit. python-pptx reads only the slide list; the zip may
    # hold more parts.
    def _fid(path: str) -> Optional[DeckFidelity]:
        try:
            return _deck_fidelity(Presentation(path))
        except Exception:  # noqa: BLE001 - degrade visibly rather than crash
            return None

    out_fid = _fid(file_path)
    src_fid = _fid(source_path)

    out_zip = _count_slides(file_path)
    src_zip = _count_slides(source_path)
    out_listed = out_fid.total if out_fid else (_listed_slide_count(file_path) or out_zip)
    src_listed = src_fid.total if src_fid else (_listed_slide_count(source_path) or src_zip)

    lines = [
        f"[Compare: {os.path.basename(file_path)}  vs source "
        f"{os.path.basename(source_path)}]",
        f"  slides:  {pad(str(out_listed), 4)} (source {src_listed})  "
        f"{delta(out_listed, src_listed)}",
    ]

    # Orphaned slide parts: in the package but not in the slide list. This is
    # the signature of deleting slides by hand (removing sldIds) instead of
    # `pptx_slides --delete`, which would drop the parts and their media too.
    orphans = out_zip - out_listed
    if orphans > 0:
        blockers += 1
        lines.append(
            f"  orphans: [!] {orphans} slide part(s) in the package but not in the "
            "slide list (orphaned)"
        )

    # A deck we cannot parse cannot be audited — say so loudly and block, so a
    # parse failure can never masquerade as a clean PASS.
    if out_fid is None or src_fid is None:
        blockers += 1
        which = "the edited deck" if out_fid is None else "the template"
        lines.append(
            f"  audit:   [!] degraded — could not parse {which} with python-pptx; "
            "imagery / bare-canvas / density not checked"
        )

    dropped_media = sorted(src_media - out_media)
    lines.append(
        f"  media:   {pad(str(len(out_media)), 4)} (source "
        f"{len(src_media)})  {delta(len(out_media), len(src_media))}"
    )
    if dropped_media:
        lines.append(
            f"    {len(dropped_media)} media in source not in output:"
        )
        for name in dropped_media:
            lines.append(f"      - {name[len('ppt/media/'):]}")

    dropped_fonts = sorted(src_fonts - out_fonts)
    lines.append(
        f"  fonts:   {pad(str(len(out_fonts)), 4)} (source "
        f"{len(src_fonts)})  {delta(len(out_fonts), len(src_fonts))}"
    )
    if dropped_fonts:
        blockers += 1
        lines.append(
            f"    [!] {len(dropped_fonts)} embedded font part(s) in source not in "
            "output:"
        )
        for name in dropped_fonts:
            lines.append(f"      - {name[len('ppt/fonts/'):]}")

    if out_fid and src_fid and out_fid.total and src_fid.total:
        audit_content = out_fid.total > MIN_SLIDES_FOR_CONTENT_AUDIT

        # Imagery: did the rendered slides keep the template's pictures/charts/
        # tables, or get rebuilt as text on the background?
        src_rate = src_fid.imagery_slides / src_fid.total
        out_rate = out_fid.imagery_slides / out_fid.total
        lines.append(
            f"  imagery: pics/charts/tables on {out_fid.imagery_slides}/"
            f"{out_fid.total} slides ({out_fid.imagery_objs} objects; template "
            f"{src_fid.imagery_slides}/{src_fid.total})"
        )
        if audit_content and src_rate >= IMAGERY_RICH_TEMPLATE and out_rate < src_rate * IMAGERY_STRIP_RATIO:
            blockers += 1
            lines.append(
                f"    [!] imagery below template — {out_fid.imagery_slides}/"
                f"{out_fid.total} output slides carry images vs "
                f"{src_fid.imagery_slides}/{src_fid.total} in the template"
            )

        # Bare canvas: slides hand-drawn with no template placeholders and no
        # imagery — the signature of rebuilding on a blank layout. Judged
        # relative to the template, since some templates ship shape-built slides.
        out_bare = out_fid.bare_slides / out_fid.total
        src_bare = src_fid.bare_slides / src_fid.total
        lines.append(
            f"  layouts: {len(out_fid.layout_counts)} used; "
            f"{out_fid.bare_slides}/{out_fid.total} slides on an empty canvas "
            f"(template {src_fid.bare_slides}/{src_fid.total})"
        )
        if audit_content and out_bare >= BARE_RATE and out_bare > src_bare + BARE_MARGIN:
            blockers += 1
            lines.append(
                f"    [!] {out_fid.bare_slides}/{out_fid.total} slides have no "
                f"placeholders and no imagery (template {src_fid.bare_slides}/"
                f"{src_fid.total})"
            )

        # Density: the template's max words/slide is a hard ceiling.
        if out_fid.word_counts and src_fid.word_counts:
            ceiling = max(src_fid.word_counts)
            out_max = max(out_fid.word_counts)
            over = [
                (i + 1, w)
                for i, w in enumerate(out_fid.word_counts)
                if w > ceiling * DENSITY_TOLERANCE
            ]
            lines.append(
                f"  density: max {out_max} words/slide "
                f"(template ceiling {ceiling})"
            )
            if over:
                blockers += 1
                listing = ", ".join(f"{i}({w})" for i, w in over)
                lines.append(
                    f"    [!] {len(over)} slide(s) over template ceiling of "
                    f"{ceiling} words: {listing}"
                )

        # Per-slide structural issues, rolled up (informational — some may be
        # inherited from the template; the per-slide view judges each).
        tally = _deck_structural_tally(file_path)
        if tally:
            total = tally["stacked"] + tally["distorted"] + tally["off_slide"]
            lines.append(
                f"  shapes:  {total} structural issue(s) across slides — "
                f"stacked:{tally['stacked']} distorted-img:{tally['distorted']} "
                f"off-slide:{tally['off_slide']}"
            )

    # Content-slot fidelity: text written into the template's interior spacer
    # paragraphs (the wrong-slot fill). Deterministic from the paragraph
    # skeletons — no estimation — so it gates as a blocker.
    slot_findings = _slot_audit(file_path, source_path)
    if slot_findings:
        lines.append(
            f"  slots:   [!] {len(slot_findings)} text box(es) filled the "
            "template's spacer paragraphs"
        )
        for slide_no, sid, spacers, content in slot_findings:
            blockers += 1
            filled = ", ".join(f"p[{i}]" for i in sorted(spacers))
            slots = ", ".join(f"p[{i}]" for i in sorted(content))
            lines.append(
                f"    [!] slide {slide_no} #{sid}: filled spacer {filled}; "
                f"template content slots {slots}"
            )

    # Shape retention: a cloned slide that dropped most of its exemplar's shapes
    # has been gutted rather than adapted. Advisory ([i]), not a blocker —
    # trimming surplus is expected and heavy adaptation is sometimes right.
    drops = _drop_audit(file_path, source_path)
    if drops:
        lines.append(
            f"  reuse:   [i] {len(drops)} slide(s) kept "
            f"<{int(SHAPE_RETENTION_FLOOR * 100)}% of their exemplar's shapes"
        )
        for out_no, src_no, kept, dropped in drops:
            lines.append(
                f"    [i] slide {out_no} (from template slide {src_no}): "
                f"kept {kept}, dropped {dropped} exemplar shape(s)"
            )

    lines.append("")
    if blockers:
        lines.append(
            f"[QA: FAIL — {blockers} blocker{'s' if blockers != 1 else ''} "
            "([!] above)]"
        )
    else:
        lines.append("[QA: PASS]")

    return "\n".join(lines)


def print_media(path: str) -> str:
    try:
        zf = zipfile.ZipFile(path)
    except zipfile.BadZipFile:
        return "[Not a valid zip / .pptx package]"
    media_entries: List[Tuple[str, int]] = []
    with zf:
        for info in zf.infolist():
            if info.filename.startswith("ppt/media/"):
                media_entries.append((info.filename, info.file_size))
    if not media_entries:
        return "[No embedded media]"
    media_entries.sort()
    lines = [f"[Media: {len(media_entries)}]"]
    for name, size in media_entries:
        short = name[len("ppt/media/"):]
        lines.append(f"- {pad(short, 32)} {format_size(size)}")
    return "\n".join(lines)


# Distinct, high-contrast outline colors for the --boxes overlay (legible on
# both light and dark slide backgrounds).
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


def print_render(
    file_path: str,
    prs: PresentationType,
    slide_idx: Optional[int],
    boxes: bool = True,
) -> str:
    total_slides = len(prs.slides)
    if slide_idx is not None and (slide_idx < 1 or slide_idx > total_slides):
        raise ValueError(
            f"slide index out of range: {slide_idx} "
            f"(deck has {total_slides} slides)"
        )

    out_dir, rendered = render.render_via_soffice(
        file_path,
        out_root=Path("/tmp/pptx_render"),
        item_name="slide",
        item_idx=slide_idx,
    )

    digest: List[str] = []  # per-slide quantitative findings (idx, text)
    if boxes:
        annotated: List[Path] = []
        for p in rendered:
            m = re.search(r"-(\d+)\.", p.name)
            idx = int(m.group(1)) if m else None
            res = None
            if idx is not None and 1 <= idx <= total_slides:
                res = _annotate_boxes(
                    p, prs.slides[idx - 1],
                    prs.slide_width or 0, prs.slide_height or 0,
                )
            if res:
                ap, findings = res
                annotated.append(ap)
                markers = [
                    f"#{sid} nearest text row {off:.2f}in"
                    for sid, off in findings.get("markers", [])
                ]
                ov = [
                    f"#{a}~#{b} {pen:.2f}in"
                    for a, b, pen in findings["overlaps"]
                ]
                parts = []
                if markers:
                    parts.append("unaligned markers: " + ", ".join(markers))
                if ov:
                    parts.append("overlaps: " + ", ".join(ov))
                if parts:
                    digest.append(f"  slide {idx}: " + "; ".join(parts))
            else:
                annotated.append(p)
        rendered = annotated

    plural = "" if len(rendered) == 1 else "s"
    kind = "jpeg + bbox overlay" if boxes else "jpeg @ 100 dpi"
    lines = [f"[Rendered: {len(rendered)} slide{plural} | {kind} | {out_dir}]"]
    if boxes:
        lines.append(
            "[Boxes: each rectangle is a shape's bounding box, labeled '#id' "
            "just outside it. A red wash marks peer-overlap regions; an "
            "unaligned-markers note means a decorative run (checkmarks/icons) "
            "has no text row beside it. Read each slide image directly.]"
        )
        if digest:
            lines.append("[Pixel metrics:]")
            lines.extend(digest)
    for p in rendered:
        lines.append(str(p))
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="pptx_inspect",
        usage=USAGE,
        add_help=False,
    )
    parser.add_argument("file", nargs="?")
    parser.add_argument("--slide", type=int)
    parser.add_argument("--layouts", action="store_true")
    parser.add_argument("--text", action="store_true")
    parser.add_argument("--media", action="store_true")
    parser.add_argument("--render", action="store_true")
    # Boxes are ON by default for --render (the overlay is the core QA signal);
    # --boxes is kept for back-compat, --no-boxes opts out to a clean render.
    parser.add_argument("--boxes", action="store_true")
    parser.add_argument("--no-boxes", action="store_true", dest="no_boxes")
    parser.add_argument("--compare")
    parser.add_argument("--max-shapes", type=int, default=DEFAULT_MAX_SHAPES)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--help", "-h", action="store_true", dest="help_flag")

    args = parser.parse_args()

    if args.help_flag:
        sys.stdout.write(HELP_TEXT + "\n")
        return 0

    if not args.file:
        sys.stderr.write(f"Error: file is required\nUsage: {USAGE}\n")
        return 1

    if not os.path.isfile(args.file):
        sys.stderr.write(f"Error: file not found: {args.file}\n")
        return 1

    if args.max_shapes < 1:
        sys.stderr.write("Error: --max-shapes must be >= 1\n")
        return 1
    if args.offset < 0:
        sys.stderr.write("Error: --offset must be >= 0\n")
        return 1
    if args.compare is not None and not os.path.isfile(args.compare):
        sys.stderr.write(f"Error: --compare file not found: {args.compare}\n")
        return 1

    file_header = (
        f"[File: {os.path.basename(args.file)} | "
        f"{format_size(os.path.getsize(args.file))}]"
    )

    if args.media:
        body = print_media(args.file)
    elif args.compare is not None:
        body = print_compare(args.file, args.compare)
    else:
        prs = Presentation(args.file)
        if args.render:
            body = print_render(
                args.file, prs, args.slide, boxes=not args.no_boxes
            )
        elif args.layouts:
            body = print_layouts(prs, args.file)
        elif args.text:
            body = print_text(prs)
        elif args.slide is not None:
            body = print_slide(
                prs, args.file, args.slide, args.offset, args.max_shapes
            )
        else:
            body = print_overview(prs, args.file)

    full = file_header + "\n" + body
    text, truncated = safe_output(full)
    sys.stdout.write(text)
    sys.stdout.write("\n")
    if truncated:
        sys.stdout.write(
            "[Output truncated; narrow with --slide or paginate with "
            "--offset / --max-shapes]\n"
        )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, KeyError) as exc:
        sys.stderr.write(f"Error: {exc}\n")
        sys.exit(1)
    except Exception as exc:
        sys.stderr.write(f"Error: {type(exc).__name__}: {exc}\n")
        sys.exit(1)

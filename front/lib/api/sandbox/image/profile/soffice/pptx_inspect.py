#!/opt/venv/bin/python3
"""pptx_inspect — paginated structural inspection of .pptx decks.

Backed by python-pptx for slide/shape/placeholder/text traversal; the
shared `ooxml` helpers and stdlib `zipfile` are used for chart titles
and embedded media listing where python-pptx is awkward or silent.
"""

from __future__ import annotations

import argparse
import os
import sys
import zipfile
from pathlib import Path
from typing import Dict, Iterable, List, NamedTuple, Optional, Tuple

import ooxml
import render
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE
from pptx.presentation import Presentation as PresentationType
from pptx.shapes.base import BaseShape
from pptx.slide import Slide
from utils import (
    TEXT_PREVIEW_LIMIT,
    ellipsize,
    format_size,
    pad,
    safe_output,
)

A_NS = ooxml.NS["a"]
P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
THEME_NS = {"a": A_NS, "p": P_NS}

DEFAULT_MAX_SHAPES = 200
EMU_PER_INCH = 914_400
EDGE_EPSILON_EMU = 45_720  # 0.05" tolerance before flagging edge overflow.

# Glyphs commonly typed as manual bullets at the start of a paragraph. When
# they appear inside a placeholder whose layout already renders a bullet,
# the result is a doubled marker ("● • text"); see the bullet-glyph lint.
BULLET_PREFIXES = ("•", "·", "*", "-", "–")


class SlideContext(NamedTuple):
    width_emu: int
    height_emu: int

USAGE = (
    "pptx_inspect <file> [--slide N] [--layouts] [--text] [--media] "
    "[--render] [--max-shapes N] [--offset N]"
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
    "                    size, text, formatting, placeholder type.\n"
    "  --layouts         List slide masters and their layouts with placeholder slots,\n"
    "                    including each placeholder's resolved default typeface,\n"
    "                    size, weight, color, and alignment (from layout / master /\n"
    "                    theme inheritance).\n"
    "  --text            Extract readable text per slide (preserves slide/shape boundaries).\n"
    "  --media           List embedded media (images, audio, video) with file sizes.\n"
    "  --render          Rasterize slides to JPEG (100 dpi) via LibreOffice + pdftoppm.\n"
    "                    Outputs to /tmp/pptx_render/<deck>/slide-NNN.jpg and prints\n"
    "                    one absolute path per slide. Combine with --slide N to\n"
    "                    render just one slide for fast post-fix re-checks.\n"
    "  --max-shapes N    Maximum shapes to print in slide view (default 200).\n"
    "  --offset N        Skip first N shapes in slide view (default 0).\n"
    "\n"
    "Output (slide view, one shape per line, paragraphs indented):\n"
    "  <id>  <kind>  <left,top inWxinH>  [ph=<type>]  <summary>\n"
    "    p<level>: <text>  [<font hints>]\n"
    "Empty shapes are skipped; long text is ellipsized."
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


def placeholder_type(shape: BaseShape) -> Optional[str]:
    if not getattr(shape, "is_placeholder", False):
        return None
    # `placeholder_format` raises ValueError on non-placeholder shapes,
    # which we already filtered out above.
    pf = shape.placeholder_format
    t = getattr(pf, "type", None)
    if t is None:
        return None
    name = getattr(t, "name", None)
    return name.lower() if name else None


def font_argb(run) -> Optional[str]:
    font = getattr(run, "font", None)
    if font is None:
        return None
    color = getattr(font, "color", None)
    if color is None:
        return None
    # color.rgb raises AttributeError when the color is theme-based
    # rather than explicit RGB; we treat both as "not set".
    try:
        rgb = color.rgb
    except (AttributeError, TypeError, ValueError):
        return None
    if rgb is None:
        return None
    return str(rgb).upper()


# ---------------------------------------------------------------------------
# Theme / placeholder default resolution.
#
# python-pptx does not surface the effective typography of an empty layout
# placeholder — that information lives in the layout's <a:lstStyle>, falling
# back to the master's matching placeholder, the master's titleStyle /
# bodyStyle / otherStyle, and finally the theme's major/minor font + color
# scheme. The helpers below walk that chain directly off the zip so we can
# print "this title placeholder defaults to Lexend 28pt bold #F8FAFC".
# ---------------------------------------------------------------------------


def _qp(local: str) -> str:
    return f"{{{P_NS}}}{local}"


def _read_clr_map(master_xml) -> Dict[str, str]:
    """Map placeholder color tokens (bg1, tx1, accent1...) to theme tokens
    (lt1/dk1/accent1...) via the master's <p:clrMap>."""
    if master_xml is None:
        return {}
    clr_map = master_xml.find(_qp("clrMap"))
    if clr_map is None:
        return {}
    return {k: v for k, v in clr_map.attrib.items() if not k.startswith("{")}


def _resolve_scheme_color(
    scheme_token: str,
    clr_map: Dict[str, str],
    theme_colors: Dict[str, str],
) -> Optional[str]:
    target = clr_map.get(scheme_token, scheme_token)
    hex_val = theme_colors.get(target)
    return hex_val or None


def _solid_fill_hex(
    elem,
    clr_map: Dict[str, str],
    theme_colors: Dict[str, str],
) -> Optional[str]:
    """Resolve <a:solidFill> on a defRPr-like element to a 6-hex color."""
    if elem is None:
        return None
    fill = elem.find(ooxml.qa("solidFill"))
    if fill is None:
        return None
    srgb = fill.find(ooxml.qa("srgbClr"))
    if srgb is not None:
        return srgb.attrib.get("val", "").upper() or None
    scheme = fill.find(ooxml.qa("schemeClr"))
    if scheme is not None:
        return _resolve_scheme_color(scheme.attrib.get("val", ""), clr_map, theme_colors)
    return None


def _ph_type_default_kind(ph_type: Optional[str]) -> str:
    """Pick which master *Style block applies when nothing else matches."""
    if ph_type in ("title", "ctrtitle", "ctr_title", "center_title"):
        return "title"
    if ph_type in ("body", "subtitle", "subTitle", "obj"):
        return "body"
    return "other"


def _find_ph_sp(parent, ph_idx: Optional[int], ph_type: Optional[str]):
    """Find a <p:sp> in `parent` whose <p:ph> matches the given idx/type."""
    if parent is None:
        return None
    for sp in parent.iter(_qp("sp")):
        ph = sp.find(f"{_qp('nvSpPr')}/{_qp('nvPr')}/{_qp('ph')}")
        if ph is None:
            continue
        sp_idx_raw = ph.attrib.get("idx")
        sp_idx = int(sp_idx_raw) if sp_idx_raw and sp_idx_raw.isdigit() else 0
        sp_type = (ph.attrib.get("type") or "").lower()
        if ph_idx is not None and sp_idx == ph_idx:
            return sp
        if ph_type and sp_type == ph_type:
            return sp
    return None


def _lvl1_defrpr(sp):
    """Return (lvl1pPr_element, defRPr_element) from the <a:lstStyle> of a
    placeholder shape. Either may be None."""
    if sp is None:
        return None, None
    lst = sp.find(f"{_qp('txBody')}/{ooxml.qa('lstStyle')}")
    if lst is None:
        return None, None
    lvl1 = lst.find(ooxml.qa("lvl1pPr"))
    if lvl1 is None:
        return None, None
    def_rpr = lvl1.find(ooxml.qa("defRPr"))
    return lvl1, def_rpr


def _master_style_defrpr(master_xml, kind: str):
    """Pull <a:lvl1pPr>/<a:defRPr> from <p:titleStyle> / <p:bodyStyle> /
    <p:otherStyle> on the master."""
    if master_xml is None:
        return None, None
    style_name = {
        "title": "titleStyle",
        "body": "bodyStyle",
        "other": "otherStyle",
    }[kind]
    style = master_xml.find(f"{_qp('txStyles')}/{_qp(style_name)}")
    if style is None:
        return None, None
    lvl1 = style.find(ooxml.qa("lvl1pPr"))
    if lvl1 is None:
        return None, None
    def_rpr = lvl1.find(ooxml.qa("defRPr"))
    return lvl1, def_rpr


def resolve_placeholder_defaults(
    layout_xml,
    master_xml,
    theme_xml,
    clr_map: Dict[str, str],
    theme_colors: Dict[str, str],
    ph_idx: Optional[int],
    ph_type: Optional[str],
) -> Dict[str, Optional[str]]:
    """Walk layout placeholder -> master placeholder -> master *Style ->
    theme to compute the effective default typography of a placeholder."""
    kind = _ph_type_default_kind(ph_type)

    chain = []
    chain.append(_lvl1_defrpr(_find_ph_sp(layout_xml, ph_idx, ph_type)))
    chain.append(_lvl1_defrpr(_find_ph_sp(master_xml, ph_idx, ph_type)))
    chain.append(_master_style_defrpr(master_xml, kind))

    typeface: Optional[str] = None
    size_pt: Optional[float] = None
    bold: Optional[bool] = None
    color_hex: Optional[str] = None
    align: Optional[str] = None

    for lvl1, def_rpr in chain:
        if lvl1 is not None and align is None:
            algn = lvl1.attrib.get("algn")
            if algn:
                align = algn
        if def_rpr is None:
            continue
        if typeface is None:
            latin = def_rpr.find(ooxml.qa("latin"))
            if latin is not None:
                typeface = latin.attrib.get("typeface") or None
        if size_pt is None:
            sz = def_rpr.attrib.get("sz")
            if sz and sz.isdigit():
                size_pt = int(sz) / 100.0
        if bold is None:
            b = def_rpr.attrib.get("b")
            if b in ("1", "true"):
                bold = True
            elif b in ("0", "false"):
                bold = False
        if color_hex is None:
            color_hex = _solid_fill_hex(def_rpr, clr_map, theme_colors)

    if typeface is None:
        typeface = ooxml.theme_font(
            theme_xml, "major" if kind == "title" else "minor")

    return {
        "typeface": typeface,
        "size_pt": size_pt,
        "bold": bold,
        "color": color_hex,
        "align": align,
    }


def format_placeholder_defaults(defaults: Dict[str, Optional[str]]) -> str:
    parts: List[str] = []
    if defaults.get("typeface"):
        parts.append(str(defaults["typeface"]))
    size_pt = defaults.get("size_pt")
    if size_pt is not None:
        if float(size_pt).is_integer():
            parts.append(f"{int(size_pt)}pt")
        else:
            parts.append(f"{size_pt:.1f}pt")
    if defaults.get("bold"):
        parts.append("bold")
    color = defaults.get("color")
    if color:
        parts.append(f"#{color}")
    align = defaults.get("align")
    if align:
        parts.append(f"algn={align}")
    return " ".join(parts)


# ---------------------------------------------------------------------------
# Package-level XML access (lazy: most code paths don't need it).
# ---------------------------------------------------------------------------


def _slide_master_rel_target(zf: zipfile.ZipFile, master_path: str, rel_type_tail: str) -> Optional[str]:
    rels = ooxml.parse_rels(zf, ooxml.rels_path_for(master_path))
    if not rels:
        return None
    rels_xml = ooxml.read_xml(zf, ooxml.rels_path_for(master_path))
    if rels_xml is None:
        return None
    for rel in rels_xml.findall("pr:Relationship", ooxml.NS):
        rtype = rel.attrib.get("Type", "")
        if rtype.endswith(rel_type_tail):
            return ooxml.resolve_rel_target(ooxml.rels_path_for(master_path), rel.attrib["Target"])
    return None


def _read_theme_for_master(zf: zipfile.ZipFile, master_path: str):
    theme_path = _slide_master_rel_target(zf, master_path, "/theme")
    if not theme_path:
        return None, None
    return theme_path, ooxml.read_xml(zf, theme_path)


def _layout_master_path(zf: zipfile.ZipFile, layout_path: str) -> Optional[str]:
    return _slide_master_rel_target(zf, layout_path, "/slideMaster")


def _read_layout_chain(
    zf: zipfile.ZipFile, layout_path: str
) -> Tuple[Optional[object], Optional[object], Optional[object], Dict[str, str], Dict[str, str]]:
    layout_xml = ooxml.read_xml(zf, layout_path)
    master_path = _layout_master_path(zf, layout_path)
    master_xml = ooxml.read_xml(zf, master_path) if master_path else None
    theme_xml = None
    if master_path:
        _, theme_xml = _read_theme_for_master(zf, master_path)
    clr_map = _read_clr_map(master_xml)
    theme_colors = ooxml.theme_colors_by_name(theme_xml)
    return layout_xml, master_xml, theme_xml, clr_map, theme_colors


def font_hints(run) -> str:
    font = getattr(run, "font", None)
    if font is None:
        return ""
    parts: List[str] = []
    name = getattr(font, "name", None)
    if name:
        parts.append(name)
    size = getattr(font, "size", None)
    if size is not None:
        parts.append(f"{int(size.pt)}pt")
    if getattr(font, "bold", None):
        parts.append("bold")
    if getattr(font, "italic", None):
        parts.append("italic")
    if getattr(font, "underline", None):
        parts.append("underline")
    argb = font_argb(run)
    if argb and argb not in ("000000", "FF000000"):
        parts.append(f"color:{argb}")
    return ", ".join(parts)


def paragraph_runs_summary(paragraph) -> str:
    """First run's font hints, as a stand-in for paragraph formatting."""
    for run in paragraph.runs:
        hints = font_hints(run)
        if hints:
            return hints
    return ""


def paragraph_alignment(paragraph) -> Optional[str]:
    alignment = getattr(paragraph, "alignment", None)
    if alignment is None:
        return None
    name = getattr(alignment, "name", None)
    return name.lower() if name else None


def text_frame_lines(shape: BaseShape, indent: str = "  ") -> List[str]:
    if not shape.has_text_frame:
        return []
    is_placeholder = placeholder_type(shape) is not None
    lines: List[str] = []
    for paragraph in shape.text_frame.paragraphs:
        text = (paragraph.text or "").strip()
        if not text:
            continue
        level = paragraph.level or 0
        attrs: List[str] = []
        hints = paragraph_runs_summary(paragraph)
        if hints:
            attrs.append(hints)
        algn = paragraph_alignment(paragraph)
        if algn:
            attrs.append(f"algn={algn}")
        if is_placeholder and _starts_with_bullet_glyph(text):
            attrs.append("[!] manual bullet glyph in placeholder — remove")
        line = f"{indent}p{level}: {ellipsize(text, TEXT_PREVIEW_LIMIT)}"
        if attrs:
            line += f"  [{', '.join(attrs)}]"
        lines.append(line)
    return lines


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
            title = (chart.chart_title.text_frame.text or "").strip()
        except (AttributeError, ValueError):
            title = ""
    if not title:
        title = chart_title_via_zip(shape)
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
            text = (cell.text or "").strip().replace("\n", " ")
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
    return (title_shape.text_frame.text or "").strip().replace("\n", " ")


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


def _starts_with_bullet_glyph(text: str) -> bool:
    if len(text) < 2:
        return False
    if text[0] not in BULLET_PREFIXES:
        return False
    return text[1].isspace()


def count_shapes_by_kind(shapes: Iterable[BaseShape]) -> dict:
    counts = {"text": 0, "pic": 0, "chart": 0, "table": 0, "other": 0}
    for shape in shapes:
        if shape.has_chart:
            counts["chart"] += 1
        elif shape.has_table:
            counts["table"] += 1
        elif shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
            counts["pic"] += 1
        elif shape.has_text_frame and (shape.text_frame.text or "").strip():
            counts["text"] += 1
        else:
            counts["other"] += 1
    return counts


def describe_shape(
    shape: BaseShape,
    *,
    ctx: Optional[SlideContext] = None,
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
            sub_lines.extend(describe_shape(inner, ctx=ctx, indent="    "))
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
    for marker in _shape_warning_markers(shape, ph, ctx):
        parts.append(marker)

    head = indent + "  ".join(parts).rstrip()
    return [head] + [indent + line for line in sub_lines]


def _shape_warning_markers(
    shape: BaseShape,
    ph: Optional[str],
    ctx: Optional[SlideContext],
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
                left + width > ctx.width_emu + EDGE_EPSILON_EMU
                or top + height > ctx.height_emu + EDGE_EPSILON_EMU
            ):
                markers.append("[!] extends past slide edge")
    if ph and shape.has_text_frame:
        has_text = any(
            (p.text or "").strip() for p in shape.text_frame.paragraphs
        )
        if not has_text:
            markers.append(
                "[!] EMPTY PLACEHOLDER — will render layout prompt text"
            )
    return markers


def _theme_summary_line(file_path: str) -> Optional[str]:
    """One-line theme summary for the overview: name, major/minor font,
    bg/text/accent colors. Returns None if the package isn't readable."""
    try:
        zf = zipfile.ZipFile(file_path)
    except (zipfile.BadZipFile, OSError):
        return None
    try:
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
            theme_path, theme_xml = _read_theme_for_master(zf, master_path)
            if theme_xml is None:
                return None
            clr_map = _read_clr_map(master_xml)
            theme_colors = ooxml.theme_colors_by_name(theme_xml)
            major = ooxml.theme_font(theme_xml, "major")
            minor = ooxml.theme_font(theme_xml, "minor")
            theme_name = theme_xml.attrib.get("name") or "?"

            def _resolved(token: str) -> str:
                hx = _resolve_scheme_color(token, clr_map, theme_colors)
                return f"#{hx}" if hx else "—"

            accents = " ".join(_resolved(f"accent{i}") for i in range(1, 7))
            parts = [
                f"theme:{theme_name}",
                f"major:{major or '—'}",
                f"minor:{minor or '—'}",
                f"bg1:{_resolved('bg1')}",
                f"tx1:{_resolved('tx1')}",
                f"accents:{accents}",
            ]
            return "[" + " | ".join(parts) + "]"
    except Exception:
        return None


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
    end = min(total, offset + max_shapes)
    for shape in shapes[offset:end]:
        lines.extend(describe_shape(shape, ctx=ctx))

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
                paragraph = paragraph.strip()
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


def print_text(prs: PresentationType) -> str:
    blocks: List[str] = []
    total_chars = 0
    for idx, slide in enumerate(prs.slides, start=1):
        slide_lines: List[str] = []
        for shape in slide.shapes:
            slide_lines.extend(_collect_text(shape))
        if slide.has_notes_slide:
            notes = (slide.notes_slide.notes_text_frame.text or "").strip()
            if notes:
                slide_lines.append(
                    f"  [notes] {ellipsize(notes, TEXT_PREVIEW_LIMIT)}")
        if slide_lines:
            title = slide_title(slide)
            header = f"# Slide {idx}"
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
    return f"[Text: {total_chars} chars across {len(prs.slides)} slides]\n\n" + "\n".join(blocks)


def _collect_text(shape: BaseShape, indent: str = "  ") -> List[str]:
    lines: List[str] = []
    kind = shape_kind(shape)
    if kind == "group":
        for inner in shape.shapes:
            lines.extend(_collect_text(inner, indent))
        return lines
    if kind == "table":
        _, cell_lines = table_summary(shape)
        lines.extend(cell_lines)
        return lines
    if shape.has_text_frame:
        for paragraph in shape.text_frame.paragraphs:
            text = (paragraph.text or "").strip()
            if not text:
                continue
            level = paragraph.level or 0
            lines.append(f"{indent}p{level}: {
                         ellipsize(text, TEXT_PREVIEW_LIMIT)}")
    return lines


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


def print_render(
    file_path: str,
    prs: PresentationType,
    slide_idx: Optional[int],
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
    plural = "" if len(rendered) == 1 else "s"
    lines = [
        f"[Rendered: {len(rendered)} slide{plural} | jpeg @ 100 dpi | {out_dir}]"
    ]
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

    file_header = (
        f"[File: {os.path.basename(args.file)} | "
        f"{format_size(os.path.getsize(args.file))}]"
    )

    if args.media:
        body = print_media(args.file)
    else:
        prs = Presentation(args.file)
        if args.render:
            body = print_render(args.file, prs, args.slide)
        elif args.layouts:
            body = print_layouts(prs, args.file)
        elif args.text:
            body = print_text(prs)
        elif args.slide is not None:
            body = print_slide(prs, args.slide, args.offset, args.max_shapes)
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

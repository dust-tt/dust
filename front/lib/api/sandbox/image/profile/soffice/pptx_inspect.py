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
from typing import Dict, Iterable, List, Optional, Tuple

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
    flatten_text,
    format_size,
    pad,
    safe_output,
)

from pptx_geometry import emu_to_inches, format_box, shape_kind

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

from pptx_render_boxes import _annotate_boxes

from pptx_audit import (
    BARE_MARGIN,
    BARE_RATE,
    CoverRect,
    DENSITY_TOLERANCE,
    DeckFidelity,
    IMAGERY_RICH_TEMPLATE,
    IMAGERY_STRIP_RATIO,
    MIN_SLIDES_FOR_CONTENT_AUDIT,
    SHAPE_RETENTION_FLOOR,
    SlideContext,
    _count_slides,
    _cover_candidates,
    _deck_fidelity,
    _deck_structural_tally,
    _drop_audit,
    _fit_tokens,
    _has_embedded_blip,
    _is_leftover_suspect,
    _listed_slide_count,
    _package_names,
    _shape_text_iter,
    _shape_warning_markers,
    _slot_audit,
    slide_word_count,
)


DEFAULT_MAX_SHAPES = 200


USAGE = (
    "pptx_inspect <file> [--qa N] [--slide N] [--layouts] [--text] [--media] "
    "[--render] [--compare FILE] [--max-shapes N] [--offset N]"
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
    "  --qa N            Per-slide QA — run after EVERY edit to slide N. Prints the\n"
    "                    slide's text (#id-tagged, to read back) AND the boxed\n"
    "                    diagnostic render (slide-NNN-boxes.png; boxes labeled '#id',\n"
    "                    red wash on peer-overlaps, a Pixel-metrics line for marker\n"
    "                    runs with no text row beside them). The boxes live here.\n"
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
    "  --render          Rasterize slide(s) to a plain JPEG (no overlay) for a quick\n"
    "                    visual look; combine with --slide N for one slide. For QA\n"
    "                    use --qa instead — it adds the diagnostic boxes + readback.\n"
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
def print_text(prs: PresentationType, slide_idx: Optional[int] = None) -> str:
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
        if slide_idx is not None and idx != slide_idx:
            continue
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
    scope = (f"slide {slide_idx}" if slide_idx is not None
             else f"{len(prs.slides)} slides")
    head = f"[Text: {total_chars} chars | {scope} | each line is tagged with " \
           "its shape #id — match against the --qa box labels for readback]"
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
def _boxed_render(
    file_path: str, prs: PresentationType, slide_idx: Optional[int]
) -> str:
    """Render slide(s) with the bounding-box overlay + pixel-metrics digest —
    the diagnostic half of QA. Reached via --qa, not exposed on its own."""
    total_slides = len(prs.slides)
    out_dir, rendered = render.render_via_soffice(
        file_path,
        out_root=Path("/tmp/pptx_render"),
        item_name="slide",
        item_idx=slide_idx,
    )
    digest: List[str] = []
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
    plural = "" if len(annotated) == 1 else "s"
    lines = [
        f"[Rendered: {len(annotated)} slide{plural} | jpeg + bbox overlay | "
        f"{out_dir}]",
        "[Boxes: each rectangle is a shape's bounding box, labeled '#id' just "
        "outside it. A red wash marks peer-overlap regions; an unaligned-markers "
        "note means a decorative run (checkmarks/icons) has no text row beside "
        "it. Read each slide image directly.]",
    ]
    if digest:
        lines.append("[Pixel metrics:]")
        lines.extend(digest)
    for p in annotated:
        lines.append(str(p))
    return "\n".join(lines)


def print_render(
    file_path: str, prs: PresentationType, slide_idx: Optional[int]
) -> str:
    """Plain rasterized slide(s) — no overlay — for a quick visual look. The
    boxed diagnostic render is part of --qa, not here."""
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


def print_qa(file_path: str, prs: PresentationType, slide_idx: int) -> str:
    """Per-slide QA gate — run after EVERY edit to a slide. Bundles the slide's
    authoritative text (#id-tagged, to read back) with the boxed diagnostic
    render so they are checked together."""
    total_slides = len(prs.slides)
    if slide_idx < 1 or slide_idx > total_slides:
        raise ValueError(
            f"slide index out of range: {slide_idx} "
            f"(deck has {total_slides} slides)"
        )
    return (
        f"[QA slide {slide_idx} — read each #id's text below back against the "
        "boxed render]\n\n"
        + print_text(prs, slide_idx)
        + "\n\n"
        + _boxed_render(file_path, prs, slide_idx)
    )


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
    parser.add_argument("--qa", type=int)
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
        if args.qa is not None:
            body = print_qa(args.file, prs, args.qa)
        elif args.render:
            body = print_render(args.file, prs, args.slide)
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

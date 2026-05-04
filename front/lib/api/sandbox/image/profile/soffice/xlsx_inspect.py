#!/opt/venv/bin/python3
"""xlsx_inspect — paginated structural inspection of .xlsx workbooks.

Backed by openpyxl (read-only mode, constant memory) for cells, styles,
formulas, and defined names; drawings and merged-cell ranges are pulled
directly from the xlsx zip via stdlib so we don't have to re-load the
workbook in default mode.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import zipfile
from typing import Dict, List, Optional, Tuple
from xml.etree import ElementTree as ET

import ooxml
import openpyxl
from openpyxl.workbook.workbook import Workbook
from openpyxl.worksheet.worksheet import Worksheet

MAX_OUTPUT_BYTES = 48_000
DEFAULT_MAX_ROWS = 1000
VALUE_PREVIEW_LIMIT = 80

EMU_PER_PIXEL = 9525
DEFAULT_COLUMN_PIXELS = 64
DEFAULT_ROW_PIXELS = 20

USAGE = (
    "xlsx_inspect <file> [--sheet NAME] [--range A1:Z50] "
    "[--formulas-only] [--names] [--max-rows N] [--offset N]"
)

HELP_TEXT = (
    "xlsx_inspect - Inspect .xlsx workbook structure\n"
    "\n"
    f"Usage: {USAGE}\n"
    "\n"
    "Arguments:\n"
    "  file              Path to .xlsx workbook (required)\n"
    "\n"
    "Options:\n"
    "  --sheet NAME      Show one sheet's cells (formula + cached value + format).\n"
    "  --range A1:Z50    Limit cells to a range. Requires --sheet.\n"
    "  --formulas-only   List every cell with a formula across every sheet.\n"
    "  --names           List defined names with their ranges.\n"
    "  --max-rows N      Maximum rows to print in sheet view (default 1000).\n"
    "  --offset N        Skip first N rows in sheet view (default 0).\n"
    "\n"
    "Output (sheet view, one cell per line):\n"
    "  <address>  <formula or value>  [cached result]  numFmt: <fmt>  [font: <ARGB>]\n"
    "  Empty cells are skipped. Long strings are ellipsized."
)


def ellipsize(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


def quote_string(value) -> str:
    if not isinstance(value, str):
        value = str(value)
    return '"' + ellipsize(value.replace("\n", "\\n"), VALUE_PREVIEW_LIMIT) + '"'


def format_scalar(value) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return quote_string(value)
    iso = getattr(value, "isoformat", None)
    if callable(iso):
        return iso()[:10]
    return str(value)


def format_size(num_bytes: int) -> str:
    if num_bytes < 1024:
        return f"{num_bytes} B"
    if num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.1f} KB"
    return f"{num_bytes / (1024 * 1024):.1f} MB"


_A = ord("A")


# Convert between Excel column numbers (1-indexed: A=1, Z=26, AA=27)
# and their letter labels.
def col_letter(n: int) -> str:
    s = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(_A + r) + s
    return s


# Convert between Excel column letters to numbers
# this is the reciprocal function of col_letter
def col_number(letters: str) -> int:
    n = 0
    for ch in letters.upper():
        n = n * 26 + (ord(ch) - _A + 1)
    return n


def parse_range(spec: str) -> Tuple[int, int, int, int]:
    m = re.match(r"^([A-Z]+)(\d+):([A-Z]+)(\d+)$", spec, re.IGNORECASE)
    if not m:
        raise ValueError(f'invalid --range: "{spec}" (expected e.g. A1:Z50)')
    sc = col_number(m.group(1))
    sr = int(m.group(2))
    ec = col_number(m.group(3))
    er = int(m.group(4))
    if sc > ec or sr > er:
        raise ValueError(f"invalid --range: {spec} (start must be <= end)")
    return sr, sc, er, ec


def is_default_color(argb: Optional[str]) -> bool:
    if not argb:
        return True
    u = argb.upper()
    return u in ("FF000000", "00000000")


def is_default_numfmt(numfmt: Optional[str]) -> bool:
    return not numfmt or numfmt == "General"


def font_argb(cell) -> Optional[str]:
    font = getattr(cell, "font", None)
    if font is None:
        return None
    color = getattr(font, "color", None)
    if color is None:
        return None
    try:
        if getattr(color, "type", None) == "rgb":
            rgb = getattr(color, "rgb", None)
            if isinstance(rgb, str):
                return rgb
    except Exception:
        return None
    return None


def pad(text: str, width: int) -> str:
    if len(text) >= width:
        return text
    return text + " " * (width - len(text))


def describe_cell(cell, evaluated_value) -> str:
    is_formula = cell.data_type == "f"
    formula_text = cell.value if is_formula else None

    if is_formula:
        if not isinstance(formula_text, str):
            return ""
        main = formula_text if formula_text.startswith("=") else f"={
            formula_text}"
    else:
        if cell.value is None:
            return ""
        main = format_scalar(cell.value)
        if not main:
            return ""

    if is_formula:
        result = format_scalar(evaluated_value) if evaluated_value is not None else ""
    else:
        result = ""

    numfmt = (
        ""
        if is_default_numfmt(cell.number_format)
        else f"numFmt: {cell.number_format}"
    )
    argb = font_argb(cell)
    color = "" if is_default_color(argb) else f"font: {argb.upper()}"

    parts = [pad(cell.coordinate, 6), pad(ellipsize(main, 60), 32)]
    if result:
        parts.append(pad(result, 12))
    elif numfmt or color:
        parts.append(pad("", 12))
    if numfmt:
        parts.append(numfmt)
    if color:
        parts.append(color)
    return "  ".join(parts).rstrip()


# ---------------------------------------------------------------------------
# xlsx-specific drawing & merge extraction.
#
# openpyxl in read_only mode skips xl/drawings/* and doesn't aggregate
# <mergeCells>, so we reach into the zip ourselves via ooxml helpers.
# Constant memory regardless of workbook size.
# ---------------------------------------------------------------------------

# xlsx-only namespaces (shared OOXML namespaces live in ooxml.NS).
_XL_NS = {
    **ooxml.NS,
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
}

_MERGE_TAG = f"{{{_XL_NS['main']}}}mergeCells"
_DRAWING_TAG = f"{{{_XL_NS['main']}}}drawing"
_ROW_TAG = f"{{{_XL_NS['main']}}}row"
_SHEET_DATA_TAG = f"{{{_XL_NS['main']}}}sheetData"


def _two_cell_anchor_range(anchor) -> Optional[str]:
    f = anchor.find("xdr:from", _XL_NS)
    t = anchor.find("xdr:to", _XL_NS)
    if f is None or t is None:
        return None
    sc = int(f.findtext("xdr:col", "0", _XL_NS)) + 1
    sr = int(f.findtext("xdr:row", "0", _XL_NS)) + 1
    ec = int(t.findtext("xdr:col", "0", _XL_NS)) + 1
    er = int(t.findtext("xdr:row", "0", _XL_NS)) + 1
    return f"{col_letter(sc)}{sr}:{col_letter(ec)}{er}"


def _one_cell_anchor_range(anchor) -> Optional[str]:
    f = anchor.find("xdr:from", _XL_NS)
    if f is None:
        return None
    sc = int(f.findtext("xdr:col", "0", _XL_NS)) + 1
    sr = int(f.findtext("xdr:row", "0", _XL_NS)) + 1
    ext = anchor.find("xdr:ext", _XL_NS)
    cx = int(ext.attrib.get("cx", "0")) if ext is not None else 0
    cy = int(ext.attrib.get("cy", "0")) if ext is not None else 0
    col_span = max(1, round(cx / EMU_PER_PIXEL / DEFAULT_COLUMN_PIXELS))
    row_span = max(1, round(cy / EMU_PER_PIXEL / DEFAULT_ROW_PIXELS))
    ec = sc + col_span - 1
    er = sr + row_span - 1
    return f"{col_letter(sc)}{sr}:{col_letter(ec)}{er} (estimate)"


def _classify_anchor(
    zf: zipfile.ZipFile,
    anchor,
    drawing_rels: Dict[str, str],
    range_str: str,
) -> Optional[Tuple[str, str, str]]:
    graphic_frame = anchor.find("xdr:graphicFrame", _XL_NS)
    if graphic_frame is not None:
        chart_ref = graphic_frame.find("a:graphic/a:graphicData/c:chart", _XL_NS)
        title = "Chart"
        if chart_ref is not None:
            chart_rid = chart_ref.attrib.get(ooxml.R_ID_ATTR)
            chart_path = drawing_rels.get(chart_rid) if chart_rid else None
            if chart_path:
                title = ooxml.parse_chart_title(zf, chart_path) or "Chart"
        return ("chart", title, range_str)
    if anchor.find("xdr:pic", _XL_NS) is not None:
        return ("image", "Image", range_str)
    return None


def _parse_drawing(zf: zipfile.ZipFile, drawing_path: str) -> List[Tuple[str, str, str]]:
    tree = ooxml.read_xml(zf, drawing_path)
    if tree is None:
        return []
    drawing_rels = ooxml.parse_rels(zf, ooxml.rels_path_for(drawing_path))

    out: List[Tuple[str, str, str]] = []
    for anchor in tree.findall("xdr:twoCellAnchor", _XL_NS):
        rng = _two_cell_anchor_range(anchor)
        if rng:
            classified = _classify_anchor(zf, anchor, drawing_rels, rng)
            if classified:
                out.append(classified)
    for anchor in tree.findall("xdr:oneCellAnchor", _XL_NS):
        rng = _one_cell_anchor_range(anchor)
        if rng:
            classified = _classify_anchor(zf, anchor, drawing_rels, rng)
            if classified:
                out.append(classified)
    for anchor in tree.findall("xdr:absoluteAnchor", _XL_NS):
        classified = _classify_anchor(
            zf,
            anchor,
            drawing_rels,
            "absolute (floating, may overlap any cell)",
        )
        if classified:
            out.append(classified)
    return out


SheetMeta = Dict[str, Dict[str, object]]


def _stream_sheet_meta(
    zf: zipfile.ZipFile, sheet_path: str
) -> Tuple[bool, Optional[str]]:
    """Stream-parse a sheet XML for merges + drawing rid.

    Sheet XML can be tens of MB on a busy workbook (sheetData dominates).
    `<mergeCells>` and `<drawing>` come after `<sheetData>`, so we
    iterparse and clear each `<row>` as we move past it to keep memory
    bounded.
    """
    merges = False
    drawing_rid: Optional[str] = None
    try:
        f = zf.open(sheet_path)
    except KeyError:
        return merges, drawing_rid
    with f:
        for _, elem in ET.iterparse(f, events=("end",)):
            tag = elem.tag
            if tag == _MERGE_TAG:
                merges = len(elem) > 0
                elem.clear()
            elif tag == _DRAWING_TAG:
                drawing_rid = elem.attrib.get(ooxml.R_ID_ATTR)
                elem.clear()
            elif tag == _ROW_TAG or tag == _SHEET_DATA_TAG:
                elem.clear()
    return merges, drawing_rid


def parse_sheet_graphics(path: str) -> SheetMeta:
    """Map sheet name -> {"merges": bool, "graphics": [(kind, label, range_str)]}.

    Graphics = charts + images anchored to the sheet (from xl/drawings/*).
    """
    result: SheetMeta = {}
    try:
        zf = zipfile.ZipFile(path)
    except zipfile.BadZipFile:
        return result
    with zf:
        wb_xml = ooxml.read_xml(zf, "xl/workbook.xml")
        if wb_xml is None:
            return result
        wb_rels = ooxml.parse_rels(zf, "xl/_rels/workbook.xml.rels")

        for sheet in wb_xml.findall("main:sheets/main:sheet", _XL_NS):
            name = sheet.attrib.get("name")
            rid = sheet.attrib.get(ooxml.R_ID_ATTR)
            if not name or not rid:
                continue
            sheet_path = wb_rels.get(rid)
            if not sheet_path:
                continue

            merges, drawing_rid = _stream_sheet_meta(zf, sheet_path)
            entry: Dict[str, object] = {"merges": merges, "graphics": []}
            if drawing_rid:
                sheet_rels = ooxml.parse_rels(zf, ooxml.rels_path_for(sheet_path))
                drawing_path = sheet_rels.get(drawing_rid)
                if drawing_path:
                    entry["graphics"] = _parse_drawing(zf, drawing_path)
            result[name] = entry
    return result


def sheet_graphics(meta: SheetMeta, sheet_name: str) -> List[Tuple[str, str, str]]:
    entry = meta.get(sheet_name) or {}
    graphics = entry.get("graphics") or []
    return graphics  # type: ignore[return-value]


def sheet_has_merges(meta: SheetMeta, sheet_name: str) -> bool:
    entry = meta.get(sheet_name) or {}
    return bool(entry.get("merges"))


def format_graphics(graphics) -> Optional[str]:
    if not graphics:
        return None
    lines = [f"[Graphics: {len(graphics)}]"]
    for kind, label, range_str in graphics:
        if kind == "chart" and label != "Chart":
            lines.append(f'- chart "{label}" at {range_str}')
        else:
            lines.append(f"- {kind} at {range_str}")
    return "\n".join(lines)


def graphics_summary(graphics) -> str:
    charts = sum(1 for kind, _, _ in graphics if kind == "chart")
    images = sum(1 for kind, _, _ in graphics if kind == "image")
    parts = []
    if charts:
        parts.append(f"charts: {charts}")
    if images:
        parts.append(f"images: {images}")
    return "  " + "  ".join(parts) if parts else ""


def find_sheet(wb: Workbook, name: str) -> Worksheet:
    lower = name.lower()
    for sheet_name in wb.sheetnames:
        if sheet_name.lower() == lower:
            return wb[sheet_name]
    avail = ", ".join(f'"{n}"' for n in wb.sheetnames)
    raise ValueError(f'sheet not found: "{name}". Available: {avail}')


def get_defined_names(wb: Workbook):
    out = []
    dn = getattr(wb, "defined_names", None)
    if dn is None:
        return out
    items = getattr(dn, "items", None)
    if callable(items):
        for name, defn in items():
            value = getattr(defn, "value", None)
            if value is None:
                dests = getattr(defn, "destinations", None)
                if dests:
                    value = ", ".join(f"{s}!{c}" for s, c in dests)
            out.append((name, value or ""))
        return out
    inner = getattr(dn, "definedName", None)
    if inner:
        for defn in inner:
            out.append((getattr(defn, "name", "?"),
                       getattr(defn, "value", "") or ""))
    return out


def print_overview(wb: Workbook, meta: SheetMeta) -> str:
    lines = [f"[Sheets: {len(wb.sheetnames)}]"]
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        rows = ws.max_row or 0
        cols = ws.max_column or 0
        merges = "  merges: yes" if sheet_has_merges(meta, sheet_name) else ""
        graphics = graphics_summary(sheet_graphics(meta, sheet_name))
        state = ""
        if getattr(ws, "sheet_state", "visible") != "visible":
            state = f"  ({ws.sheet_state})"
        lines.append(
            f"- {pad(sheet_name, 24)} {pad(f'{rows}x{cols}', 10)}"
            f"{merges}{graphics}{state}"
        )
    names = get_defined_names(wb)
    if names:
        lines.append("")
        lines.append(f"Defined names: {len(names)}")
        for n, v in names:
            lines.append(f"- {n} = {v}")
    return "\n".join(lines)


def print_names(wb: Workbook) -> str:
    names = get_defined_names(wb)
    if not names:
        return "[No defined names]"
    lines = [f"[Defined names: {len(names)}]"]
    for n, v in names:
        lines.append(f"- {n} = {v}")
    return "\n".join(lines)


def print_sheet(
    ws: Worksheet,
    evaluated_ws: Worksheet,
    graphics: List[Tuple[str, str, str]],
    range_spec: Optional[Tuple[int, int, int, int]],
    offset: int,
    max_rows: int,
) -> str:
    total_rows = ws.max_row or 0
    if range_spec is not None:
        sr, sc, er, ec = range_spec
        effective_start = max(sr, 1 + offset)
        last_row = min(er, effective_start + max_rows - 1)
        range_label = f"{col_letter(sc)}{sr}:{col_letter(ec)}{er}"
    else:
        sc = 1
        ec = ws.max_column or 0
        sr = 1 + offset
        er = total_rows
        effective_start = sr
        last_row = min(er, effective_start + max_rows - 1)
        range_label = f"Rows {effective_start}-{min(er, total_rows)}"

    lines = [f"[Sheet: {ws.title} | {range_label} | {total_rows} rows total]"]

    graphics_block = format_graphics(graphics)
    if graphics_block:
        lines.append(graphics_block)
        lines.append("")

    last_seen_row = effective_start - 1
    ws_iter = ws.iter_rows(
        min_row=effective_start, max_row=last_row,
        min_col=sc, max_col=ec,
    )
    ev_iter = evaluated_ws.iter_rows(
        min_row=effective_start, max_row=last_row,
        min_col=sc, max_col=ec,
    )
    for row_num, (row_cells, ev_cells) in enumerate(
        zip(ws_iter, ev_iter), start=effective_start
    ):
        any_in_row = False
        for cell, ev_cell in zip(row_cells, ev_cells):
            if cell.value is None:
                continue
            desc = describe_cell(cell, ev_cell.value)
            if desc:
                lines.append(desc)
                any_in_row = True
        if any_in_row:
            last_seen_row = row_num

    if last_seen_row < er and last_seen_row < total_rows:
        lines.append("")
        lines.append(
            f"[Showing rows {effective_start}-{last_seen_row}. "
            f"Use --offset {last_seen_row} for the next page.]"
        )
    return "\n".join(lines)


def print_formulas_only(wb: Workbook, evaluated_wb: Workbook) -> str:
    blocks = []
    count = 0
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        evaluated_ws = evaluated_wb[sheet_name]
        sheet_lines = []
        for row_cells, ev_cells in zip(ws.iter_rows(), evaluated_ws.iter_rows()):
            for cell, ev_cell in zip(row_cells, ev_cells):
                if cell.data_type != "f" or not isinstance(cell.value, str):
                    continue
                evaluated_value = ev_cell.value
                result = (
                    format_scalar(evaluated_value)
                    if evaluated_value is not None
                    else ""
                )
                main = (
                    cell.value if cell.value.startswith("=") else f"={
                        cell.value}"
                )
                line = (
                    f"{pad(cell.coordinate, 6)}  {
                        pad(ellipsize(main, 60), 62)}"
                )
                if result:
                    line += f"  {result}"
                sheet_lines.append(line)
                count += 1
        if sheet_lines:
            blocks.append(f"# {sheet_name}")
            blocks.extend(sheet_lines)
            blocks.append("")
    if count == 0:
        return "[No formulas in workbook]"
    if blocks and blocks[-1] == "":
        blocks.pop()
    return f"[Formulas: {count}]\n\n" + "\n".join(blocks)


def safe_output(text: str) -> Tuple[str, bool]:
    if len(text.encode("utf-8")) <= MAX_OUTPUT_BYTES:
        return text, False
    out_lines = []
    out_bytes = 0
    for line in text.split("\n"):
        line_bytes = len((line + "\n").encode("utf-8"))
        if out_bytes + line_bytes > MAX_OUTPUT_BYTES:
            return "\n".join(out_lines), True
        out_lines.append(line)
        out_bytes += line_bytes
    return "\n".join(out_lines), False


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="xlsx_inspect",
        usage=USAGE,
        add_help=False,
    )
    parser.add_argument("file", nargs="?")
    parser.add_argument("--sheet")
    parser.add_argument("--range", dest="range_spec")
    parser.add_argument("--formulas-only", action="store_true")
    parser.add_argument("--names", action="store_true")
    parser.add_argument("--max-rows", type=int, default=DEFAULT_MAX_ROWS)
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

    if args.max_rows < 1:
        sys.stderr.write("Error: --max-rows must be >= 1\n")
        return 1
    if args.offset < 0:
        sys.stderr.write("Error: --offset must be >= 0\n")
        return 1

    range_spec = None
    if args.range_spec:
        if not args.sheet:
            sys.stderr.write(
                f"Error: --range requires --sheet\nUsage: {USAGE}\n")
            return 1
        range_spec = parse_range(args.range_spec)

    wb = openpyxl.load_workbook(args.file, data_only=False, read_only=True)
    evaluated_wb = openpyxl.load_workbook(
        args.file, data_only=True, read_only=True
    )
    sheet_meta = parse_sheet_graphics(args.file)

    if args.formulas_only:
        body = print_formulas_only(wb, evaluated_wb)
    elif args.names:
        body = print_names(wb)
    elif args.sheet:
        ws = find_sheet(wb, args.sheet)
        evaluated_ws = find_sheet(evaluated_wb, args.sheet)
        body = print_sheet(
            ws, evaluated_ws,
            sheet_graphics(sheet_meta, ws.title),
            range_spec, args.offset, args.max_rows,
        )
    else:
        body = print_overview(wb, sheet_meta)

    file_header = (
        f"[File: {os.path.basename(args.file)} | "
        f"{format_size(os.path.getsize(args.file))}]"
    )
    full = file_header + "\n" + body

    text, truncated = safe_output(full)
    sys.stdout.write(text)
    sys.stdout.write("\n")
    if truncated:
        sys.stdout.write(
            "[Output truncated; narrow with --range or paginate with "
            "--offset / --max-rows]\n"
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

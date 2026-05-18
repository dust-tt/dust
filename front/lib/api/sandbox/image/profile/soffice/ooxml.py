"""Open Packaging Conventions (OPC) helpers shared across .xlsx / .pptx / .docx.

OOXML formats use a common envelope: a zip with `_rels/*.rels`
relationship descriptors and XML parts at predictable paths. These
helpers read that envelope without depending on format-specific
libraries.
"""

from __future__ import annotations

import zipfile
from typing import Dict, Optional
from xml.etree import ElementTree as ET

# Namespaces shared across OOXML formats. Format-specific namespaces
# (xdr / x for xlsx, p for pptx, w for docx) live with their parsers.
NS = {
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "c": "http://schemas.openxmlformats.org/drawingml/2006/chart",
}
R_ID_ATTR = f"{{{NS['r']}}}id"


def read_xml(zf: zipfile.ZipFile, path: str):
    """Read and parse an XML part from the package. Returns None if missing."""
    try:
        return ET.fromstring(zf.read(path))
    except KeyError:
        return None


def resolve_rel_target(rels_path: str, target: str) -> str:
    """Resolve a relationship Target (often relative, e.g. "../drawings/d1.xml")
    into an absolute path within the zip."""
    if target.startswith("/"):
        return target.lstrip("/")
    base = rels_path.rsplit("/_rels/", 1)[0]
    parts = (base.split("/") if base else []) + target.split("/")
    resolved = []
    for p in parts:
        if p == "..":
            if resolved:
                resolved.pop()
        elif p and p != ".":
            resolved.append(p)
    return "/".join(resolved)


def parse_rels(zf: zipfile.ZipFile, rels_path: str) -> Dict[str, str]:
    """Parse a `.rels` file. Returns {Id: resolved-target-path}."""
    tree = read_xml(zf, rels_path)
    if tree is None:
        return {}
    return {
        rel.attrib["Id"]: resolve_rel_target(rels_path, rel.attrib["Target"])
        for rel in tree.findall("pr:Relationship", NS)
    }


def rels_path_for(file_path: str) -> str:
    """xl/worksheets/sheet1.xml -> xl/worksheets/_rels/sheet1.xml.rels"""
    parent, _, name = file_path.rpartition("/")
    return f"{parent}/_rels/{name}.rels" if parent else f"_rels/{name}.rels"


def parse_chart_title(zf: zipfile.ZipFile, chart_path: str) -> Optional[str]:
    """Extract a DrawingML chart's title text. Used by xlsx and pptx."""
    tree = read_xml(zf, chart_path)
    if tree is None:
        return None
    title = tree.find("c:chart/c:title", NS)
    if title is None:
        return None
    chunks = [t.text for t in title.iter(f"{{{NS['a']}}}t") if t.text]
    return "".join(chunks).strip() or None


def qa(local: str) -> str:
    """Clark-notation tag in the DrawingML `a:` namespace."""
    return f"{{{NS['a']}}}{local}"


def theme_font(theme_xml, kind: str) -> Optional[str]:
    """Latin typeface for the theme's `majorFont` or `minorFont`.
    `kind` is "major" or "minor". Returns None if the theme is missing or
    has no latin entry for that font slot."""
    if theme_xml is None:
        return None
    latin = theme_xml.find(
        f"{qa('themeElements')}/{qa('fontScheme')}/{qa(kind + 'Font')}/{qa('latin')}"
    )
    if latin is None:
        return None
    return latin.attrib.get("typeface") or None


def theme_colors_by_name(theme_xml) -> dict:
    """Map color-scheme token (`dk1`, `lt1`, `accent1`...) to a 6-char hex
    string. Reads `themeElements/clrScheme`, falling back to `sysClr.lastClr`
    when a slot uses a system color. Used by docx and pptx; xlsx indexes by
    position with tint and keeps its own loader."""
    if theme_xml is None:
        return {}
    out = {}
    scheme = theme_xml.find(f"{qa('themeElements')}/{qa('clrScheme')}")
    if scheme is None:
        return out
    for child in scheme:
        token = child.tag.split("}", 1)[-1]
        srgb = child.find(qa("srgbClr"))
        if srgb is not None:
            out[token] = (srgb.attrib.get("val") or "").upper()
            continue
        sysclr = child.find(qa("sysClr"))
        if sysclr is not None:
            out[token] = (sysclr.attrib.get("lastClr") or "").upper()
    return out

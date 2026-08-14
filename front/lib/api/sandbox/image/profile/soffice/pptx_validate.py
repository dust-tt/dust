"""Package-integrity checks: will PowerPoint open this file at all?

`--compare` measures design fidelity and says nothing about validity, so a deck
PowerPoint refuses to open can pass QA clean. These are the OPC-level faults an
edit script actually produces: a stranded part, a relationship pointing nowhere,
an r:id with no relationship, a duplicate zip entry, a reused shape id.
"""

from __future__ import annotations

import zipfile
from typing import Dict, List, Optional, Set, Tuple
from xml.etree import ElementTree as ET

import ooxml

P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
R_ID_ATTRS = {
    f"{{{ooxml.NS['r']}}}{name}"
    for name in ("id", "embed", "link", "pict", "dm", "lo", "qs", "cs")
}


def _parse(zf: zipfile.ZipFile, path: str):
    """Parse a part, returning None when it is missing or malformed."""
    try:
        return ET.fromstring(zf.read(path))
    except (KeyError, ET.ParseError):
        return None


def _xml_parts(names: List[str]) -> List[str]:
    return [n for n in names if n.endswith(".xml") or n.endswith(".rels")]


def _duplicate_entries(zf: zipfile.ZipFile) -> List[str]:
    seen: Set[str] = set()
    dupes: Set[str] = set()
    for info in zf.infolist():
        if info.filename in seen:
            dupes.add(info.filename)
        seen.add(info.filename)
    return sorted(dupes)


def _content_type_gaps(zf: zipfile.ZipFile, names: List[str]) -> List[str]:
    """Parts with no Default extension and no Override in [Content_Types].xml.
    PowerPoint refuses a package whose parts are not typed."""
    root = _parse(zf, "[Content_Types].xml")
    if root is None:
        return ["[Content_Types].xml is missing"]
    defaults = {
        (el.attrib.get("Extension") or "").lower()
        for el in root.findall(f"{{{CT_NS}}}Default")
    }
    overrides = {
        (el.attrib.get("PartName") or "").lstrip("/")
        for el in root.findall(f"{{{CT_NS}}}Override")
    }
    gaps = []
    for name in names:
        if name.endswith("/") or name == "[Content_Types].xml":
            continue
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        if ext in defaults or name in overrides:
            continue
        gaps.append(f"no content type for {name}")
    return gaps


def _rel_problems(zf: zipfile.ZipFile, names: Set[str]) -> List[str]:
    """Relationships whose internal target is not in the package, and r:id
    references in a part with no matching relationship."""
    problems: List[str] = []
    for rels_path in [n for n in names if n.endswith(".rels")]:
        root = _parse(zf, rels_path)
        if root is None:
            problems.append(f"{rels_path} is not readable")
            continue
        rels: Dict[str, str] = {}
        for rel in root.findall("pr:Relationship", ooxml.NS):
            rid = rel.attrib.get("Id", "")
            rels[rid] = rel.attrib.get("Target", "")
            if rel.attrib.get("TargetMode") == "External":
                continue
            target = ooxml.resolve_rel_target(rels_path, rel.attrib.get("Target", ""))
            if target not in names:
                problems.append(f"{rels_path}: {rid} points at missing {target}")

        source = rels_path.replace("/_rels/", "/", 1)[: -len(".rels")]
        if source.startswith("_rels/"):
            source = source[len("_rels/"):]
        if source not in names:
            continue
        root = _parse(zf, source)
        if root is None:
            continue  # malformed parts are already reported on their own
        for el in root.iter():
            for attr, value in el.attrib.items():
                if attr in R_ID_ATTRS and value not in rels:
                    problems.append(f"{source}: {value} has no relationship")
    return problems


def _slide_problems(zf: zipfile.ZipFile, names: Set[str]) -> List[str]:
    """Slide parts missing from the slide order, and slide-order entries whose
    relationship is gone. Both come from hand-editing sldIdLst."""
    pres = _parse(zf, "ppt/presentation.xml")
    if pres is None:
        return ["ppt/presentation.xml is missing"]
    rels = ooxml.parse_rels(zf, ooxml.rels_path_for("ppt/presentation.xml"))
    listed: Set[str] = set()
    problems: List[str] = []
    for sld_id in pres.iter(f"{{{P_NS}}}sldId"):
        rid = sld_id.attrib.get(ooxml.R_ID_ATTR, "")
        target = rels.get(rid)
        if target is None:
            problems.append(f"slide order entry {rid} has no relationship")
        else:
            listed.add(target)
    for name in sorted(names):
        if name.startswith("ppt/slides/slide") and name.endswith(".xml"):
            if name not in listed:
                problems.append(f"{name} is in the package but not in the deck")
    return problems


def _duplicate_shape_ids(zf: zipfile.ZipFile, names: Set[str]) -> List[str]:
    """Two shapes sharing a cNvPr id on one slide; PowerPoint repairs the file."""
    problems: List[str] = []
    for name in sorted(names):
        if not (name.startswith("ppt/slides/slide") and name.endswith(".xml")):
            continue
        root = _parse(zf, name)
        if root is None:
            continue
        seen: Set[str] = set()
        for el in root.iter():
            if not el.tag.endswith("}cNvPr"):
                continue
            shape_id = el.attrib.get("id", "")
            if shape_id in seen:
                problems.append(f"{name}: duplicate shape id {shape_id}")
            seen.add(shape_id)
    return problems


def _malformed_parts(zf: zipfile.ZipFile, names: List[str]) -> List[str]:
    problems = []
    for name in _xml_parts(names):
        try:
            ET.fromstring(zf.read(name))
        except (ET.ParseError, KeyError) as exc:
            problems.append(f"{name} is not well-formed XML: {exc}")
    return problems


def check(path: str) -> List[str]:
    """Every integrity problem found in the package, one per line."""
    try:
        zf = zipfile.ZipFile(path)
    except (zipfile.BadZipFile, OSError) as exc:
        return [f"not a readable .pptx package: {exc}"]
    with zf:
        names = zf.namelist()
        name_set = set(names)
        return (
            [f"duplicate zip entry {n}" for n in _duplicate_entries(zf)]
            + _malformed_parts(zf, names)
            + _content_type_gaps(zf, names)
            + _rel_problems(zf, name_set)
            + _slide_problems(zf, name_set)
            + _duplicate_shape_ids(zf, name_set)
        )


def check_against(path: str, original: Optional[str]) -> Tuple[List[str], int]:
    """Problems in `path`, minus those the template already had.

    Returns `(problems, inherited_count)`. A template can ship its own faults;
    reporting them as yours buries the regression you actually caused.
    """
    problems = check(path)
    if not original:
        return problems, 0
    inherited = set(check(original))
    kept = [p for p in problems if p not in inherited]
    return kept, len(problems) - len(kept)


def report(path: str, original: Optional[str] = None) -> str:
    problems, inherited = check_against(path, original)
    lines = [f"[!] {p}" for p in problems]
    if inherited:
        lines.append(f"[i] {inherited} problem(s) inherited from the template")
    lines.append(
        "[VALID]" if not problems else f"[INVALID - {len(problems)} problem(s)]"
    )
    return "\n".join(lines)

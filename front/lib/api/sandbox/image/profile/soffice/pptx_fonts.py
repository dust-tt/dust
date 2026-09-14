#!/opt/venv/bin/python3
"""pptx_fonts - report the fonts a deck needs, and install the ones we can get.

A substituted face has different advance widths, so the QA render wraps text
where PowerPoint does not.
"""

from __future__ import annotations

import argparse
import contextlib
import ctypes
import io
import os
import re
import subprocess
import sys
import zipfile
from typing import Dict, List, Optional, Set, Tuple

import ooxml

A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
R_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
FONT_DIR = os.path.expanduser("~/.fonts")
GOOGLE_CSS = "https://fonts.googleapis.com/css2?family={}:wght@{}"
# Google's API only serves TTF to a UA it does not recognise as woff2-capable.
UA = "Mozilla/5.0 (X11; Linux x86_64)"

# Faces the image ships a metric-compatible stand-in for: same advance widths,
# so there is nothing to download.
METRIC_EQUIVALENTS = {
    "calibri": "carlito",
    "cambria": "caladea",
    "arial": "liberation sans",
    "helvetica": "liberation sans",
    "times new roman": "liberation serif",
    "courier new": "liberation mono",
}

# <p:embeddedFont> children, and the style each one carries.
EMBED_STYLES = {
    "regular": "Regular",
    "bold": "Bold",
    "italic": "Italic",
    "boldItalic": "Bold Italic",
}

# Weight words PowerPoint bakes into a face name; the family is the rest.
WEIGHTS = {
    "thin": 100, "extralight": 200, "ultralight": 200, "light": 300,
    "regular": 400, "normal": 400, "medium": 500, "semibold": 600,
    "demibold": 600, "bold": 700, "extrabold": 800, "ultrabold": 800,
    "black": 900, "heavy": 900,
}


def split_face(face: str) -> Tuple[str, int]:
    """'Montserrat SemiBold' -> ('Montserrat', 600). Unsuffixed faces are 400."""
    parts = face.split()
    if len(parts) > 1:
        tail = parts[-1].lower().replace("-", "")
        if tail in WEIGHTS:
            return " ".join(parts[:-1]), WEIGHTS[tail]
    collapsed = face.replace(" ", "").lower()
    for word, weight in WEIGHTS.items():
        if word != "regular" and collapsed.endswith(word):
            stem = face[: len(face) - len(word)].strip()
            if stem:
                return stem, weight
    return face, 400


def needed_faces(path: str) -> Set[str]:
    """Every latin typeface the deck asks for, across theme, masters, layouts
    and slides.

    Only `<a:latin>`. A theme's `<a:font script=...>` table names a fallback
    face per writing system - dozens per deck, none of them the deck's fonts.
    """
    faces: Set[str] = set()
    try:
        zf = zipfile.ZipFile(path)
    except (zipfile.BadZipFile, OSError):
        return faces
    with zf:
        for name in zf.namelist():
            if not name.endswith(".xml"):
                continue
            if not name.startswith(
                ("ppt/slides/", "ppt/slideLayouts/", "ppt/slideMasters/", "ppt/theme/")
            ):
                continue
            root = ooxml.read_xml(zf, name)
            if root is None:
                continue
            for el in root.iter(f"{A}latin"):
                face = (el.get("typeface") or "").strip()
                # "+mj-lt" / "+mn-lt" are theme references, resolved elsewhere.
                if face and not face.startswith("+"):
                    faces.add(face)
    return faces


def installed_families() -> Set[str]:
    try:
        out = subprocess.run(
            ["fc-list", "--format", "%{family}\n"],
            capture_output=True, text=True, timeout=30,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return set()
    fams: Set[str] = set()
    for line in out.splitlines():
        for fam in line.split(","):
            if fam.strip():
                fams.add(fam.strip().lower())
    return fams


def embedded_parts(zf: zipfile.ZipFile) -> Dict[str, Dict[str, str]]:
    """typeface -> {style: part path} from <p:embeddedFontLst>. Keyed on the
    name the deck uses, which is what a run's typeface has to match."""
    root = ooxml.read_xml(zf, "ppt/presentation.xml")
    if root is None:
        return {}
    rels = ooxml.parse_rels(zf, ooxml.rels_path_for("ppt/presentation.xml"))
    out: Dict[str, Dict[str, str]] = {}
    for el in root.iter(f"{P}embeddedFont"):
        font = el.find(f"{P}font")
        face = (font.get("typeface") or "").strip() if font is not None else ""
        if not face:
            continue
        parts = {}
        for tag, style in EMBED_STYLES.items():
            child = el.find(f"{P}{tag}")
            target = rels.get(child.get(R_ID) or "") if child is not None else None
            if target:
                parts[style] = target
        if parts:
            out[face] = parts
    return out


@contextlib.contextmanager
def quiet_stderr():
    """libeot reports table quirks straight to fd 2, over the tool's own output."""
    saved, devnull = os.dup(2), os.open(os.devnull, os.O_WRONLY)
    try:
        os.dup2(devnull, 2)
        yield
    finally:
        os.dup2(saved, 2)
        os.close(devnull)
        os.close(saved)


def eot_to_ttf(data: bytes) -> Optional[bytes]:
    """A .fntdata part expanded to a font. PowerPoint writes MicroType-Express
    compressed EOT, so the bytes are unusable until libeot decodes them."""
    try:
        lib = ctypes.CDLL("libeot.so.0")
    except OSError:
        return None
    lib.EOT2ttf_buffer.argtypes = [
        ctypes.c_char_p,
        ctypes.c_uint,
        ctypes.c_void_p,
        ctypes.POINTER(ctypes.POINTER(ctypes.c_ubyte)),
        ctypes.POINTER(ctypes.c_uint),
    ]
    lib.EOT2ttf_buffer.restype = ctypes.c_int
    # Opaque stand-in for struct EOTMetadata (192B on x86-64), sized for slack.
    metadata = ctypes.create_string_buffer(1024)
    out = ctypes.POINTER(ctypes.c_ubyte)()
    size = ctypes.c_uint()
    with quiet_stderr():
        rc = lib.EOT2ttf_buffer(
            data, len(data), metadata, ctypes.byref(out), ctypes.byref(size)
        )
    if rc != 0 or not size.value:
        return None
    ttf = ctypes.string_at(out, size.value)
    lib.EOTfreeBuffer(out)
    lib.EOTfreeMetadata(metadata)
    return ttf


def rename_family(ttf: bytes, family: str, style: str) -> Optional[bytes]:
    """The same font renamed to what the deck calls it. Embedded name tables
    disagree with the deck (Helvetica Neue ships an empty family name), and
    fc-match resolves on the family."""
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        return None
    full = family if style == "Regular" else f"{family} {style}"
    postscript = re.sub(r"[^A-Za-z0-9]+", "", full)[:63]
    try:
        font = TTFont(io.BytesIO(ttf))
        table = font["name"]
        # 16/17 are the typographic family/subfamily, and win over 1/2.
        table.names = [n for n in table.names if n.nameID not in (16, 17)]
        for name_id, value in ((1, family), (2, style), (4, full), (6, postscript)):
            table.setName(value, name_id, 3, 1, 0x409)
            table.setName(value, name_id, 1, 0, 0)
        buf = io.BytesIO()
        font.save(buf)
        return buf.getvalue()
    except Exception:  # noqa: BLE001 - an unusable font falls through to Google
        return None


def install_embedded(path: str) -> List[str]:
    """Install every face the deck carries in ppt/fonts. Returns the families
    installed."""
    try:
        zf = zipfile.ZipFile(path)
    except (zipfile.BadZipFile, OSError):
        return []
    families = []
    with zf:
        for face, parts in embedded_parts(zf).items():
            done = False
            for style, part in parts.items():
                try:
                    data = zf.read(part)
                except KeyError:
                    continue
                ttf = eot_to_ttf(data)
                named = rename_family(ttf, face, style) if ttf else None
                if named:
                    install(named, face, style)
                    done = True
            if done:
                families.append(face)
    return families


def fetch_google(family: str, weight: int) -> Optional[bytes]:
    """The TTF for family+weight from Google Fonts, or None if it has neither."""
    import urllib.error
    import urllib.parse
    import urllib.request

    url = GOOGLE_CSS.format(urllib.parse.quote(family.replace(" ", "+")), weight)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        css = urllib.request.urlopen(req, timeout=20).read().decode("utf8")
    except (urllib.error.URLError, OSError, UnicodeDecodeError):
        return None
    m = re.search(r"url\((https://[^)]+\.(?:ttf|otf))\)", css)
    if not m:
        return None
    try:
        return urllib.request.urlopen(
            urllib.request.Request(m.group(1), headers={"User-Agent": UA}), timeout=30
        ).read()
    except (urllib.error.URLError, OSError):
        return None


def install(data: bytes, family: str, suffix: object) -> str:
    os.makedirs(FONT_DIR, exist_ok=True)
    safe = re.sub(r"[^A-Za-z0-9]+", "", f"{family}-{suffix}")
    dest = os.path.join(FONT_DIR, f"{safe}.ttf")
    with open(dest, "wb") as fh:
        fh.write(data)
    return dest


def main() -> int:
    parser = argparse.ArgumentParser(prog="pptx_fonts", add_help=True)
    parser.add_argument("file")
    parser.add_argument("--install", action="store_true")
    args = parser.parse_args()

    if not os.path.isfile(args.file):
        sys.stderr.write(f"Error: file not found: {args.file}\n")
        return 1

    faces = needed_faces(args.file)
    embedded = install_embedded(args.file) if args.install else []
    if embedded:
        subprocess.run(["fc-cache", "-f"], capture_output=True, timeout=120)
    have = installed_families()
    wanted: Dict[Tuple[str, int], List[str]] = {}
    for face in sorted(faces):
        family, weight = split_face(face)
        wanted.setdefault((family, weight), []).append(face)

    def covered(family: str) -> bool:
        low = family.lower()
        return low in have or METRIC_EQUIVALENTS.get(low, "") in have

    missing = [
        (fam, w, names) for (fam, w), names in sorted(wanted.items())
        if not covered(fam)
    ]
    present = sorted({fam for (fam, _) in wanted if covered(fam)})

    lines = [f"[Fonts: {len(faces)} face(s) requested, {len(wanted)} family/weight]"]
    if embedded:
        lines.append(f"  extracted from the deck: {', '.join(sorted(embedded))}")
    if present:
        lines.append(f"  installed: {', '.join(present)}")
    if not missing:
        lines.append("  [OK] every face the deck asks for is installed")
        sys.stdout.write("\n".join(lines) + "\n")
        return 0

    if not args.install:
        for fam, w, names in missing:
            lines.append(f"  [!] missing {fam} {w} (as {', '.join(names)})")
        lines.append(
            "  Re-run with --install to extract the deck's own faces and fetch "
            "the rest from Google Fonts."
        )
        sys.stdout.write("\n".join(lines) + "\n")
        return 0

    got, absent = [], []
    for fam, w, _ in missing:
        data = fetch_google(fam, w)
        if data:
            install(data, fam, w)
            got.append(f"{fam} {w}")
        else:
            absent.append(f"{fam} {w}")
    if got:
        subprocess.run(["fc-cache", "-f"], capture_output=True, timeout=120)
        lines.append(f"  fetched from Google Fonts: {', '.join(got)}")
    if absent:
        lines.append(
            f"  [!] not embedded and not on Google Fonts, still substituted: "
            f"{', '.join(absent)}. Fit warnings on these stay approximate."
        )
    sys.stdout.write("\n".join(lines) + "\n")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001 - CLI boundary
        sys.stderr.write(f"Error: {type(exc).__name__}: {exc}\n")
        sys.exit(1)

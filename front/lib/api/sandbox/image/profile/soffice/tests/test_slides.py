"""Tier-2 tests for pptx_slides.op_delete: a deleted slide leaves no part
behind, custom shows included. Builds decks with python-pptx, no soffice. Run
directly (`python test_slides.py`) or under pytest.

Lives in soffice/tests/, a subdir getLocalDirContent skips: it copies only the
regular files directly in soffice/ (never recursing), so tests never ship in the image. It adds soffice/ to sys.path to import the module.
"""
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lxml import etree  # noqa: E402
from pptx import Presentation  # noqa: E402
from pptx.oxml.ns import qn  # noqa: E402

import pptx_slides as S  # noqa: E402

P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def _deck(path: Path, slides: int = 3, custom_show_on: int = 0) -> None:
    """A deck; custom_show_on=N adds a custom show referencing slide N."""
    prs = Presentation()
    for _ in range(slides):
        prs.slides.add_slide(prs.slide_layouts[6])
    if custom_show_on:
        rid = list(prs.slides._sldIdLst)[custom_show_on - 1].get(qn("r:id"))
        cust = etree.SubElement(prs.part._element, f"{{{P_NS}}}custShowLst")
        show = etree.SubElement(cust, f"{{{P_NS}}}custShow")
        show.set("name", "Short version")
        show.set("id", "0")
        ref = etree.SubElement(
            etree.SubElement(show, f"{{{P_NS}}}sldLst"), f"{{{P_NS}}}sld"
        )
        ref.set(f"{{{R_NS}}}id", rid)
    prs.save(path)


def _slide_parts(path: Path) -> int:
    with zipfile.ZipFile(path) as zf:
        return len(
            [n for n in zf.namelist() if n.startswith("ppt/slides/slide")
             and n.endswith(".xml")]
        )


def _delete(path: Path, slide_nos):
    prs = Presentation(path)
    msg = S.op_delete(prs, slide_nos)
    prs.save(path)
    return msg


def test_delete_drops_the_slide_part():
    with tempfile.TemporaryDirectory() as d:
        deck = Path(d) / "deck.pptx"
        _deck(deck)
        _delete(deck, [2])
        assert len(Presentation(deck).slides) == 2
        assert _slide_parts(deck) == 2


def test_delete_drops_the_part_when_a_custom_show_also_references_it():
    with tempfile.TemporaryDirectory() as d:
        deck = Path(d) / "deck.pptx"
        _deck(deck, custom_show_on=2)
        _delete(deck, [2])
        assert len(Presentation(deck).slides) == 2
        # Without the purge, drop_rel no-ops and slide2.xml survives.
        assert _slide_parts(deck) == 2


def test_delete_leaves_the_custom_shows_other_slides_alone():
    with tempfile.TemporaryDirectory() as d:
        deck = Path(d) / "deck.pptx"
        _deck(deck, custom_show_on=2)
        _delete(deck, [3])
        assert len(Presentation(deck).slides) == 2
        assert _slide_parts(deck) == 2
        with zipfile.ZipFile(deck) as zf:
            pres = zf.read("ppt/presentation.xml").decode("utf-8")
        assert "custShow" in pres


def test_delete_out_of_range_raises():
    with tempfile.TemporaryDirectory() as d:
        deck = Path(d) / "deck.pptx"
        _deck(deck)
        for bad in ([0], [4], [1, 9]):
            try:
                _delete(deck, bad)
            except ValueError:
                continue
            raise AssertionError(f"expected ValueError for {bad!r}")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items())
             if k.startswith("test_") and callable(v)]
    for fn in tests:
        fn()
        print(f"ok   {fn.__name__}")
    print(f"\n{len(tests)} slides tests passed")

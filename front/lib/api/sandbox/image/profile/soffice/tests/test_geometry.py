"""Tier-1 pure-logic tests for pptx_geometry: overlap classification, the
text-fit estimate, and EMU conversion. No fixtures - tuples and a tiny fake
shape. Run directly (`python test_geometry.py`) or under pytest.

Lives in soffice/tests/, a subdir getLocalDirContent skips: it copies only the
regular files directly in soffice/ (never recursing), so tests never ship in the image. It adds soffice/ to sys.path to import the module.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pptx_geometry as G  # noqa: E402

EMU = G.EMU_PER_INCH


class FakeShape:
    """_fit_estimate only reads .width / .height (EMU)."""

    def __init__(self, w_in: float, h_in: float):
        self.width = int(w_in * EMU)
        self.height = int(h_in * EMU)


def box(left, top, w, h):
    return (int(left * EMU), int(top * EMU), int(w * EMU), int(h * EMU))


class FakePara:
    def __init__(self, text):
        self.text = text


class FakeAnchor:
    def __init__(self, name):
        self.name = name


class FakeTextFrame:
    def __init__(self, paras, anchor_name=None):
        self.paragraphs = [FakePara(t) for t in paras]
        self.vertical_anchor = FakeAnchor(anchor_name) if anchor_name else None


class FakeTextShape:
    """_text_extent_box reads box geometry + text_frame paragraphs + anchor."""

    def __init__(self, left, top, w_in, h_in, paras, anchor_name=None):
        self.left = int(left * EMU)
        self.top = int(top * EMU)
        self.width = int(w_in * EMU)
        self.height = int(h_in * EMU)
        self.has_text_frame = True
        self.text_frame = FakeTextFrame(paras, anchor_name)


def test_emu_to_inches():
    assert G.emu_to_inches(EMU) == 1.0
    assert G.emu_to_inches(EMU // 2) == 0.5
    assert G.emu_to_inches(None) is None


def test_overlap_none_when_disjoint():
    assert G._classify_overlap(box(0, 0, 1, 1), box(2, 2, 1, 1))[0] is None


def test_overlap_stacked_when_coincident():
    # both boxes >= STACKED_CONT (0.90) covered -> they coincide
    kind, pen, axis = G._classify_overlap(box(0, 0, 2, 2), box(0, 0, 2, 2))
    assert kind == "stacked" and pen == 0 and axis == ""


def test_overlap_contained_is_fg_bg():
    # small box fully inside a big one: one box >= CONTAINMENT_TAU (0.85) inside
    assert G._classify_overlap(box(0, 0, 10, 10), box(1, 1, 1, 1))[0] == "contained"


def test_overlap_peer_partial():
    # two equal boxes ~40% overlapped: neither mostly covers the other
    kind, pen, axis = G._classify_overlap(box(0, 0, 2, 2), box(1.2, 0, 2, 2))
    assert kind == "peer"
    assert axis == "horizontally"  # shallower axis is x
    assert pen > 0


def test_overlap_below_peer_threshold_is_none():
    # shallow-axis overlap < PEER_PENETRATION_EMU (0.1in) -> negligible
    assert G._classify_overlap(box(0, 0, 2, 2), box(1.95, 0, 2, 2))[0] is None


def test_fit_estimate_multiline_capacity():
    est = G._fit_estimate(FakeShape(5, 3), 12.0)
    assert est is not None
    assert est.chars_per_line > 0
    assert est.capacity is not None and est.capacity > est.chars_per_line


def test_fit_estimate_short_box_has_no_capacity():
    # a box under ~2 lines tall is a nominal-height label (overflows by design)
    est = G._fit_estimate(FakeShape(5, 0.3), 12.0)
    assert est is not None and est.capacity is None


def test_fit_estimate_too_narrow_returns_none():
    assert G._fit_estimate(FakeShape(0.1, 1), 40.0) is None


def test_extent_grows_multiline_overflow_down():
    # two non-empty paragraphs in a ~one-line-tall box, top-anchored: the box
    # grows DOWNWARD (top fixed) to wrap both lines, biased larger.
    shape = FakeTextShape(1.0, 1.5, 8.0, 0.7, ["First line", "Second line"])
    ext = G._text_extent_box(shape, 40.0)
    assert ext is not None
    left, top, w, h = ext
    assert top == shape.top  # top anchor: grows down only
    assert w == shape.width
    assert h > shape.height  # genuinely larger


def test_extent_none_when_single_line_snug():
    # a snug one-line box (one paragraph) is a nominal-height label, never grown.
    shape = FakeTextShape(1.0, 1.5, 8.0, 0.5, ["Just one line"])
    assert G._text_extent_box(shape, 40.0) is None


def test_extent_none_for_borderline_single_line():
    # a 26-char title in a one-line box that the conservative (fit) width holds
    # (~28ch/line @22pt in 4.6") is NOT grown, even though the wider extent width
    # alone would wrap it - growing it would fabricate a spill onto a neighbour.
    shape = FakeTextShape(2.7, 1.1, 4.6, 0.4, ["The multiplayer difference"])
    assert G._text_extent_box(shape, 22.0) is None


def test_extent_grows_clear_single_line_overflow():
    # a 44-char title that overflows a one-line box even by the conservative
    # width (~28ch/line @40pt in 8.0") is a genuine overflow and IS grown.
    shape = FakeTextShape(
        1.1, 2.2, 8.0, 0.8, ["Work doesn't just get done. It gets rewired."]
    )
    ext = G._text_extent_box(shape, 40.0)
    assert ext is not None and ext[3] > shape.height


def test_extent_none_when_text_fits():
    # two short paragraphs in a tall box that holds them: no growth.
    shape = FakeTextShape(1.0, 1.5, 8.0, 4.0, ["First line", "Second line"])
    assert G._text_extent_box(shape, 40.0) is None


def test_render_collision_peer_flags():
    # a plain peer overlap (no extension) flags as a "peer", as before.
    flag, pen, kind = G._render_collision(
        box(0, 0, 2, 2), box(1.2, 0, 2, 2),
        box(0, 0, 2, 2), box(1.2, 0, 2, 2),
    )
    assert flag and pen > 0 and kind == "peer"


def test_render_collision_designed_fg_bg_suppressed():
    # a small box inside a big one at BOTH declared and effective sizes is an
    # intentional overlay -> not a collision.
    big, small = box(0, 0, 10, 10), box(1, 1, 1, 1)
    flag, _, kind = G._render_collision(big, small, big, small)
    assert not flag and kind == ""


def test_render_collision_overflow_spill_surfaced():
    # declared boxes don't touch (clean gap); a grows downward to wrap overflow
    # and now covers most of short-wide b -> spillover, surfaced not suppressed.
    decl_a, decl_b = box(1, 1, 8, 1), box(0.5, 2.2, 9, 0.4)
    eff_a = box(1, 1, 8, 2)  # grew down past b
    flag, pen, kind = G._render_collision(decl_a, decl_b, eff_a, decl_b)
    assert flag and pen > 0 and kind == "spill"


def test_extent_middle_grows_down_not_symmetric():
    # a MIDDLE-anchored box is grown DOWNWARD from its declared top, never
    # symmetrically (which used to drift it up off its own position).
    shape = FakeTextShape(1.0, 1.5, 8.0, 0.7, ["First", "Second"], "MIDDLE")
    ext = G._text_extent_box(shape, 40.0)
    assert ext is not None
    _, top, _, h = ext
    assert top == shape.top  # declared top kept, not raised
    assert h > shape.height


def test_extent_bottom_grows_up():
    # a BOTTOM-anchored box, whose text spills upward, grows up with room above:
    # the bottom edge stays put and the top rises.
    shape = FakeTextShape(1.0, 3.0, 8.0, 0.7, ["word " * 40], "BOTTOM")
    ext = G._text_extent_box(shape, 40.0)
    assert ext is not None
    _, top, _, h = ext
    assert top < shape.top  # grew upward
    assert top + h == shape.top + shape.height  # bottom edge unchanged


def test_extent_bottom_clamped_to_slide_top():
    # near the slide top, upward growth is clamped so the box never goes off-slide.
    shape = FakeTextShape(1.0, 0.2, 8.0, 0.7, ["word " * 40], "BOTTOM")
    ext = G._text_extent_box(shape, 40.0)
    assert ext is not None
    assert ext[1] == 0  # top clamped to the slide edge


def test_extent_capped_to_max_growth():
    # a gross overflow is capped at EXTENT_MAX_GROWTH x the declared height so a
    # mis-estimated wrap can't balloon the box across the slide.
    shape = FakeTextShape(1.0, 1.0, 8.0, 0.6, ["word " * 200])
    ext = G._text_extent_box(shape, 40.0)
    assert ext is not None
    assert ext[3] <= round(shape.height * G.EXTENT_MAX_GROWTH) + 1  # +1: rounding


def test_extent_grows_one_line_title_overflow():
    # regression: a single-paragraph title that wraps from one line to two in a
    # one-line box (a long center title over a subtitle just below) is a real
    # overflow and must grow down - EXTENT_OVERFLOW_SLACK must not suppress a
    # one-line overage. Mirrors the deck case "Work doesn't just get done. It
    # gets rewired." in an 8.0x0.8in, 40pt box.
    shape = FakeTextShape(
        1.1, 2.2, 8.0, 0.8, ["Work doesn't just get done. It gets rewired."]
    )
    ext = G._text_extent_box(shape, 40.0)
    assert ext is not None
    _, top, _, h = ext
    assert top == shape.top  # top anchor: grows down only
    assert h > shape.height  # genuinely larger, so the overlap with #142 surfaces


def test_fit_estimate_falls_back_when_the_face_is_not_installed():
    est = G._fit_estimate(FakeShape(5, 3), 12.0, "NoSuchFaceAnywhere")
    assert est is not None
    assert est.measured is False
    assert est.chars_per_line > 0


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items())
             if k.startswith("test_") and callable(v)]
    for fn in tests:
        fn()
        print(f"ok   {fn.__name__}")
    print(f"\n{len(tests)} geometry tests passed")

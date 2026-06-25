"""Tier-1 pure-logic tests for pptx_geometry: overlap classification, the
text-fit estimate, and EMU conversion. No fixtures — tuples and a tiny fake
shape. Run directly (`python test_geometry.py`) or under pytest.

Lives in soffice_tests/ (sibling of soffice/), which getLocalDirContent never
copies into the sandbox image; it adds soffice/ to sys.path to import the module.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "soffice"))

import pptx_geometry as G  # noqa: E402

EMU = G.EMU_PER_INCH


class FakeShape:
    """_fit_estimate only reads .width / .height (EMU)."""

    def __init__(self, w_in: float, h_in: float):
        self.width = int(w_in * EMU)
        self.height = int(h_in * EMU)


def box(left, top, w, h):
    return (int(left * EMU), int(top * EMU), int(w * EMU), int(h * EMU))


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


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items())
             if k.startswith("test_") and callable(v)]
    for fn in tests:
        fn()
        print(f"ok   {fn.__name__}")
    print(f"\n{len(tests)} geometry tests passed")

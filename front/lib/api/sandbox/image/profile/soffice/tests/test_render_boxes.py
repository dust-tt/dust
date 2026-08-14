"""Tier-1 tests for pptx_render_boxes pure logic: marker-run clustering, run↔text
pairing, and edge-density text-row detection on a synthetic image. The pixel
overlay itself (_annotate_boxes) is covered by the golden render view + the
clean-room toolchain check.

Run directly (`python test_render_boxes.py`) or under pytest.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from PIL import Image  # noqa: E402
from pptx.enum.shapes import MSO_SHAPE_TYPE  # noqa: E402

import pptx_geometry as G  # noqa: E402
import pptx_render_boxes as R  # noqa: E402

EMU = G.EMU_PER_INCH


class FakeShape:
    """Enough surface for shape_kind() + the marker geometry (all in inches)."""

    def __init__(self, sid, left, top, w, h, kind=MSO_SHAPE_TYPE.PICTURE):
        self.shape_id = sid
        self.left, self.top = int(left * EMU), int(top * EMU)
        self.width, self.height = int(w * EMU), int(h * EMU)
        self.has_chart = self.has_table = False
        self.shape_type = kind


def _column(base_id, left, n=4):
    return [FakeShape(base_id + i, left, 2.0 + 0.4 * i, 0.2, 0.2) for i in range(n)]


def test_marker_runs_detects_aligned_column():
    runs = R._marker_runs(_column(0, 1.0, 4))
    assert len(runs) == 1
    assert [m.shape_id for m in runs[0]] == [0, 1, 2, 3]  # sorted top-to-bottom


def test_marker_runs_needs_at_least_three():
    assert R._marker_runs(_column(0, 1.0, 2)) == []


def test_marker_runs_separates_two_columns():
    runs = R._marker_runs(_column(0, 1.0, 3) + _column(10, 5.0, 3))
    assert len(runs) == 2


def test_marker_runs_ignores_large_shapes():
    big = [FakeShape(i, 1.0, 2.0 + 0.4 * i, 3.0, 2.0) for i in range(3)]
    assert R._marker_runs(big) == []


def test_pair_run_to_text_picks_nearest_overlapping():
    run = _column(0, 1.0, 3)  # left edge ~1.0, right edge ~1.2
    near = FakeShape(20, 1.4, 2.0, 3.0, 2.0)  # just right, vertically overlapping
    far = FakeShape(21, 8.0, 2.0, 1.0, 2.0)
    assert R._pair_run_to_text(run, [far, near]).shape_id == 20


def test_pair_run_to_text_none_when_no_vertical_overlap():
    run = _column(0, 1.0, 3)  # spans top ~2.0..3.0
    below = FakeShape(20, 1.4, 5.0, 3.0, 1.0)  # entirely below the run
    assert R._pair_run_to_text(run, [below]) is None


def test_text_row_centers_finds_a_band():
    # one horizontal band of high-frequency (edge-rich) pixels = one text row
    img = Image.new("RGB", (200, 100), (255, 255, 255))
    px = img.load()
    for y in range(40, 52):
        for x in range(200):
            if (x // 2) % 2 == 0:
                px[x, y] = (0, 0, 0)
    rows = R._text_row_centers(img, (0, 0, 200, 100))
    assert len(rows) == 1
    assert 38 <= rows[0] <= 54


def test_text_row_centers_empty_on_blank():
    img = Image.new("RGB", (200, 100), (250, 250, 250))
    assert R._text_row_centers(img, (0, 0, 200, 100)) == []


def test_is_full_span_flags_banners_and_backgrounds():
    W, H = int(13.333 * EMU), int(7.5 * EMU)
    band = (0, int(3 * EMU), int(12 * EMU), int(0.3 * EMU))  # full-width band
    backdrop = (0, 0, int(0.4 * EMU), int(7.0 * EMU))  # full-height backdrop
    photo = (int(EMU), int(EMU), int(3 * EMU), int(2 * EMU))  # normal box
    assert R._is_full_span(band, W, H)
    assert R._is_full_span(backdrop, W, H)
    assert not R._is_full_span(photo, W, H)


def test_rects_overlap():
    assert R._rects_overlap((0, 0, 10, 10), (5, 5, 15, 15))
    assert not R._rects_overlap((0, 0, 10, 10), (11, 0, 20, 10))


def test_suppress_as_layering_only_for_declared_overlap():
    # boxes are (left, top, width, height) EMU; 10 x 5.62in slide (the dust deck)
    W, H = int(10 * EMU), int(5.62 * EMU)
    # full-width subtitle (w/W=0.93 -> full-span) and a title just above it whose
    # declared box does NOT reach it (bottom 3.03 < subtitle top 3.10).
    subtitle = (int(0.34 * EMU), int(3.10 * EMU), int(9.32 * EMU), int(0.40 * EMU))
    title = (int(1.06 * EMU), int(2.20 * EMU), int(7.97 * EMU), int(0.83 * EMU))
    # a grown title spilling onto the full-width subtitle is a real overflow, not
    # layering -> NOT suppressed here (the collision test surfaces the spill).
    assert not R._suppress_as_layering(title, subtitle, W, H)
    # content sitting ON a full-width band overlaps it at declared geometry: that
    # IS intentional layering -> suppressed.
    band = (0, int(3.0 * EMU), int(9.5 * EMU), int(0.5 * EMU))  # w/W=0.95 full-span
    photo = (int(EMU), int(2.9 * EMU), int(3 * EMU), int(2 * EMU))  # overlaps the band
    assert R._suppress_as_layering(photo, band, W, H)
    # neither box full-span -> never layering-suppressed (collision test decides).
    normal_a = (int(EMU), int(EMU), int(3 * EMU), int(2 * EMU))
    normal_b = (int(2 * EMU), int(2 * EMU), int(3 * EMU), int(2 * EMU))
    assert not R._suppress_as_layering(normal_a, normal_b, W, H)


def test_contrast_text_picks_legible_color():
    assert R._contrast_text((255, 64, 64)) == (255, 255, 255, 255)  # dark -> white
    assert R._contrast_text((150, 210, 0)) == (0, 0, 0, 255)  # light -> black




def test_load_font_returns_a_font():
    assert R._load_font(20) is not None


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items())
             if k.startswith("test_") and callable(v)]
    for fn in tests:
        fn()
        print(f"ok   {fn.__name__}")
    print(f"\n{len(tests)} render_boxes tests passed")

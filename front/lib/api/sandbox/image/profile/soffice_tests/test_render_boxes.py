"""Tier-1 tests for pptx_render_boxes pure logic: marker-run clustering, run↔text
pairing, and edge-density text-row detection on a synthetic image. The pixel
overlay itself (_annotate_boxes) is covered by the golden render view + the
clean-room toolchain check.

Run directly (`python test_render_boxes.py`) or under pytest.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "soffice"))

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


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items())
             if k.startswith("test_") and callable(v)]
    for fn in tests:
        fn()
        print(f"ok   {fn.__name__}")
    print(f"\n{len(tests)} render_boxes tests passed")

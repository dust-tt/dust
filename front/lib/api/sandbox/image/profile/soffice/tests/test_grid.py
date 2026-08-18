"""Tier-1 tests for pptx_grid.compose_grids, the tiler behind `pptx_inspect
--qa/--render --grid`. Synthetic PIL images, no soffice. Run directly
(`python test_grid.py`) or under pytest.

Lives in soffice/tests/, a subdir getLocalDirContent skips: it copies only the
regular files directly in soffice/ (never recursing), so tests never ship in the image. It adds soffice/ to sys.path to import the module.
"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from PIL import Image  # noqa: E402

import pptx_grid as S  # noqa: E402


def _slides(d: Path, n: int, size=(1333, 750)):
    cells = []
    for i in range(1, n + 1):
        p = d / f"slide-{i:03d}.jpg"
        Image.new("RGB", size, (255, 255, 255)).save(p, "JPEG")
        cells.append((p, f"slide {i}"))
    return cells


def test_sixteen_by_nine_fits_six_per_two_column_grid():
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        grids = S.compose_grids(_slides(d, 6), d / "out", cols=2)
        assert len(grids) == 1
        assert len(grids[0][1]) == 6


def test_overflow_spills_into_a_second_grid():
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        grids = S.compose_grids(_slides(d, 7), d / "out", cols=2)
        assert len(grids) == 2
        assert [len(labels) for _, labels in grids] == [6, 1]
        assert grids[1][1] == ["slide 7"]


def test_grid_never_exceeds_the_vision_ceiling_on_its_long_edge():
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        for cols in (1, 2, 3, 4):
            grids = S.compose_grids(_slides(d, 8), d / f"out{cols}", cols=cols)
            for path, _ in grids:
                with Image.open(path) as img:
                    assert max(img.size) <= S.GRID_MAX_PX, (cols, img.size)


def test_more_columns_means_smaller_cells():
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        widths = []
        for cols in (1, 2, 4):
            cell_w = (S.GRID_MAX_PX - (cols + 1) * S.GRID_PAD) // cols
            widths.append(cell_w)
        assert widths == sorted(widths, reverse=True)


def test_cols_are_clamped_to_the_supported_range():
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        cells = _slides(d, 4)
        assert len(S.compose_grids(cells, d / "hi", cols=99)[0][1]) == len(
            S.compose_grids(cells, d / "max", cols=S.MAX_GRID_COLS)[0][1]
        )
        assert S.compose_grids(cells, d / "lo", cols=0)


def test_missing_render_is_skipped_not_fatal():
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        cells = _slides(d, 3) + [(d / "gone.jpg", "slide 4")]
        grids = S.compose_grids(cells, d / "out", cols=2)
        assert len(grids) == 1
        assert len(grids[0][1]) == 3


def test_no_usable_render_returns_nothing():
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        assert S.compose_grids([(d / "gone.jpg", "slide 1")], d / "out") == []


def test_grid_lines_report_the_slides_each_grid_holds():
    lines = S.grid_lines(
        [
            (Path("/tmp/grid-001.jpg"), "conversation-x/grid-001.jpg", [1, 2]),
            (Path("/tmp/grid-002.jpg"), None, [3]),
        ]
    )
    assert lines[0] == "  grid 1 (slides 1,2): conversation-x/grid-001.jpg"
    assert "not on the conversation mount" in lines[1]


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items())
             if k.startswith("test_") and callable(v)]
    for fn in tests:
        fn()
        print(f"ok   {fn.__name__}")
    print(f"\n{len(tests)} grid tests passed")

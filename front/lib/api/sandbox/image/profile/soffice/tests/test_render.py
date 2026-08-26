"""Tier-1 pure-logic test for render._pdf_is_fresh: the cache-freshness check
that lets the per-slide QA loop reuse a converted PDF instead of re-running
soffice for every slide. No soffice/subprocess - just temp files and mtimes.

Run directly (`python test_render.py`) or under pytest.

Lives in soffice/tests/, a subdir getLocalDirContent skips: it copies only the
regular files directly in soffice/ (never recursing), so tests never ship in the image. It adds soffice/ to sys.path to import the module.
"""
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import render as R  # noqa: E402


def _write_at(path: Path, mtime_ns: int) -> None:
    path.write_bytes(b"x")
    os.utime(path, ns=(mtime_ns, mtime_ns))


def test_pdf_fresh_when_converted_after_source():
    with tempfile.TemporaryDirectory() as d:
        src = Path(d) / "deck.pptx"
        pdf = Path(d) / "deck.pdf"
        _write_at(src, 1_000_000_000)
        _write_at(pdf, 2_000_000_000)  # converted after the source -> reusable
        assert R._pdf_is_fresh(pdf, str(src)) is True


def test_pdf_stale_when_source_edited_after_convert():
    with tempfile.TemporaryDirectory() as d:
        src = Path(d) / "deck.pptx"
        pdf = Path(d) / "deck.pdf"
        _write_at(pdf, 1_000_000_000)
        _write_at(src, 2_000_000_000)  # edited after the PDF -> must reconvert
        assert R._pdf_is_fresh(pdf, str(src)) is False


def test_pdf_stale_when_mtimes_equal():
    # ambiguous (equal mtime): prefer correctness and reconvert.
    with tempfile.TemporaryDirectory() as d:
        src = Path(d) / "deck.pptx"
        pdf = Path(d) / "deck.pdf"
        _write_at(src, 1_500_000_000)
        _write_at(pdf, 1_500_000_000)
        assert R._pdf_is_fresh(pdf, str(src)) is False


def test_pdf_stale_when_missing():
    with tempfile.TemporaryDirectory() as d:
        src = Path(d) / "deck.pptx"
        _write_at(src, 1_000_000_000)
        assert R._pdf_is_fresh(Path(d) / "nope.pdf", str(src)) is False


def test_cache_dir_separates_two_decks_that_share_a_basename():
    """A QA pass that reads the wrong deck's PDF reports it as clean."""
    assert R.cache_dir_name("/a/deck.pptx") != R.cache_dir_name("/b/deck.pptx")


def test_cache_dir_is_stable_and_keeps_the_readable_name():
    assert R.cache_dir_name("/a/deck.pptx") == R.cache_dir_name("/a/deck.pptx")
    assert R.cache_dir_name("/a/deck.pptx").startswith("deck-")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items())
             if k.startswith("test_") and callable(v)]
    for fn in tests:
        fn()
        print(f"ok   {fn.__name__}")
    print(f"\n{len(tests)} render tests passed")

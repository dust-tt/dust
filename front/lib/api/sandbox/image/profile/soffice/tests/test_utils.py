"""Tier-1 pure-logic tests for utils.parse_slide_patterns: the slide-pattern
parser shared by the inspect scripts (used by `pptx_inspect --qa`). No fixtures
— just strings. Run directly (`python test_utils.py`) or under pytest.

Lives in soffice/tests/, a subdir getLocalDirContent skips: it copies only the
regular files directly in soffice/ (never recursing), so tests never ship in the image. It adds soffice/ to sys.path to import the module.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import utils as U  # noqa: E402


def test_single_slide():
    assert U.parse_slide_patterns("5") == [5]


def test_comma_list():
    assert U.parse_slide_patterns("2,5,8") == [2, 5, 8]


def test_inclusive_range():
    assert U.parse_slide_patterns("3-7") == [3, 4, 5, 6, 7]


def test_mixed_list_and_ranges():
    assert U.parse_slide_patterns("2,5,7-9") == [2, 5, 7, 8, 9]


def test_dedupes_preserving_first_occurrence_order():
    assert U.parse_slide_patterns("3,1,3,2-3,1") == [3, 1, 2]


def test_whitespace_tolerated():
    assert U.parse_slide_patterns(" 2 , 4 - 6 ") == [2, 4, 5, 6]


def test_empty_raises():
    for bad in ("", "  ", ",", " , "):
        try:
            U.parse_slide_patterns(bad)
        except ValueError:
            continue
        raise AssertionError(f"expected ValueError for {bad!r}")


def test_malformed_raises():
    for bad in ("abc", "1,x", "3-", "-4", "5-2", "1..3"):
        try:
            U.parse_slide_patterns(bad)
        except ValueError:
            continue
        raise AssertionError(f"expected ValueError for {bad!r}")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items())
             if k.startswith("test_") and callable(v)]
    for fn in tests:
        fn()
        print(f"ok   {fn.__name__}")
    print(f"\n{len(tests)} utils tests passed")

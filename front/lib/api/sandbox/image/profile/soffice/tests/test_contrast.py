"""Tier-1 tests for pptx_contrast: the WCAG ratio and the word-box ink
estimator that decides whether rendered copy is readable. Synthetic PIL images,
no soffice - the estimator is the part that had to be got right (a per-bucket
frequency floor calls black-on-white 1.05:1, because antialiasing smears the ink
across ~150 quantised buckets).

Run directly (`python test_contrast.py`) or under pytest.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from PIL import Image, ImageDraw  # noqa: E402

import pptx_contrast as C  # noqa: E402

WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
NAVY = (0, 38, 76)
# The brand blue as it RENDERS: the template paints its flat theme colour
# under a lighter blob, and white-on-that is the real borderline case.
BRAND_BLUE = (72, 160, 232)


def word_image(bg, ink, size=(120, 30)):
    """A box the size of a rendered word, with glyph-like strokes covering a
    realistic fraction of it."""
    img = Image.new("RGB", size, bg)
    draw = ImageDraw.Draw(img)
    for x in range(6, size[0] - 6, 12):
        draw.rectangle([x, 6, x + 4, size[1] - 7], fill=ink)
    return img


def measure(bg, ink):
    img = word_image(bg, ink)
    result = C._word_contrast(img, img.width, img.height, (0, 0, img.width, img.height))
    assert result is not None
    return result[0]


def test_contrast_ratio_matches_wcag():
    # Black on white is the WCAG maximum.
    assert round(C.contrast_ratio(BLACK, WHITE), 2) == 21.0
    assert round(C.contrast_ratio(WHITE, WHITE), 2) == 1.0


def test_black_on_white_reads_as_high_contrast():
    # The regression this module was written against: an ink estimator with a
    # per-bucket frequency floor scored this at 1.05 and passed unreadable decks.
    assert measure(WHITE, BLACK) > 15


def test_black_on_navy_is_blocked():
    ratio = measure(NAVY, BLACK)
    assert ratio < C.CONTRAST_BLOCK, ratio


def test_white_on_navy_is_clean():
    assert measure(NAVY, WHITE) > C.CONTRAST_WARN


def test_white_on_brand_blue_warns_but_does_not_block():
    ratio = measure(BRAND_BLUE, WHITE)
    assert C.CONTRAST_BLOCK <= ratio < C.CONTRAST_WARN, ratio


def test_tiny_box_is_skipped():
    img = word_image(WHITE, BLACK, size=(40, 20))
    assert C._word_contrast(img, img.width, img.height, (0, 0, 1, 1)) is None


def test_contrast_lines_hint_once_per_group():
    contrasts = [
        C.ShapeContrast(7, 1.3, NAVY, BLACK, 4, 0.0),
        C.ShapeContrast(9, 1.4, NAVY, BLACK, 2, 0.0),
    ]
    severe, review, blockers = C.contrast_lines(contrasts, lambda sid: f"#{sid}")
    assert blockers == 2
    assert not review
    # Two findings, one shared fix hint - repeating the hint per finding buries
    # the findings under boilerplate.
    assert sum(1 for line in severe if line.lstrip().startswith("[!]")) == 2
    assert sum(1 for line in severe if line.lstrip().startswith("Fix:")) == 1


def test_busy_background_reviews_but_does_not_block():
    """A caption over a photograph measures the same spread as a title dropped
    on a baked-in headline, and the first is a design templates ship - so this
    one asks for a look instead of failing the deck. `text_over_artwork` is the
    blocking version, and it reads the picture's own pixels."""
    on_artwork = [C.ShapeContrast(3, 8.0, WHITE, BLACK, 6, 0.92)]
    severe, review, blockers = C.contrast_lines(on_artwork, lambda sid: f"#{sid}")
    assert blockers == 0
    assert not severe
    assert any("sits on a picture" in line for line in review)
    # A legible shape on a flat background says nothing at all.
    flat = [C.ShapeContrast(3, 8.0, WHITE, BLACK, 6, 0.0)]
    assert C.contrast_lines(flat, lambda sid: f"#{sid}") == ([], [], 0)


def test_unreadable_still_blocks_when_it_also_sits_on_a_picture():
    both = [C.ShapeContrast(3, 1.2, NAVY, BLACK, 6, 0.9)]
    severe, review, blockers = C.contrast_lines(both, lambda sid: f"#{sid}")
    assert blockers == 1
    assert any("unreadable" in line for line in severe)
    assert any("sits on a picture" in line for line in review)


def run():
    failures = 0
    for name, fn in sorted(globals().items()):
        if not name.startswith("test_") or not callable(fn):
            continue
        try:
            fn()
            print(f"  ok   {name}")
        except AssertionError as err:
            failures += 1
            print(f"  FAIL {name}: {err}")
    return failures


if __name__ == "__main__":
    sys.exit(1 if run() else 0)

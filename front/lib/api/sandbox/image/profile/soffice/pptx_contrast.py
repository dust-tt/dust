"""Is each text box's copy readable against whatever renders behind it?

python-pptx can report the colour a run declares, but never the colour that ends
up behind it: the background comes from the master, a full-bleed picture on the
layout, a shape underneath, or a gradient, and a text box the model adds outside
a placeholder inherits the presentation default (usually near-black) whatever the
slide looks like. Dark-on-dark is the single most common way an edited deck ships
unreadable, and no amount of XML reading finds it.

The rendered page has all of that resolved, and the PDF the render pipeline
already produced carries every word's exact rectangle - so contrast is measured
where the glyphs actually landed. Sampling a WORD box rather than the shape box
is what makes it reliable: in a half-empty 4-inch shape box the glyph pixels are
a fraction of a percent of the area and any "minority colour" estimator misses
them, while inside a word box the ink is a solid fifth of the pixels.
"""

from __future__ import annotations

from collections import Counter
from statistics import median
from typing import Dict, List, NamedTuple, Optional, Sequence, Tuple

import pdf_text

# WCAG contrast ratios. Measured across our template corpus: text rendering in
# the same colour family as its background lands at 1.1-1.6, a brand colour used
# deliberately (white on the Eramet orange, white on the Doctolib blue) at
# 2.0-2.9, and ordinary legible copy well above that. The block threshold sits
# in the empty gap between the first two - blocking a brand pairing the template
# itself ships would just push the model into recolouring the brand.
CONTRAST_BLOCK = 1.8
CONTRAST_WARN = 3.0

# Quantise to 5 bits/channel before counting: JPEG noise and antialiasing spread
# one flat colour over dozens of exact RGB values.
_QUANT = 3
# The ink is read as a luminance percentile, not as "the second most common
# colour": antialiasing smears a word's 25%-of-the-box ink over ~150 quantised
# buckets, none of them individually more than ~3% of the pixels, so any
# per-bucket frequency floor throws the glyphs away and calls black-on-white
# 1.05:1. A percentile keeps the whole smear and is still robust to a stray
# bright pixel from a bullet or a photo edge clipped into the box.
_INK_PERCENTILE = 0.03


# How far a shape's per-word background luminance may range before the copy is
# sitting on a picture rather than on a background. Measured across the corpus:
# text on a flat fill or a brand gradient ranges 0.00-0.01, text printed over a
# background image that carries its own headline ranges 0.5-0.9. Nothing lands
# in between, on any deck we have.
BUSY_BG_SPREAD = 0.25
# Below this many rendered words the range is noise, not a background.
BUSY_BG_MIN_WORDS = 3


class ShapeContrast(NamedTuple):
    shape_id: int
    ratio: float
    bg: Tuple[int, int, int]
    ink: Tuple[int, int, int]
    words: int
    bg_spread: float


def _channel(value: int) -> float:
    v = value / 255.0
    return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4


def relative_luminance(rgb: Sequence[int]) -> float:
    return (
        0.2126 * _channel(rgb[0])
        + 0.7152 * _channel(rgb[1])
        + 0.0722 * _channel(rgb[2])
    )


def contrast_ratio(a: Sequence[int], b: Sequence[int]) -> float:
    la, lb = relative_luminance(a), relative_luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def hex_colour(rgb: Sequence[int]) -> str:
    return "#%02X%02X%02X" % (rgb[0], rgb[1], rgb[2])


def _word_contrast(
    image, width: int, height: int, box_px: Tuple[int, int, int, int]
) -> Optional[Tuple[float, Tuple[int, int, int], Tuple[int, int, int]]]:
    """Contrast of one rendered word: the box's modal colour is the background
    (glyphs never dominate even a tight word box), and the ink is whichever
    other colour sits furthest from it in luminance."""
    x0, y0, x1, y1 = box_px
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(width, x1), min(height, y1)
    if x1 - x0 < 2 or y1 - y0 < 2:
        return None
    crop = image.crop((x0, y0, x1, y1))
    tallied = crop.getcolors(1 << 20)
    if not tallied:
        return None
    counts: Counter = Counter()
    for count, colour in tallied:
        counts[((colour[0] >> _QUANT) << _QUANT,
                (colour[1] >> _QUANT) << _QUANT,
                (colour[2] >> _QUANT) << _QUANT)] += count
    total = sum(counts.values())
    if not total:
        return None
    bg, _ = counts.most_common(1)[0]
    bg_lum = relative_luminance(bg)
    # Walk the buckets outward from the background's luminance and stop once
    # enough pixels have been taken to be glyphs rather than noise.
    ordered = sorted(
        counts.items(),
        key=lambda item: -abs(relative_luminance(item[0]) - bg_lum),
    )
    quota = max(4, int(total * _INK_PERCENTILE))
    taken = 0
    ink = ordered[0][0]
    for colour, count in ordered:
        ink = colour
        taken += count
        if taken >= quota:
            break
    return contrast_ratio(ink, bg), bg, ink


def _inside(word: pdf_text.WordBox, box: Optional[Tuple[int, int, int, int]]) -> bool:
    if box is None:
        return False
    left, top, right, bottom = box
    cx = (word.left + word.right) / 2
    cy = (word.top + word.bottom) / 2
    return left <= cx <= right and top <= cy <= bottom


def shape_contrasts(
    image_path,
    words: Optional[List[pdf_text.WordBox]],
    shapes: Sequence[Tuple[int, Tuple[int, int, int, int], set]],
    slide_w_emu: int,
    slide_h_emu: int,
) -> List[ShapeContrast]:
    """Per text shape, the median contrast of its rendered words.

    `shapes` is the (id, declared_box_emu, token_set) triple the collision
    detector already builds; words are attributed with the same
    `pdf_text.attribute_word` so a word that spilled outside its own box is still
    scored against the shape that owns it. Median, not min: one word crossing a
    photo should not condemn a paragraph, while a box whose whole copy is the
    wrong colour fails on every word.
    """
    if not words or not shapes or not slide_w_emu or not slide_h_emu:
        return []
    try:
        from PIL import Image

        with Image.open(image_path) as raw:
            image = raw.convert("RGB")
    except (OSError, ValueError, ImportError):
        return []
    width, height = image.size
    boxes = {s[0]: s[1] for s in shapes}
    per_shape: Dict[int, List[Tuple[float, Tuple[int, int, int], Tuple[int, int, int]]]] = {}
    for word in words:
        sid, strong = pdf_text.attribute_word(word, shapes)
        if sid is None:
            continue
        if not strong and not _inside(word, boxes.get(sid)):
            # The weak fallback attributes every word to its nearest box,
            # including words this deck's shape list never tokenised (table
            # cells, curve-exported runs). Scoring those against an unrelated
            # shape would poison its median, so only keep a weak match that
            # actually landed inside the box it was assigned to.
            continue
        box_px = (
            int(word.left / slide_w_emu * width),
            int(word.top / slide_h_emu * height),
            int(word.right / slide_w_emu * width) + 1,
            int(word.bottom / slide_h_emu * height) + 1,
        )
        sample = _word_contrast(image, width, height, box_px)
        if sample is None:
            continue
        per_shape.setdefault(sid, []).append(sample)

    out: List[ShapeContrast] = []
    for sid, samples in per_shape.items():
        ratios = [s[0] for s in samples]
        mid = median(ratios)
        # Report the colours of the sample closest to the median so the pair the
        # model is told to fix is one that actually rendered.
        representative = min(samples, key=lambda s: abs(s[0] - mid))
        backgrounds = sorted(relative_luminance(s[1]) for s in samples)
        spread = (
            backgrounds[-1] - backgrounds[0]
            if len(backgrounds) >= BUSY_BG_MIN_WORDS
            else 0.0
        )
        out.append(
            ShapeContrast(
                sid, mid, representative[1], representative[2], len(samples),
                spread,
            )
        )
    return sorted(out, key=lambda c: c.ratio)


def contrast_lines(
    contrasts: Sequence[ShapeContrast], label
) -> Tuple[List[str], List[str], int]:
    """Split contrast findings into ([!] blockers, [w] reviews, blocker count).
    `label` renders a shape id as `#id "text"` for the message."""
    severe: List[str] = []
    review: List[str] = []
    unreadable = [c for c in contrasts if c.ratio < CONTRAST_BLOCK]
    busy = [c for c in contrasts if c.bg_spread >= BUSY_BG_SPREAD]

    for c in unreadable:
        severe.append(
            f"  [!] {label(c.shape_id)} unreadable - {hex_colour(c.ink)} on "
            f"{hex_colour(c.bg)} ({c.ratio:.1f}:1, needs {CONTRAST_WARN:.0f}:1)."
        )
    if unreadable:
        # One hint for the group: the cause is always the same and repeating it
        # per finding buries the findings.
        severe.append(
            "      Fix: set an explicit font colour on each of those runs. A "
            "text box added outside a placeholder inherits the presentation "
            "default (near-black), whatever the slide's background is - copy "
            "the colour from a template placeholder on the same background."
        )

    for c in busy:
        severe.append(
            f"  [!] {label(c.shape_id)} sits on a picture, not on a background "
            f"- what renders behind its words ranges across {c.bg_spread:.0%} "
            "of the luminance scale."
        )
    if busy:
        severe.append(
            "      Fix: text printed over a picture that carries its own "
            "artwork or headline reads as a mess whatever colour it is. Delete "
            "the picture, move the text clear of it, or clone an exemplar built "
            "to hold text."
        )

    for c in contrasts:
        if c.ratio < CONTRAST_BLOCK or c.bg_spread >= BUSY_BG_SPREAD:
            continue
        if c.ratio < CONTRAST_WARN:
            review.append(
                f"  [w] {label(c.shape_id)} thin - {hex_colour(c.ink)} on "
                f"{hex_colour(c.bg)} ({c.ratio:.1f}:1). Fine for a large "
                "heading, hard to read at body size."
            )

    blocked = {c.shape_id for c in unreadable} | {c.shape_id for c in busy}
    return severe, review, len(blocked)

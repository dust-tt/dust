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
from pptx_render_boxes import _text_row_centers

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


# Rows of glyphs the background picture already carries under a text box, at or
# above which the model has printed its copy on top of somebody else's. Measured
# across the corpus: a caption over a photograph registers at most 1 row of false
# edges (foliage, a horizon, a face), while a title dropped onto a template's
# baked-in headline registers 2 or 3 real ones.
ARTWORK_TEXT_ROWS = 2


def text_over_artwork(slide, blob_reader):
    """Text shapes printed over a picture that carries its own text: [(sid, rows)].

    The template's title slide usually bakes its headline and logo into the
    background raster. Text dropped on top of that overprints words no check can see:
    they are pixels, not runs, so there is no collision to confirm, no contrast
    to measure and no overlap worth reporting. Reading the picture's OWN pixels
    under the text box is the only place the evidence exists.

    `blob_reader(shape)` returns the shape's image bytes, or None.
    """
    try:
        from PIL import Image
    except ImportError:
        return []
    import io

    pics, texts = [], []
    for shape in slide.shapes:
        if None in (shape.left, shape.top, shape.width, shape.height):
            continue
        if shape.width <= 0 or shape.height <= 0:
            continue
        blob = blob_reader(shape)
        if blob is not None:
            pics.append((shape, blob))
        elif getattr(shape, "has_text_frame", False) and shape.text_frame.text.strip():
            texts.append(shape)

    out = []
    for text in texts:
        for pic, blob in pics:
            inside = (
                pic.left <= text.left
                and pic.top <= text.top
                and pic.left + pic.width >= text.left + text.width
                and pic.top + pic.height >= text.top + text.height
            )
            if not inside:
                continue
            try:
                with Image.open(io.BytesIO(blob)) as raw:
                    image = raw.convert("RGB")
            except (OSError, ValueError):
                continue
            width, height = image.size
            box = (
                (text.left - pic.left) / pic.width * width,
                (text.top - pic.top) / pic.height * height,
                (text.left + text.width - pic.left) / pic.width * width,
                (text.top + text.height - pic.top) / pic.height * height,
            )
            rows = _text_row_centers(image, box)
            if len(rows) >= ARTWORK_TEXT_ROWS:
                out.append((text.shape_id, pic.shape_id, len(rows)))
                break
    return out


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

    # Review, not a blocker: a caption over a photograph measures the same as a
    # title dropped on a baked-in headline, and the first is a design the
    # template itself ships. `text_over_artwork` is the blocking version - it
    # reads the picture's own pixels and only fires when there are real glyphs
    # under the copy.
    for c in busy:
        review.append(
            f"  [w] {label(c.shape_id)} sits on a picture, not on a background "
            f"- what renders behind its words ranges across {c.bg_spread:.0%} "
            "of the luminance scale. Read it in the render: over a photograph "
            "this wants a scrim or a clear area; over the template's own "
            "artwork it has to move."
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

    return severe, review, len({c.shape_id for c in unreadable})

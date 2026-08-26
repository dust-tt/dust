"""Read the renderer's exact word positions from the soffice-produced PDF.

python-pptx cannot lay out text, so the inspector estimates wrapping from
character counts - and that estimate is the source of false-positive collisions
(a title estimated to wrap onto a neighbour that actually fits on one line, two
wide boxes whose text sits in opposite halves). The PDF soffice already produced
for the raster render carries LibreOffice's exact per-word coordinates, so a
candidate collision can be CONFIRMED against where the glyphs really landed
instead of where an estimate guessed.

Uses poppler's ``pdftotext -bbox`` - the same poppler that provides the
``pdftoppm`` the render pipeline already shells out to - and parses its XHTML
with the stdlib. Coordinates come back in EMU so they compare directly against
python-pptx shape boxes.
"""
from __future__ import annotations

import html
import re
import subprocess
from pathlib import Path
from typing import List, NamedTuple, Optional

EMU_PER_INCH = 914_400
EMU_PER_POINT = EMU_PER_INCH // 72  # 12700; pdftotext -bbox coords are in points

# Vertical overlap (as a share of the shorter word's height) at or above which
# two rendered words are judged to actually overprint. Two adjacent text lines
# share only their line-leading - empirically ~0.48 of a line height in
# LibreOffice's PDF output - while text wrapped on top of text overlaps ~1.00, so
# a 0.7 cut sits in the wide gap between "tight neighbours" and "real overprint".
OVERPRINT_Y_FRACTION = 0.7


class WordBox(NamedTuple):
    left: int  # EMU
    top: int  # EMU
    right: int  # EMU
    bottom: int  # EMU
    text: str


_PAGE_RE = re.compile(r'<page width="[\d.]+" height="[\d.]+">(.*?)</page>', re.S)
_WORD_RE = re.compile(
    r'<word xMin="([\d.]+)" yMin="([\d.]+)" '
    r'xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>',
    re.S,
)


def _parse_bbox(xhtml: str) -> Optional[List[WordBox]]:
    """Parse one page of ``pdftotext -bbox`` XHTML into word boxes (EMU). None
    when the output has no <page> at all (parse failure); an empty list when the
    page simply rendered no extractable text."""
    pages = _PAGE_RE.findall(xhtml)
    if not pages:
        return None
    out: List[WordBox] = []
    for m in _WORD_RE.finditer(pages[0]):
        x0, y0, x1, y1 = (float(g) for g in m.groups()[:4])
        out.append(
            WordBox(
                int(round(x0 * EMU_PER_POINT)),
                int(round(y0 * EMU_PER_POINT)),
                int(round(x1 * EMU_PER_POINT)),
                int(round(y1 * EMU_PER_POINT)),
                html.unescape(m.group(5)),
            )
        )
    return out


def page_word_boxes(pdf_path: Path, page_idx: int) -> Optional[List[WordBox]]:
    """Word boxes (EMU) for 1-indexed ``page_idx`` of ``pdf_path``, or None when
    the PDF text can't be read (pdftotext missing / failure). An empty list means
    the page rendered no extractable text (e.g. text exported as curves), which
    the caller must treat as "could not confirm", not "no collision"."""
    try:
        proc = subprocess.run(
            [
                "pdftotext", "-bbox",
                "-f", str(page_idx), "-l", str(page_idx),
                str(pdf_path), "-",
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if proc.returncode != 0:
        return None
    parsed = _parse_bbox(proc.stdout)
    return parsed if parsed is not None else []


def overprint_fraction(a: WordBox, b: WordBox) -> float:
    """Vertical overlap of two words as a share of the shorter one's height, but
    only when they also overlap horizontally (else 0.0). 1.0 means one word is
    rendered on top of the other; ~0.48 is the line-leading two stacked lines
    share; 0.0 means they are side by side or vertically clear."""
    if min(a.right, b.right) - max(a.left, b.left) <= 0:
        return 0.0
    iy = min(a.bottom, b.bottom) - max(a.top, b.top)
    if iy <= 0:
        return 0.0
    shorter = min(a.bottom - a.top, b.bottom - b.top)
    return iy / shorter if shorter > 0 else 0.0


def words_overprint(
    a: WordBox, b: WordBox, y_fraction: float = OVERPRINT_Y_FRACTION
) -> bool:
    """Whether two rendered words actually sit on top of each other."""
    return overprint_fraction(a, b) >= y_fraction


# 0.05in: a word whose box pokes past its shape's declared box by more than this
# has spilled - used to name the overflowing shape ("over") in a collision.
_SPILL_EPS_EMU = EMU_PER_INCH // 20


def norm_token(word: str) -> str:
    """A word reduced to a comparison token: lowercased, leading/trailing
    punctuation stripped ("done." -> "done") so a python-pptx run word and the
    same word from the PDF compare equal. Unicode letters are kept."""
    return re.sub(r"^\W+|\W+$", "", word).lower()


# A shape, for attribution: (shape_id, (left, top, right, bottom) EMU, token_set).
def attribute_word(word, shapes):
    """Attribute a rendered word to a shape: (shape_id, strong). STRONG = the
    word's token matches exactly one shape's text - trustworthy even when the
    word spilled outside its own box, because membership beats position there.
    WEAK = a nearest-box fallback for a common or unmatched token, which must NOT
    be trusted for a cross-shape collision or it fabricates one (a superscript's
    base digit "1" matching an unrelated "1 line title", etc.)."""
    t = norm_token(word.text)
    cands = [s for s in shapes if t and t in s[2]]
    if len(cands) == 1:
        return cands[0][0], True
    pool = cands if cands else shapes
    if not pool:
        return None, False
    cx = (word.left + word.right) / 2
    cy = (word.top + word.bottom) / 2

    def dist2(s):
        left, top, right, bottom = s[1]
        dx = max(left - cx, 0, cx - right)
        dy = max(top - cy, 0, cy - bottom)
        return dx * dx + dy * dy

    return min(pool, key=dist2)[0], False


def _vert_outside(word, box) -> bool:
    _, top, _, bottom = box
    return word.top < top - _SPILL_EPS_EMU or word.bottom > bottom + _SPILL_EPS_EMU


def cross_shape_overprints(words, shapes, y_fraction: float = OVERPRINT_Y_FRACTION):
    """Confirmed text-on-text collisions read straight off the rendered word
    positions: pairs of words attributed (STRONGLY) to DIFFERENT shapes whose
    boxes overprint (vertical overlap >= y_fraction, horizontal overlap > 0). One
    dict per colliding shape pair (worst pair kept):
        {over, hit, symmetric, frac, word_over, word_hit}
    where over is the overflowing shape (its word spilled outside its own box)
    and hit the one it landed on; symmetric=True when neither clearly spilled
    (e.g. two boxes dropped on the same spot) and over/hit are then just the pair.

    Cross-shape + strong-only is the whole design: same-run overlaps (superscripts
    "1ˢᵗ", footnote markers "80.2%*", emoji beside a label) never qualify, and a
    weak nearest-box guess can't drag in a false pair."""
    boxes = {s[0]: s[1] for s in shapes}
    assigned = []
    for w in words:
        sid, strong = attribute_word(w, shapes)
        if sid is not None and strong:
            assigned.append((w, sid))

    best = {}  # (lo_id, hi_id) -> (frac, word_lo, word_hi)
    # O(n^2) over a single slide's strongly-attributed words (n is small).
    for i in range(len(assigned)):
        wi, si = assigned[i]
        for j in range(i + 1, len(assigned)):
            wj, sj = assigned[j]
            if si == sj:
                continue
            f = overprint_fraction(wi, wj)
            if f < y_fraction:
                continue
            if si < sj:
                key, w_lo, w_hi = (si, sj), wi, wj
            else:
                key, w_lo, w_hi = (sj, si), wj, wi
            if key not in best or f > best[key][0]:
                best[key] = (f, w_lo, w_hi)

    out = []
    for (lo, hi), (f, w_lo, w_hi) in best.items():
        lo_out = lo in boxes and _vert_outside(w_lo, boxes[lo])
        hi_out = hi in boxes and _vert_outside(w_hi, boxes[hi])
        if lo_out and not hi_out:
            over, hit, w_over, w_hit, sym = lo, hi, w_lo, w_hi, False
        elif hi_out and not lo_out:
            over, hit, w_over, w_hit, sym = hi, lo, w_hi, w_lo, False
        else:
            over, hit, w_over, w_hit, sym = lo, hi, w_lo, w_hi, True
        out.append({
            "over": over, "hit": hit, "symmetric": sym, "frac": f,
            "word_over": w_over.text, "word_hit": w_hit.text,
        })
    return out


# A rendered word must poke at least this far past its OWN box's side before the
# box is judged to not contain its text. Generous on purpose: LibreOffice
# substitutes the deck's real (often absent) font and substitutes run wide, so a
# small horizontal spill is a render artefact, not a defect.
_SELF_OVERFLOW_H_EPS_EMU = EMU_PER_INCH // 10  # ~0.10in
# Floor for the vertical gate; the real gate is half the word's own height so it
# scales with the type size - a whole wrapped line dropping below the box clears
# it, a descender or a tall substitute glyph does not.
_SELF_OVERFLOW_V_FLOOR_EMU = EMU_PER_INCH // 12  # ~0.08in

# Longest edge first so the reported edge is deterministic when a word clears the
# gate on more than one side.
_OVERFLOW_EDGES = ("below", "above", "right", "left")


def self_overflows(words, shapes):
    """Shapes whose OWN rendered text lands outside their OWN declared box - the
    box doesn't contain its text (a wrapped line dropped below a one-line box,
    copy running past a side). Read straight off the rendered word positions with
    STRONG attribution only, same as cross_shape_overprints, so short/common
    tokens can't fabricate an overflow. One dict per shape (worst edge kept):
        {sid, edge, over_in, word}
    where edge is 'below' | 'above' | 'right' | 'left' and over_in is how far
    (inches) the text extends past that edge.

    This is self-contained overflow into whatever space surrounds the box; a
    spill that lands on ANOTHER shape's text is a cross_shape_overprints
    collision instead, and the caller drops any shape already named there."""
    boxes = {s[0]: s[1] for s in shapes}
    worst = {}  # sid -> (over_emu, edge, word_text)
    for w in words:
        sid, strong = attribute_word(w, shapes)
        if sid is None or not strong or sid not in boxes:
            continue
        left, top, right, bottom = boxes[sid]
        v_gate = max(_SELF_OVERFLOW_V_FLOOR_EMU, (w.bottom - w.top) // 2)
        by_edge = {
            "below": (w.bottom - bottom, v_gate),
            "above": (top - w.top, v_gate),
            "right": (w.right - right, _SELF_OVERFLOW_H_EPS_EMU),
            "left": (left - w.left, _SELF_OVERFLOW_H_EPS_EMU),
        }
        for edge in _OVERFLOW_EDGES:
            over, gate = by_edge[edge]
            if over >= gate and (sid not in worst or over > worst[sid][0]):
                worst[sid] = (over, edge, w.text)
    return [
        {"sid": sid, "edge": edge, "over_in": over / EMU_PER_INCH, "word": word}
        for sid, (over, edge, word) in worst.items()
    ]


# A shape must declare at least this many words before a shortfall means
# anything: on a two-word label one unattributed word looks like 50% loss.
CLIP_MIN_WORDS = 6
# Below this share of its words actually rendered, the box is clipping its text.
# Half, not three-quarters: when several shapes hold identical copy the word
# attribution cannot split them cleanly, and a modest shortfall is that rather
# than a clip. A box drawing under half its words - usually none of them - is
# unambiguous.
CLIP_RENDERED_RATIO = 0.5


def clipped_shapes(words, shapes, declared_counts, page_has_text: bool = True):
    """Shapes whose text the renderer did not draw in full: [{sid, declared,
    rendered}].

    Distinct from an overflow. When a box is too small for its copy the renderer
    either spills the text outside the box - which `self_overflows` catches by
    finding words beyond it - or CLIPS it, drawing nothing past the boundary. In
    the clipped case there is no stray word to find and no overlap to flag: the
    tail of the sentence simply is not on the slide, and every geometric check
    reads the slide as fine. Counting the words that actually rendered against
    the words the shape holds is the only thing that sees it.
    """
    if not words or not shapes or not page_has_text:
        return []
    rendered: dict = {}
    for word in words:
        sid, _strong = attribute_word(word, shapes)
        if sid is not None:
            rendered[sid] = rendered.get(sid, 0) + 1
    out = []
    for sid, _box, _tokens in shapes:
        declared = declared_counts.get(sid, 0)
        if declared < CLIP_MIN_WORDS:
            continue
        drawn = rendered.get(sid, 0)
        if drawn < declared * CLIP_RENDERED_RATIO:
            out.append({"sid": sid, "declared": declared, "rendered": drawn})
    return out

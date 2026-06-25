"""Geometry primitives for pptx_inspect: EMU/box math, the text-fit estimate,
and the overlap classifier, plus the shared geometry thresholds.

The no-dependency layer of the inspector — pure box math over python-pptx shapes,
importing nothing from the other pptx_* modules — so audit/render can build on it
without an import cycle.
"""
from __future__ import annotations

from typing import NamedTuple, Optional, Tuple

from pptx.enum.text import MSO_AUTO_SIZE
from pptx.shapes.base import BaseShape

EMU_PER_INCH = 914_400
EDGE_EPSILON_EMU = 45_720  # 0.05" tolerance before flagging edge overflow.

# Text-fit estimation. What decides whether text fits is the box geometry at
# the chosen font size, not the word count — so we estimate how many characters
# a box holds and surface it, to stop the agent sizing text blindly. It is a
# rough ESTIMATE (real wrapping depends on glyph metrics / line spacing we don't
# reproduce), so the overset warning only fires on GROSS overflow of a genuine
# multi-line container, never on a box short enough to be a nominal-height label
# (text overflows those by design) or one set to grow to fit its text.
CHAR_WIDTH_EM = 0.5  # avg proportional Latin glyph advance, in em
LINE_HEIGHT_FACTOR = 1.2  # typical single line height, in em
TEXTBOX_MARGIN_W_IN = 0.2  # PowerPoint default internal left+right inset
TEXTBOX_MARGIN_H_IN = 0.1  # PowerPoint default internal top+bottom inset
OVERSET_TOLERANCE = 1.8  # flag only when text exceeds capacity by this factor
FILL_FLOATING = 0.30  # text using less than this fraction of a real box "floats"

ASPECT_TOLERANCE = 1.18  # flag image stretch/squish beyond ~15%
MIN_IMAGE_DPI = 70  # flag pictures displayed below this effective resolution
# Overlap classification. Overlap is often intentional (a label on a photo, a
# caption on a pill), so raw intersection is not a defect. We separate three
# cases by per-box containment (intersection / each box's area):
#   - both boxes >= STACKED_CONT covered  -> the boxes coincide (STACKED): a
#     real bug (e.g. a title and body dropped at the same spot) -> [!] blocker.
#   - one box >= CONTAINMENT_TAU inside the other -> foreground on background
#     (caption on a photo, text on a pill): intentional -> suppressed.
#   - otherwise, shallower-axis overlap >= PEER_PENETRATION_EMU -> a partial
#     peer overlap: could be a designed overlay or an accidental collision, so
#     it is surfaced as a quantitative [i] ADVISORY (judge it in the render),
#     never a hard blocker — that would fail the template's own overlays.
STACKED_CONT = 0.90  # both boxes >= this covered => effectively the same box
CONTAINMENT_TAU = 0.85  # one box >= this fraction inside the other => fg/bg, ok
PEER_PENETRATION_EMU = EMU_PER_INCH // 10  # 0.1" shallow-axis overlap to note it
CENTER_OFFSET_EMU = int(EMU_PER_INCH * 0.2)  # inner box off-center beyond this => advisory
SAFE_MARGIN_EMU = int(EMU_PER_INCH * 0.2)  # text crowding within this of an edge => advisory
FULL_SPAN = 0.9  # a shape covering >= this fraction of a slide axis is a banner/background


def emu_to_inches(emu: Optional[int]) -> Optional[float]:
    if emu is None:
        return None
    return emu / EMU_PER_INCH


def format_box(shape: BaseShape) -> str:
    left = emu_to_inches(shape.left)
    top = emu_to_inches(shape.top)
    width = emu_to_inches(shape.width)
    height = emu_to_inches(shape.height)
    if None in (left, top, width, height):
        return "(?,?)"
    return f"({left:.1f},{top:.1f}) {width:.1f}x{height:.1f}\""


class FitEstimate(NamedTuple):
    chars_per_line: int
    capacity: Optional[int]  # total chars; None when height isn't a real constraint


def _frame_text_len(shape: BaseShape) -> int:
    if not shape.has_text_frame:
        return 0
    return sum(len(p.text or "") for p in shape.text_frame.paragraphs)


def _fit_estimate(shape: BaseShape, size_pt: float) -> Optional[FitEstimate]:
    if shape.width is None or shape.height is None or size_pt <= 0:
        return None
    w_in = shape.width / EMU_PER_INCH
    h_in = shape.height / EMU_PER_INCH
    char_w = size_pt * CHAR_WIDTH_EM / 72.0
    line_h = size_pt * LINE_HEIGHT_FACTOR / 72.0
    if char_w <= 0 or line_h <= 0:
        return None
    cpl = int(max(0.0, w_in - TEXTBOX_MARGIN_W_IN) / char_w)
    lines = int(max(0.0, h_in - TEXTBOX_MARGIN_H_IN) / line_h)
    if cpl < 1:
        return None
    # Height constrains only genuine multi-line containers; a box shorter than
    # ~2 lines is a nominal-height label whose text overflows by design.
    capacity = cpl * lines if lines >= 2 else None
    return FitEstimate(cpl, capacity)


def _grows_to_fit(shape: BaseShape) -> bool:
    return (
        shape.has_text_frame
        and shape.text_frame.auto_size == MSO_AUTO_SIZE.SHAPE_TO_FIT_TEXT
    )


def _classify_overlap(a: Tuple[int, int, int, int],
                      b: Tuple[int, int, int, int]):
    """Classify the overlap of two (left, top, width, height) boxes.
    Returns (kind, penetration_emu, axis):
      - ("stacked", 0, "")     both boxes >= STACKED_CONT covered (coincide)
      - ("contained", 0, "")   one box >= CONTAINMENT_TAU inside the other (fg/bg)
      - ("peer", pen, axis)    partial overlap >= PEER_PENETRATION_EMU on the
                               shallow axis (a designed overlay or a collision)
      - (None, 0, "")          no/negligible overlap
    Shared by the --slide text lint and the --render overlap shading so both
    agree on what counts as a collision."""
    al, at, aw, ah = a
    bl, bt, bw, bh = b
    if min(aw, ah, bw, bh) <= 0:
        return (None, 0, "")
    ix = min(al + aw, bl + bw) - max(al, bl)
    iy = min(at + ah, bt + bh) - max(at, bt)
    if ix <= 0 or iy <= 0:
        return (None, 0, "")
    inter = ix * iy
    cont_a = inter / (aw * ah)
    cont_b = inter / (bw * bh)
    if min(cont_a, cont_b) >= STACKED_CONT:
        return ("stacked", 0, "")
    if max(cont_a, cont_b) >= CONTAINMENT_TAU:
        return ("contained", 0, "")
    if min(ix, iy) >= PEER_PENETRATION_EMU:
        return ("peer", min(ix, iy), "horizontally" if ix < iy else "vertically")
    return (None, 0, "")

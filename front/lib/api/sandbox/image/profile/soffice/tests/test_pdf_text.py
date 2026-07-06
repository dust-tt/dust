"""Tests for pdf_text: parsing pdftotext -bbox output and the overprint metric.

The subprocess path (page_word_boxes) is exercised by the live --qa runs; here we
cover the pure pieces — XHTML parsing and the word-overlap geometry — that decide
whether a candidate collision is a real overprint."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pdf_text as P  # noqa: E402

EMU = P.EMU_PER_POINT


def W(l, t, r, b, text="x"):
    return P.WordBox(l, t, r, b, text)


def test_parse_bbox_reads_words_in_emu():
    xhtml = (
        '<page width="720.0" height="405.0">\n'
        '<word xMin="10" yMin="20" xMax="50" yMax="40">Hello</word>\n'
        '<word xMin="60" yMin="20" xMax="100" yMax="40">World&amp;Co</word>\n'
        "</page>"
    )
    words = P._parse_bbox(xhtml)
    assert words is not None and len(words) == 2
    assert words[0] == P.WordBox(10 * EMU, 20 * EMU, 50 * EMU, 40 * EMU, "Hello")
    assert words[1].text == "World&Co"  # entities unescaped


def test_parse_bbox_none_without_page():
    assert P._parse_bbox("<html><body>no page here</body></html>") is None


def test_parse_bbox_empty_page_is_empty_list():
    assert P._parse_bbox('<page width="720" height="405"></page>') == []


def test_overprint_fraction_full_when_stacked_on_top():
    # one word rendered on top of another -> ~full vertical overlap.
    assert P.overprint_fraction(W(0, 0, 100, 40), W(10, 2, 110, 42)) >= 0.9


def test_overprint_fraction_low_for_adjacent_lines():
    # the next line down: boxes share only leading -> well under the threshold.
    f = P.overprint_fraction(W(0, 0, 100, 40), W(0, 30, 100, 70))
    assert 0 < f < P.OVERPRINT_Y_FRACTION
    assert not P.words_overprint(W(0, 0, 100, 40), W(0, 30, 100, 70))


def test_overprint_fraction_zero_when_side_by_side():
    # same row, disjoint columns (PLANS | SCALE UP) -> no horizontal overlap.
    assert P.overprint_fraction(W(0, 0, 40, 40), W(50, 0, 90, 40)) == 0.0


def test_words_overprint_true_when_coincident():
    assert P.words_overprint(W(0, 0, 100, 40), W(5, 0, 105, 40))


# --- attribution + cross-shape detection (in EMU; helpers take inches) ---
IN = P.EMU_PER_INCH


def wb(l, t, r, b, text):
    return P.WordBox(int(l * IN), int(t * IN), int(r * IN), int(b * IN), text)


def shp(sid, l, t, r, b, toks):
    return (sid, (int(l * IN), int(t * IN), int(r * IN), int(b * IN)), set(toks))


def test_attribute_unique_token_is_strong_even_when_spilled():
    shapes = [shp(1, 0, 0, 1, 1, {"unique", "work"}), shp(2, 2, 2, 3, 3, {"other"})]
    # word sitting over shape 2's area but its token is unique to shape 1
    assert P.attribute_word(wb(2.1, 2.1, 2.5, 2.5, "unique"), shapes) == (1, True)
    # unmatched token -> weak, nearest box (shape 2)
    assert P.attribute_word(wb(2.1, 2.1, 2.5, 2.5, "zzz"), shapes) == (2, False)


def test_cross_shape_spill_is_a_collision():
    # title (#1) word "done" renders DOWN inside the subtitle (#2) box, but token
    # membership keeps it on #1 -> cross-shape overprint, #1 named the overflower.
    shapes = [shp(1, 0, 0, 1, 0.5, {"work", "done"}),
              shp(2, 0, 0.6, 1, 1.1, {"multiplayer", "ai"})]
    words = [wb(0.1, 0.7, 0.4, 1.0, "done"), wb(0.12, 0.72, 0.6, 1.02, "multiplayer")]
    res = P.cross_shape_overprints(words, shapes)
    assert len(res) == 1
    c = res[0]
    assert (c["over"], c["hit"], c["symmetric"]) == (1, 2, False)
    assert c["word_over"] == "done" and c["word_hit"] == "multiplayer"


def test_cross_shape_same_shape_overprint_ignored():
    # two of one shape's own words overlapping (its text mashing itself) is not a
    # cross-shape collision -> excluded (this is the superscript/marker class).
    shapes = [shp(1, 0, 0, 1, 0.5, {"alpha", "beta"})]
    words = [wb(0.1, 0.1, 0.4, 0.4, "alpha"), wb(0.12, 0.12, 0.5, 0.42, "beta")]
    assert P.cross_shape_overprints(words, shapes) == []


def test_cross_shape_weak_attribution_excluded():
    # mirrors the real superscript FP: "1" uniquely matches an unrelated "1 line"
    # shape (strong) while "st" only nearest-boxes (weak) -> pair dropped.
    shapes = [shp(1, 0, 0, 1, 0.5, {"1st", "level"}),
              shp(2, 2, 0, 3, 0.5, {"1", "line"})]
    words = [wb(0.1, 0.05, 0.2, 0.3, "1"), wb(0.12, 0.05, 0.25, 0.28, "st")]
    assert P.cross_shape_overprints(words, shapes) == []


def test_cross_shape_side_by_side_not_a_collision():
    # PLANS (left) | SCALE (right): boxes/words disjoint horizontally -> no overprint.
    shapes = [shp(1, 0, 0, 0.4, 0.4, {"plans"}), shp(2, 0.5, 0, 0.9, 0.4, {"scale"})]
    words = [wb(0.1, 0.1, 0.3, 0.3, "plans"), wb(0.6, 0.1, 0.8, 0.3, "scale")]
    assert P.cross_shape_overprints(words, shapes) == []


# --- self_overflows: a box that doesn't contain its OWN rendered text ---


def test_self_overflow_dropped_line_below_flagged():
    # a wrapped line rendered entirely below the box bottom (0.5in) -> "below".
    shapes = [shp(1, 0, 0, 1, 0.5, {"alpha"})]
    words = [wb(0.1, 0.6, 0.4, 0.9, "alpha")]
    res = P.self_overflows(words, shapes)
    assert len(res) == 1
    assert res[0]["sid"] == 1 and res[0]["edge"] == "below"
    assert round(res[0]["over_in"], 2) == 0.40  # word.bottom 0.9 - box bottom 0.5


def test_self_overflow_descender_poke_not_flagged():
    # a word dipping only 0.05in past the bottom (< the half-line/floor gate) is a
    # descender or a wide substitute glyph, not a dropped line -> ignored.
    shapes = [shp(1, 0, 0, 1, 0.5, {"alpha"})]
    words = [wb(0.1, 0.45, 0.4, 0.55, "alpha")]
    assert P.self_overflows(words, shapes) == []


def test_self_overflow_contained_word_clean():
    shapes = [shp(1, 0, 0, 1, 1, {"alpha"})]
    words = [wb(0.1, 0.1, 0.4, 0.4, "alpha")]
    assert P.self_overflows(words, shapes) == []


def test_self_overflow_weak_attribution_excluded():
    # an unmatched token only nearest-boxes (weak) -> not trusted for overflow,
    # same discipline as cross_shape_overprints.
    shapes = [shp(1, 0, 0, 1, 0.5, {"alpha"})]
    words = [wb(0.1, 0.6, 0.4, 0.9, "zzz")]
    assert P.self_overflows(words, shapes) == []


def test_self_overflow_right_edge_flagged():
    # copy running past a narrow box's right edge (0.5in) by 0.3in -> "right".
    shapes = [shp(1, 0, 0, 0.5, 1, {"alpha"})]
    words = [wb(0.55, 0.1, 0.8, 0.4, "alpha")]
    res = P.self_overflows(words, shapes)
    assert len(res) == 1 and res[0]["edge"] == "right"
    assert round(res[0]["over_in"], 2) == 0.30


def test_self_overflow_one_entry_per_shape_worst_kept():
    # two overflowing words for one shape -> a single finding, the worst kept.
    shapes = [shp(1, 0, 0, 1, 0.5, {"alpha", "beta"})]
    words = [wb(0.1, 0.55, 0.4, 0.75, "alpha"),  # 0.25in below
             wb(0.1, 0.60, 0.4, 0.95, "beta")]   # 0.45in below (worse)
    res = P.self_overflows(words, shapes)
    assert len(res) == 1
    assert res[0]["edge"] == "below" and res[0]["word"] == "beta"
    assert round(res[0]["over_in"], 2) == 0.45


if __name__ == "__main__":
    tests = [
        v for k, v in sorted(globals().items())
        if k.startswith("test_") and callable(v)
    ]
    for fn in tests:
        fn()
        print(f"ok   {fn.__name__}")
    print(f"\n{len(tests)} pdf_text tests passed")

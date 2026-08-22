"""Tier-2 tests for pptx_audit's signature deterministic logic: the content-slot
detector that powers the --compare spacer-fill blocker. Built on tiny
programmatic decks. The estimated lints (overlap/fit/image) live in geometry and
are covered there; the deck-fidelity gate is integration-tested by the golden
--compare view.

Run directly (`python test_audit.py`) or under pytest.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pptx import Presentation  # noqa: E402
from pptx.util import Inches  # noqa: E402

import pptx_audit as A  # noqa: E402


def box(content_idx, n_paras):
    """A textbox of n paragraphs with non-empty text only at content_idx."""
    prs = Presentation()
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    tb = slide.shapes.add_textbox(Inches(1), Inches(1), Inches(4), Inches(3))
    tf = tb.text_frame
    tf.text = "x" if 0 in content_idx else ""
    for i in range(1, n_paras):
        p = tf.add_paragraph()
        if i in content_idx:
            p.text = "x"
    return tb


def test_content_slot_indices():
    assert A._content_slot_indices(box({0, 2}, 4)) == {0, 2}


def test_spacer_write_detected():
    # template skeleton: content on even slots, spacers on odd; output filled
    # consecutively -> p1, p3 land in interior spacer slots
    src = box({0, 2, 4, 6, 8}, 10)
    out = box({0, 1, 2, 3}, 10)
    assert A._filled_spacer_slots(out, src) == {1, 3}


def test_no_spacer_write_when_fewer_items():
    # filling a subset of the template's own content slots is legitimate
    src = box({0, 2, 4, 6, 8}, 10)
    out = box({0, 2, 4}, 10)
    assert A._filled_spacer_slots(out, src) == set()


def test_no_spacer_write_for_simple_placeholder():
    # a template box with <2 content slots has no interior skeleton to violate
    src = box({0}, 3)
    out = box({0, 1}, 3)
    assert A._filled_spacer_slots(out, src) == set()


def test_spacer_write_only_counts_interior():
    # a slot past the template's last content row is not an interior spacer
    src = box({0, 2}, 6)        # content slots {0,2}, lo=0 hi=2
    out = box({0, 2, 4}, 6)     # p4 is beyond hi -> not flagged here
    assert A._filled_spacer_slots(out, src) == set()




def test_filler_detector_catches_lorem_past_its_opening_words():
    """A template's second and third filler paragraphs never say "lorem ipsum";
    matching only the opening words let four slides of untouched filler ship."""
    assert A._is_leftover_suspect("Lorem ipsum dolor sit amet, consectetur.")
    assert A._is_leftover_suspect(
        "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris."
    )
    assert A._is_leftover_suspect(
        "Duis aute irure dolor in reprehenderit in voluptate velit esse."
    )
    assert A._is_leftover_suspect("[Slide Title]")
    assert A._is_leftover_suspect("Click to add text")


def test_filler_detector_leaves_real_copy_alone():
    for line in (
        "70+ connectors and MCP servers",
        "Start with one workflow. Expand from there.",
        "Pods and Frames for shared work",
        "EUR 24 per seat per month",
        "Contrat de vente, douleur et suivi",
    ):
        assert not A._is_leftover_suspect(line), line


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items())
             if k.startswith("test_") and callable(v)]
    for fn in tests:
        fn()
        print(f"ok   {fn.__name__}")
    print(f"\n{len(tests)} audit tests passed")

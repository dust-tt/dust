"""Tier-1 tests for render_publish: mapping sandbox paths to the files__cat scoped
form, re-encoding renders as small JPEGs, and the data-only view lines. This is
the plumbing (shared by pptx_inspect and docx_inspect) that makes QA / preview
renders viewable by the model — they live under the conversation mount, not /tmp.

Run directly (`python test_publish.py`) or under pytest.
"""
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from PIL import Image  # noqa: E402

import render_publish as RP  # noqa: E402


def _one_canonical(_pat):
    return ["/files/conversation-abc123"]


def _no_canonical(_pat):
    return []


def _two_canonical(_pat):
    return ["/files/conversation-a", "/files/conversation-b"]


# --- mount_for_path -------------------------------------------------------


def test_mount_for_path_canonical_conversation():
    assert RP.mount_for_path("/files/conversation-abc123/output.pptx") == (
        "/files/conversation-abc123",
        "conversation-abc123",
    )


def test_mount_for_path_canonical_pod():
    assert RP.mount_for_path("/files/pod-xyz/deck.pptx") == (
        "/files/pod-xyz",
        "pod-xyz",
    )


def test_mount_for_path_legacy_resolves_unique_canonical():
    assert RP.mount_for_path(
        "/files/conversation/output.pptx", glob_fn=_one_canonical
    ) == ("/files/conversation-abc123", "conversation-abc123")


def test_mount_for_path_legacy_unresolvable_is_none():
    assert RP.mount_for_path(
        "/files/conversation/output.pptx", glob_fn=_no_canonical
    ) == (None, None)
    assert RP.mount_for_path(
        "/files/conversation/output.pptx", glob_fn=_two_canonical
    ) == (None, None)


def test_mount_for_path_off_mount_is_none():
    assert RP.mount_for_path("/tmp/x/slide.jpg") == (None, None)
    assert RP.mount_for_path("/files/somethingelse/x.pptx") == (None, None)


# --- scoped_path ----------------------------------------------------------


def test_scoped_path_canonical():
    assert (
        RP.scoped_path(
            "/files/conversation-abc123/.pptx_render/output/slide-002-boxes.jpg"
        )
        == "conversation-abc123/.pptx_render/output/slide-002-boxes.jpg"
    )


def test_scoped_path_legacy_resolves():
    assert (
        RP.scoped_path(
            "/files/conversation/.pptx_render/output/slide-002-boxes.jpg",
            glob_fn=_one_canonical,
        )
        == "conversation-abc123/.pptx_render/output/slide-002-boxes.jpg"
    )


def test_scoped_path_off_mount_is_none():
    assert RP.scoped_path("/tmp/x/slide.jpg") is None


# --- render_view_lines (data only — no imperative, no files__cat) ----------


def test_render_view_lines_emits_scoped_path_only():
    pub = [
        (
            Path("/files/conversation-abc/.pptx_render/output/slide-002-boxes.jpg"),
            "conversation-abc/.pptx_render/output/slide-002-boxes.jpg",
        )
    ]
    (line,) = RP.render_view_lines(pub)
    assert (
        line
        == "  slide 2: conversation-abc/.pptx_render/output/slide-002-boxes.jpg"
    )
    assert "files__cat" not in line  # the tool prescribes nothing
    assert "open" not in line.lower()


def test_render_view_lines_item_name_and_off_mount():
    pub = [(Path("/tmp/docx_render/doc/page-003.jpg"), None)]
    (line,) = RP.render_view_lines(pub, item_name="page")
    assert line.startswith("  page 3: /tmp/docx_render/doc/page-003.jpg")
    assert "not on the conversation mount" in line


# --- save_viewable --------------------------------------------------------


def test_save_viewable_reencodes_to_jpeg():
    with tempfile.TemporaryDirectory() as src, tempfile.TemporaryDirectory() as dst:
        png = Path(src) / "slide-001-boxes.png"
        Image.new("RGB", (4000, 3000), (200, 30, 30)).save(png)
        dest = RP.save_viewable(png, Path(dst))
        assert dest.suffix == ".jpg"
        with Image.open(dest) as img:
            assert img.format == "JPEG"
            assert max(img.size) <= RP.VIEW_MAX_PX


def test_save_viewable_enforces_byte_cap():
    original_cap = RP.VIEW_MAX_BYTES
    try:
        RP.VIEW_MAX_BYTES = 50_000
        with tempfile.TemporaryDirectory() as src, tempfile.TemporaryDirectory() as dst:
            noisy = Path(src) / "slide-001-boxes.png"
            # os.urandom -> incompressible, so q85 would blow the cap.
            Image.frombytes("RGB", (1200, 1200), os.urandom(1200 * 1200 * 3)).save(
                noisy
            )
            dest = RP.save_viewable(noisy, Path(dst))
            assert dest.stat().st_size <= RP.VIEW_MAX_BYTES
            with Image.open(dest) as img:
                assert img.format == "JPEG"
    finally:
        RP.VIEW_MAX_BYTES = original_cap


def test_save_viewable_fallback_keeps_source_extension():
    with tempfile.TemporaryDirectory() as src, tempfile.TemporaryDirectory() as dst:
        bogus = Path(src) / "slide-001-boxes.png"
        bogus.write_bytes(b"this is not a real image")
        dest = RP.save_viewable(bogus, Path(dst))
        assert dest.name == "slide-001-boxes.png"  # extension preserved
        assert dest.read_bytes() == b"this is not a real image"


# --- publish_renders ------------------------------------------------------


def test_publish_renders_writes_under_render_dir_subdir_basename():
    with tempfile.TemporaryDirectory() as src, tempfile.TemporaryDirectory() as dst:
        png = Path(src) / "slide-001-boxes.png"
        Image.new("RGB", (800, 600), (10, 20, 30)).save(png)
        out = RP.publish_renders("deck", [png], dst, ".pptx_render")
        assert len(out) == 1
        dest, scoped = out[0]
        assert dest.exists()
        assert dest.parent.name == "deck"
        assert dest.parent.parent.name == ".pptx_render"  # DIR/.pptx_render/deck
        assert dest.suffix == ".jpg"
        assert scoped is None  # tmp render_dir is off any mount


def test_publish_renders_degrades_when_dest_unwritable():
    # render_dir is a regular FILE, so makedirs(<file>/.pptx_render/deck) raises;
    # publishing must degrade to the unviewable-local path, never crash.
    with tempfile.TemporaryDirectory() as src:
        png = Path(src) / "slide-001-boxes.png"
        Image.new("RGB", (100, 100), (0, 0, 0)).save(png)
        not_a_dir = Path(src) / "iam-a-file"
        not_a_dir.write_text("x")
        out = RP.publish_renders("deck", [png], str(not_a_dir), ".pptx_render")
        assert out == [(png, None)]


if __name__ == "__main__":
    tests = [
        v
        for k, v in sorted(globals().items())
        if k.startswith("test_") and callable(v)
    ]
    for fn in tests:
        fn()
        print(f"ok   {fn.__name__}")
    print(f"\n{len(tests)} publish tests passed")

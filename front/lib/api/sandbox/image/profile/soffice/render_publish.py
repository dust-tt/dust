"""Publish soffice renders onto the conversation/pod mount so the model can see
them.

Renders are rasterized to /tmp (fast, with a reusable PDF cache) but /tmp is
invisible to the model — only files under the conversation/pod mount are. So QA /
preview renders are *published* onto that mount as small JPEGs the model can open
with the files__cat tool, grouped in a dot-prefixed subdir to keep them apart
from real deliverables. Shared by pptx_inspect and docx_inspect.

NOTE: the dot-prefixed subdir keeps renders grouped but does NOT by itself hide
them from the user's file list — the file-system backend's list() filters
hidden-dir *contents* (see gcs_file_system_backend.ts) to do that.
"""

from __future__ import annotations

import glob
import os
import re
import shutil
from pathlib import Path
from typing import List, Optional, Tuple

from PIL import Image

VIEW_MAX_PX = 2000  # downscale ceiling for published JPEGs
VIEW_MAX_BYTES = 1_900_000  # stay safely under files__cat's 2 MB vision cap


def mount_for_path(
    path: str, glob_fn=glob.glob
) -> Tuple[Optional[str], Optional[str]]:
    """Resolve the canonical conversation/pod mount a sandbox path lives on.

    Returns ``(canonical_mount_root, scoped_prefix)`` — e.g.
    ``("/files/conversation-abc", "conversation-abc")`` — where ``scoped_prefix``
    is the form the files__cat tool accepts. The legacy aliases
    ``/files/conversation`` and ``/files/pod`` share storage with their
    canonical mount, so we resolve the unique canonical sibling. Returns
    ``(None, None)`` when the path is not under a resolvable mount (e.g. /tmp)."""
    parts = os.path.normpath(path).split(os.sep)
    if len(parts) < 3 or parts[1] != "files":
        return (None, None)
    mount = parts[2]
    for prefix in ("conversation-", "pod-"):
        if mount.startswith(prefix) and len(mount) > len(prefix):
            return ("/files/" + mount, mount)
    legacy = {"conversation": "conversation-", "pod": "pod-"}.get(mount)
    if legacy:
        canon = sorted(
            os.path.basename(p)
            for p in glob_fn("/files/" + legacy + "*")
            if os.path.basename(p).startswith(legacy)
        )
        if len(canon) == 1:
            return ("/files/" + canon[0], canon[0])
    return (None, None)


def scoped_path(abs_path: str, glob_fn=glob.glob) -> Optional[str]:
    """The files__cat scoped path for an absolute path on a conversation/pod
    mount (`conversation-<id>/<rel>`), or None when it is not on a resolvable
    mount."""
    parts = os.path.normpath(abs_path).split(os.sep)
    if len(parts) < 4 or parts[1] != "files":
        return None
    _, scoped_prefix = mount_for_path("/files/" + parts[2], glob_fn=glob_fn)
    if not scoped_prefix:
        return None
    return scoped_prefix + "/" + "/".join(parts[3:])


def save_viewable(src: Path, dest_root: Path) -> Path:
    """Publish one render into ``dest_root`` as a JPEG small enough for
    files__cat's vision cap; returns the written path. A source that PIL cannot
    decode is copied through verbatim (keeping its real extension so the bytes
    match the name). A destination-write failure raises OSError so the caller can
    degrade the whole publish."""
    try:
        with Image.open(src) as img:
            rgb = img.convert("RGB")
    except (OSError, ValueError):
        # Odd/unreadable source (rare — the box overlay already passed PIL once):
        # copy the bytes through unchanged so files__cat still gets a valid image.
        dest = dest_root / src.name
        shutil.copyfile(src, dest)
        return dest
    if max(rgb.size) > VIEW_MAX_PX:
        rgb.thumbnail((VIEW_MAX_PX, VIEW_MAX_PX))
    dest = dest_root / (src.stem + ".jpg")
    quality = 85
    rgb.save(dest, "JPEG", quality=quality)
    # A pathological high-entropy page could exceed the vision cap at q85; step
    # quality down, then shrink dimensions, until it fits so files__cat never
    # rejects the render. (Real renders are ~tens of KB and never loop.)
    while dest.stat().st_size > VIEW_MAX_BYTES and (
        quality > 35 or min(rgb.size) > 64
    ):
        if quality > 35:
            quality -= 15
        else:
            rgb = rgb.resize(
                (max(64, rgb.size[0] * 3 // 4), max(64, rgb.size[1] * 3 // 4))
            )
        rgb.save(dest, "JPEG", quality=quality)
    return dest


def publish_renders(
    basename: str,
    local_paths: List[Path],
    render_dir: str,
    subdir: str,
) -> List[Tuple[Path, Optional[str]]]:
    """Publish renders under ``<render_dir>/<subdir>/<basename>`` as small JPEGs
    the model can open with files__cat, returning ``(dest_path, scoped_path)`` for
    each in input order. ``subdir`` is the dot-prefixed folder to group them under
    (e.g. ``.pptx_render``); ``render_dir`` defaults to the conversation mount.
    ``scoped_path`` is None when the destination is not on a resolvable
    conversation/pod mount. If the destination cannot be written (read-only / full
    / missing mount), returns ``(local_path, None)`` for each so the caller's text
    output still survives."""
    dest_root = Path(render_dir) / subdir / basename
    try:
        os.makedirs(dest_root, exist_ok=True)
        published = [save_viewable(p, dest_root) for p in local_paths]
    except OSError:
        return [(p, None) for p in local_paths]
    return [(dest, scoped_path(str(dest))) for dest in published]


def render_view_lines(
    published: List[Tuple[Path, Optional[str]]],
    item_name: str = "slide",
) -> List[str]:
    """Per-item ``<label>: <scoped render path>`` lines — data only. What to do
    with them (open each with files__cat) is the skill's job, not the tool's. Falls
    back to the local path when a render is not on a resolvable mount."""
    lines: List[str] = []
    for dest, scoped in published:
        m = re.search(r"-(\d+)", dest.name)
        label = f"{item_name} {int(m.group(1))}" if m else dest.name
        if scoped:
            lines.append(f"  {label}: {scoped}")
        else:
            lines.append(f"  {label}: {dest} (not on the conversation mount)")
    return lines

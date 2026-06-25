#!/usr/bin/env python3
"""Regression test for pptx_inspect's output (a characterization / snapshot test).

Runs pptx_inspect via subprocess — exactly as an agent does, `python
<abs>/pptx_inspect.py` from an unrelated cwd, which also proves the flat sibling
modules in soffice/ import correctly — and asserts each view's output matches a
captured baseline in expected/. It locks the tool's behaviour so a change that
should alter nothing (e.g. a refactor) can be proven to alter nothing.

When the output legitimately changes, re-capture the baselines:

    python test_inspect_output.py capture   # regenerate expected/*.txt
    python test_inspect_output.py           # run the check (also via pytest)

Deck fixtures come from env vars (defaults to local dev decks). Lives in
soffice_tests/, a sibling of soffice/ that getLocalDirContent never copies, so it
never ships in the sandbox image.
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
INSPECT = HERE.parent / "soffice" / "pptx_inspect.py"
EXPECTED = HERE / "expected"

PY = os.environ.get("DUST_PPTX_PY", sys.executable)
DECK = os.environ.get(
    "DUST_PPTX_DECK", "/Users/jd/.claude/jobs/27d3075e/tmp/cleanroom3_a.pptx"
)
TEMPLATE = os.environ.get(
    "DUST_PPTX_TEMPLATE", "/Users/jd/Downloads/Copy of B2B_C1.pptx"
)

# Views chosen to exercise each module: geometry + audit + typography land in
# --slide / --compare; the render-box logic lands in --render.
VIEWS = [
    ("overview", [DECK]),
    ("layouts", [DECK, "--layouts"]),
    ("slide6", [DECK, "--slide", "6"]),
    ("tpl_slide18", [TEMPLATE, "--slide", "18"]),
    ("text", [DECK, "--text"]),
    ("compare", [DECK, "--compare", TEMPLATE]),
    ("render6", [DECK, "--render", "--slide", "6"]),
]


def _normalize(s: str) -> str:
    # The only run-to-run volatile bits are the render output paths and the file
    # size in the header; everything else (geometry, lints, audits) is exact.
    s = re.sub(r"/tmp/pptx_render/[^\s\]]+", "<render_path>", s)
    s = re.sub(r"\| [\d.]+\s*[KMG]?B\]", "| <size>]", s)
    return s


def _run(args: list[str]) -> str:
    proc = subprocess.run(
        [PY, str(INSPECT), *args],
        cwd=str(HERE),  # unrelated cwd: also tests flat-module import resolution
        capture_output=True,
        text=True,
    )
    return _normalize(proc.stdout)


def _capture() -> None:
    EXPECTED.mkdir(exist_ok=True)
    for name, args in VIEWS:
        (EXPECTED / f"{name}.txt").write_text(_run(args))
        print(f"captured {name}")


def test_inspect_output_unchanged():
    """Every view's output must match its expected/ baseline byte-for-byte."""
    missing = [n for n, _ in VIEWS if not (EXPECTED / f"{n}.txt").exists()]
    assert not missing, f"no baseline for {missing}; run `capture` first"
    drift = [
        name for name, args in VIEWS
        if _run(args) != (EXPECTED / f"{name}.txt").read_text()
    ]
    assert not drift, f"pptx_inspect output changed for: {drift}"


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "capture":
        _capture()
    else:
        test_inspect_output_unchanged()
        print(f"ok   inspect output unchanged ({len(VIEWS)} views)")

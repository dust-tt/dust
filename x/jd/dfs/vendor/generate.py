#!/usr/bin/env python3
"""Create a deterministic, disposable filesystem search corpus."""

import argparse
import base64
import hashlib
import json
import random
from pathlib import Path

DEPTH = 10
WIDTH = 10
DOCUMENTS = 10_000
DEFAULT_FILLER_LINES = 256
RARE_INDICES = frozenset({7, 997, 5003, 9991})
SAMPLE_INDICES = frozenset(random.Random(42).sample(range(DOCUMENTS), 256))
LOREM = (
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
    "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.",
    "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.",
    "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia.",
)


def directories() -> list[Path]:
    """Ten independent branches, each ten directories deep."""
    return [
        Path(*[f"node_{level:02d}_{branch:02d}" for level in range(1, depth + 1)])
        for branch in range(WIDTH)
        for depth in range(1, DEPTH + 1)
    ]


def document(index: int, rng: random.Random, filler_lines: int) -> str:
    lines = [rng.choice(LOREM) for _ in range(6)]
    lines.append("BENCH_COMMON_SIGNAL")
    lines.append(f"ticket: TKT-{index:05d}")
    if index in RARE_INDICES:
        lines.append("BENCH_RARE_NEEDLE")
    if index % 10 == 3:
        lines.append("BENCH_GROUP_03")
    if index % 101 == 0:
        lines.append("MiXeD_CaSe_SeNtInEl")
    if index % 257 == 0:
        lines.append("café-δοκιμή")
    lines.extend(rng.choice(LOREM) for _ in range(filler_lines))
    return "\n".join(lines) + "\n"


def counts(rng: random.Random) -> list[int]:
    # Each random pair sums to 200: every directory has 60–140 files,
    # while the overall total is exactly 10,000 for every seed.
    values = []
    for _ in range(DEPTH * WIDTH // 2):
        deviation = rng.randint(1, 40)
        values.extend((100 - deviation, 100 + deviation))
    rng.shuffle(values)
    return values


def generate(output: Path, seed: int, filler_lines: int = DEFAULT_FILLER_LINES) -> None:
    """@cc [owner:id13,label:testing] isolated-reproducible-corpus
    Generation MUST refuse a pre-existing output path and, for the same seed and
    filler line count, produce 10,000 identical documents and a manifest outside
    the searchable tree with each file's size and SHA-256 plus exact sampled tails.
    """
    if filler_lines < 0:
        raise ValueError("filler_lines must not be negative")
    rng = random.Random(seed)
    allocation = counts(rng)
    paths = []
    sizes = []
    hashes = []
    tails = {}
    # Never overwrite or clean an existing corpus (including an incomplete run).
    output.mkdir(parents=True, exist_ok=False)
    for directory, count in zip(directories(), allocation, strict=True):
        (output / "docs" / directory).mkdir(parents=True)
        for _ in range(count):
            index = len(paths)
            relative_path = directory / f"doc_{index:05d}.txt"
            data = document(index, rng, filler_lines).encode("utf-8")
            (output / "docs" / relative_path).write_bytes(data)
            path = relative_path.as_posix()
            paths.append(path)
            sizes.append(len(data))
            hashes.append(hashlib.sha256(data).hexdigest())
            if index in SAMPLE_INDICES:
                tails[path] = base64.b64encode(data[-4096:]).decode("ascii")

    assert len(paths) == DOCUMENTS
    (output / "manifest.json").write_text(
        json.dumps(
            {"version": 1, "seed": seed, "filler_lines": filler_lines,
             "paths": paths, "sizes": sizes, "sha256": hashes, "tails": tails},
            ensure_ascii=False,
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="new directory for docs/ and manifest.json")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--filler-lines", type=int, default=DEFAULT_FILLER_LINES)
    args = parser.parse_args()
    if args.filler_lines < 0:
        parser.error("--filler-lines must not be negative")
    generate(args.output, args.seed, args.filler_lines)
    print(f"Created {DOCUMENTS} documents in {args.output / 'docs'} (seed={args.seed})")

#!/usr/bin/env python3
"""Generate a reproducible text corpus for filesystem and ripgrep benchmarks."""

import argparse
import gzip
import io
import logging
from pathlib import Path
import random
import tarfile


WORDS = """
lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt
ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco
laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate
velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident
sunt culpa qui officia deserunt mollit anim id est laborum facilisis gravida neque
convallis cras semper auctor urna nunc tincidunt vitae sapien pellentesque habitant morbi
tristique senectus netus malesuada fames turpis egestas integer eget aliquet nibh
praesent elementum dignissim tellus molestie nunc scelerisque viverra maecenas accumsan
lacus vel facilisis volutpat consequat mauris nunc congue nisi porta non pulvinar
condimentum lacinia quis vel eros donec ac odio tempor orci dapibus ultrices in iaculis
diam sit amet nisl suscipit fringilla urna porttitor rhoncus massa cursus mattis felis
bibendum tristique ornare aenean euismod elementum tempus imperdiet sed euismod nisi
porta aliquam vestibulum velit laoreet suspendisse interdum posuere risus commodo
viverra accumsan venenatis ultricies leo integer malesuada nunc maximus placerat
sollicitudin curabitur faucibus consequat sagittis metus pretium fermentum hendrerit
volutpat vehicula blandit fusce vivamus phasellus potenti sociosqu torquent per conubia
nostra inceptos himenaeos aptent taciti class dis parturient montes nascetur ridiculus
mus litora lectus metus rutrum ligula augue ante arcu proin varius habitasse platea
dictumst duis etiam accumsan eleifend justo feugiat lobortis lacinia aenean cubilia curae
ornare vulputate semper quisque cursus purus dignissim nibh ultricies mollis posuere
finibus tincidunt fermentum nam mattis fringilla erat purus sodales urna ultricies
amber apricot azure birch bronze canyon cedar cherry cloud copper coral crimson delta
drift dune ember fern field forest frost garden glacier granite harbor hazel hill indigo
island ivory jade juniper lake lantern lavender leaf lilac linen maple marble meadow
mist moss mountain oak ocean olive onyx opal orchard orchid pebble pine plum prairie
quartz rain raven reed river rose ruby sage sand scarlet shadow silver slate snow spruce
stone stream sunrise sunset teal thistle timber valley velvet violet willow winter
zephyr anchor archive arrow atlas beacon bridge brook canvas chamber circle compass
crystal current echo engine feather flame galaxy gateway globe horizon journal lattice
ledger matrix mirror mosaic network orbit paper passage pattern pebble portal ribbon
signal spiral station summit thread tower trail tunnel vector vessel window wing
ancient balanced bright calm careful clear cool curious distant early eastern empty
even flowing gentle golden green hidden hollow inner quiet light little local long
loose lower lunar narrow northern open outer pale patient quick remote round royal
rustic shallow silent smooth soft solar southern stable still subtle summer swift
tender tiny upper vivid warm western wide wild young assemble balance carry collect
compare compose connect count create cross discover draw drift explore extend find
follow gather grow imagine include inspect join keep listen measure move observe
open parse read remember repeat resolve return rotate search select share shift sort
store trace travel uncover update visit wander watch weave whisper write
""".split()

FILE_GROUPS = (
    ("small", 80, 1_024, 8_192),
    ("medium", 18, 32_768, 131_072),
    ("large", 2, 1_048_576, 4_194_304),
)

SEARCH_PHRASES = (
    (1, "benchmarkcommon lorem ipsum dolor sit amet"),
    (10, "benchmarkmedium amber lantern silent harbor"),
    (100, "benchmarkrare cobalt heron violet meadow"),
    (1_000, "benchmarkneedle quartz zephyr velvet compass"),
)


def make_content(rng: random.Random, file_index: int, size_bytes: int) -> bytes:
    """
    @cc [owner:spolu,label:testing] corpus-search-probes
    Each SEARCH_PHRASES entry MUST occur exactly once when file_index is divisible by its interval,
    and MUST be absent otherwise. Each file MUST have a unique document ID and size_bytes bytes.
    """
    markers = [f"document-id: doc-{file_index:05d}\n"]
    markers.extend(
        f"{phrase}\n"
        for interval, phrase in SEARCH_PHRASES
        if file_index % interval == 0
    )
    marker_bytes = "".join(markers).encode("ascii")
    body_size_bytes = size_bytes - len(marker_bytes)

    lines = []
    generated_bytes = 0
    while generated_bytes < body_size_bytes:
        words = rng.choices(WORDS, k=rng.randint(6, 12))
        line = " ".join(words).capitalize() + ".\n"
        lines.append(line)
        generated_bytes += len(line)

    body = "".join(lines).encode("ascii")[: body_size_bytes - 1] + b"\n"

    # Rotate probes between the beginning, middle, and end so searches exercise the entire file.
    position = (file_index % 3) * len(body) // 2
    if 0 < position < len(body):
        position = body.find(b"\n", position) + 1
    return body[:position] + marker_bytes + body[position:]


def create_archive(output: Path, seed: int, file_count: int) -> None:
    """
    @cc [owner:spolu,label:testing] reproducible-corpus-archive
    For a positive file_count, the archive MUST contain exactly file_count regular text files with
    relative paths under corpus/. Group counts MUST follow FILE_GROUPS percentages, rounded down
    with remaining files assigned to the small group. With the same file_count, seed, and Python/zlib
    versions, repeated runs MUST produce identical archive bytes.
    """
    rng = random.Random(seed)
    group_counts = [file_count * percentage // 100 for _, percentage, _, _ in FILE_GROUPS]
    group_counts[0] += file_count - sum(group_counts)
    file_index = 0
    total_bytes = 0
    with output.open("wb") as destination:
        with gzip.GzipFile(
            fileobj=destination, mode="wb", filename="", mtime=0, compresslevel=1
        ) as compressed:
            with tarfile.open(fileobj=compressed, mode="w|", format=tarfile.USTAR_FORMAT) as archive:
                for (group, _, min_bytes, max_bytes), count in zip(FILE_GROUPS, group_counts):
                    for group_index in range(count):
                        size_bytes = rng.randint(min_bytes, max_bytes)
                        content = make_content(rng, file_index, size_bytes)
                        path = f"corpus/{group}/{group_index // 100:02d}/file-{file_index:05d}.txt"
                        member = tarfile.TarInfo(path)
                        member.size = len(content)
                        member.mode = 0o644
                        archive.addfile(member, io.BytesIO(content))
                        file_index += 1
                        total_bytes += len(content)
                        if file_index % 1_000 == 0:
                            logging.info("Generated %s / %s files", file_index, file_count)

    logging.info(
        "Created %s: %s files, %.1f MiB of text, %.1f MiB compressed (seed %s)",
        output,
        file_index,
        total_bytes / 1_048_576,
        output.stat().st_size / 1_048_576,
        seed,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--files", dest="file_count", type=int, default=10_000,
        help="Total number of files (default: 10000).",
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--output", type=Path,
        help="Output path (default: corpus-<files>.tar.gz beside this script).",
    )
    args = parser.parse_args()
    if args.file_count < 1:
        parser.error("--files must be greater than zero")
    output = args.output or Path(__file__).with_name(f"corpus-{args.file_count}.tar.gz")
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    create_archive(output, args.seed, args.file_count)


if __name__ == "__main__":
    main()

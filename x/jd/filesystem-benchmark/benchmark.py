#!/usr/bin/env python3
"""Correctness-checked filesystem and ripgrep benchmarks for a mounted corpus."""

import argparse
import base64
import hashlib
import json
import os
import platform
import shutil
import stat
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Callable, TypeVar

from generate import DEPTH, DOCUMENTS, SAMPLE_INDICES, WIDTH

T = TypeVar("T")
RARE_DOCUMENTS = {7, 997, 5003, 9991}
WRITE_FILES = 32
WRITE_BYTES = 32 * 1024


def check(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def render_table(headings: tuple[str, ...], rows: list[tuple[str, ...]]) -> None:
    values = [headings, *rows]
    widths = [max(len(row[i]) for row in values) for i in range(len(headings))]
    border = "+" + "+".join("-" * (width + 2) for width in widths) + "+"

    def line(cells: tuple[str, ...]) -> str:
        return "| " + " | ".join(cell.ljust(width) for cell, width in zip(cells, widths)) + " |"

    print(border)
    print(line(headings))
    print(border)
    for row in rows:
        print(line(row))
    print(border)


def render(rows: list[tuple[str, str, str, str, str]]) -> None:
    render_table(("Feature", "Workload", "Phase", "Time (ms)", "Result"), rows)


def tool_versions(rg_path: str) -> list[tuple[str, str, str]]:
    """@cc [owner:id13,label:testing] report-actual-executables
    The version table MUST query the same ripgrep executable used by workloads
    and identify the running Python interpreter rather than guessing versions.
    """
    result = subprocess.run([rg_path, "--version"], capture_output=True, text=True, check=True)
    return [
        ("Python", f"{platform.python_implementation()} {platform.python_version()}", sys.executable),
        ("ripgrep", result.stdout.splitlines()[0], rg_path),
        ("OS kernel", f"{platform.system()} {platform.release()} ({platform.machine()})", "-"),
    ]


class Benchmark:
    def __init__(self, root: Path, warm_runs: int, rg_path: str) -> None:
        self.docs = root / "docs"
        self.rg_path = str(Path(rg_path).resolve())
        manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
        check(manifest.get("version") == 1, "manifest lacks integrity data; regenerate the corpus")
        self.paths: list[str] = manifest["paths"]
        check(len(self.paths) == DOCUMENTS and len(set(self.paths)) == DOCUMENTS, "invalid manifest")
        check(
            all(
                len(Path(p).parts) >= 2 and not Path(p).is_absolute() and ".." not in Path(p).parts
                for p in self.paths
            ),
            "unsafe manifest paths",
        )
        check(len(manifest["sizes"]) == DOCUMENTS and len(manifest["sha256"]) == DOCUMENTS,
              "incomplete manifest integrity data")
        self.expected_sizes = dict(zip(self.paths, manifest["sizes"], strict=True))
        self.expected_hashes = dict(zip(self.paths, manifest["sha256"], strict=True))
        self.expected_tails = {
            path: base64.b64decode(encoded, validate=True)
            for path, encoded in manifest["tails"].items()
        }
        check(set(self.expected_tails) == {self.paths[i] for i in SAMPLE_INDICES},
              "incomplete sampled tail data")
        self.expected = set(self.paths)
        self.warm_runs = warm_runs
        self.rows: list[tuple[str, str, str, str, str]] = []

    def measure(
        self, feature: str, workload: str, phase: str,
        action: Callable[[], T], validate: Callable[[T], None], runs: int = 1,
    ) -> T:
        """@cc [owner:id13,label:testing;performance] time-only-verified-work
        Each reported workload MUST validate its output; final result comparisons
        MUST occur outside the timed interval, and a failed validation MUST
        prevent a successful benchmark result.
        """
        times_ms = []
        last_result: T
        try:
            for _ in range(runs):
                start = time.perf_counter()
                last_result = action()
                elapsed_ms = (time.perf_counter() - start) * 1000
                validate(last_result)
                times_ms.append(elapsed_ms)
        except (OSError, ValueError):
            self.rows.append((feature, workload, phase, "-", "FAIL"))
            raise
        duration_ms = statistics.median(times_ms)
        self.rows.append((feature, workload, phase, f"{duration_ms:,.2f}", "OK"))
        return last_result

    def pair(
        self, feature: str, workload: str,
        action: Callable[[], T], validate: Callable[[T], None],
    ) -> T:
        first = self.measure(feature, workload, "first", action, validate)
        self.measure(feature, workload, "warm", action, validate, self.warm_runs)
        return first

    def metadata(self) -> tuple[dict[str, int], int]:
        sizes: dict[str, int] = {}
        directories = 0
        stack = [self.docs]
        while stack:
            parent = stack.pop()
            with os.scandir(parent) as entries:
                for entry in entries:
                    info = entry.stat(follow_symlinks=False)
                    if stat.S_ISDIR(info.st_mode):
                        directories += 1
                        stack.append(Path(entry.path))
                    elif stat.S_ISREG(info.st_mode):
                        sizes[Path(entry.path).relative_to(self.docs).as_posix()] = info.st_size
                    else:
                        raise ValueError(f"unexpected filesystem entry: {entry.path}")
        return sizes, directories

    def rg(self, *args: str, target: str = ".") -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [self.rg_path, "--no-config", "--no-ignore", "--color", "never", *args, target],
            cwd=self.docs, text=True, capture_output=True, check=False,
        )

    def check_rg(self, result: subprocess.CompletedProcess[str], expected: set[str], code: int = 0) -> None:
        check(result.returncode == code, f"rg exited {result.returncode}: {result.stderr}")
        lines = result.stdout.splitlines()
        check(len(lines) == len(expected) and set(lines) == expected, "rg returned incorrect paths")

    def fstat_all(self) -> dict[str, int]:
        sizes = {}
        for path in self.paths:
            fd = os.open(self.docs / path, os.O_RDONLY)
            try:
                info = os.fstat(fd)
            finally:
                os.close(fd)
            check(stat.S_ISREG(info.st_mode), f"not a regular file: {path}")
            sizes[path] = info.st_size
        return sizes

    def read_all(self) -> tuple[int, dict[str, str]]:
        total = 0
        digests = {}
        for path in self.paths:
            data = (self.docs / path).read_bytes()
            total += len(data)
            digests[path] = hashlib.sha256(data).hexdigest()
        return total, digests

    def verify_contents(self, observed: tuple[int, dict[str, str]], total_bytes: int) -> None:
        """@cc [owner:id13,label:testing] manifest-integrity-oracle
        Full-content checks MUST compare digests of the bytes returned by the
        measured read against the generated manifest after timing ends. Validation
        MUST NOT reread files, which could conceal transient incorrect responses.
        """
        count, digests = observed
        check(count == total_bytes, "short read")
        check(set(digests) == self.expected, "incomplete full read")
        for path in self.paths:
            check(digests[path] == self.expected_hashes[path], f"SHA-256 mismatch: {path}")

    def pread_sample(self, selected: list[str]) -> dict[str, bytes]:
        blocks = {}
        for path in selected:
            fd = os.open(self.docs / path, os.O_RDONLY)
            try:
                offset = max(0, self.expected_sizes[path] - 4096)
                blocks[path] = os.pread(fd, 4096, offset)
            finally:
                os.close(fd)
        return blocks

    def verify_pread(self, blocks: dict[str, bytes], selected: list[str]) -> None:
        check(set(blocks) == set(selected), "incomplete pread sample")
        for path, data in blocks.items():
            check(data == self.expected_tails[path], f"incorrect pread tail: {path}")

    def missing_sample(self, selected: list[str]) -> int:
        for i, path in enumerate(selected):
            missing = self.docs / Path(path).parent / f"missing_{i:05d}.txt"
            try:
                os.stat(missing)
            except FileNotFoundError:
                continue
            raise ValueError(f"unexpected existing file: {missing}")
        return len(selected)

    def writes(self) -> None:
        """@cc [owner:id13,label:testing] isolated-write-workload
        Write benchmarks MUST use only a newly created scratch directory inside the
        mounted tree and MUST close descriptors and remove their own files afterward.
        """
        unit = b"vfs benchmark payload\n"
        payload = (unit * ((WRITE_BYTES + len(unit) - 1) // len(unit)))[:WRITE_BYTES]
        fds: list[int] = []
        filenames: list[Path] = []
        with tempfile.TemporaryDirectory(prefix=".vfs-benchmark-", dir=self.docs) as scratch:
            try:
                def create() -> int:
                    for i in range(WRITE_FILES):
                        path = Path(scratch) / f"write_{i:03d}.txt"
                        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                        fds.append(fd)
                        filenames.append(path)
                        remaining = memoryview(payload)
                        while remaining:
                            written = os.write(fd, remaining)
                            check(written > 0, f"short write: {path}")
                            remaining = remaining[written:]
                    return len(fds)

                # Separate buffered writes from explicit file synchronization.
                self.measure("write", f"create + write ({WRITE_FILES} x 32 KiB files)", "once",
                             create, lambda n: check(n == WRITE_FILES, "incomplete writes"))

                def sync_files() -> int:
                    for fd in fds:
                        os.fsync(fd)
                    return len(fds)

                # Isolate file-fsync latency; directory entry persistence is not tested.
                self.measure("file sync", f"fsync ({WRITE_FILES} files)", "once",
                             sync_files, lambda count: check(count == WRITE_FILES, "incomplete fsync"))

                def close_all() -> int:
                    while fds:
                        os.close(fds.pop())
                    return WRITE_FILES

                def validate_closed(count: int) -> None:
                    check(count == WRITE_FILES, "incomplete closes")
                    check(all(path.read_bytes() == payload for path in filenames),
                          "written content mismatch")

                # Some VFS implementations defer remote uploads until close.
                self.measure("write", f"close ({WRITE_FILES} files)", "once",
                             close_all, validate_closed)

                def unlink_all() -> int:
                    for path in filenames:
                        path.unlink()
                    return len(filenames)

                # Include deletion cost separately from file creation and sync.
                self.measure("write", f"unlink ({WRITE_FILES} files)", "once",
                             unlink_all,
                             lambda count: check(count == WRITE_FILES and
                                                 all(not path.exists() for path in filenames),
                                                 "incomplete unlink"))
            finally:
                for fd in fds:
                    os.close(fd)

    def run(self, skip_writes: bool) -> None:
        """@cc [owner:id13,label:performance] first-touch-before-warm
        Each first/warm pair MUST run its first pass before its repeated passes;
        filesystem writes MUST run after read-only workloads to preserve the corpus.
        """
        def validate_sizes(found: tuple[dict[str, int], int]) -> None:
            entries, directories = found
            check(directories == DEPTH * WIDTH, f"expected 100 directories, got {directories}")
            check(entries == self.expected_sizes, "filesystem sizes or paths differ from manifest")

        # Establish the only unprimed metadata baseline before other traversals.
        self.pair("metadata", f"scandir + stat ({DEPTH * WIDTH} dirs, {DOCUMENTS:,} files)",
                  self.metadata, validate_sizes)
        # Compare ripgrep's traversal overhead without introducing content reads.
        self.pair("metadata", f"rg --files ({DOCUMENTS:,} files)",
                   lambda: self.rg("--files"),
                   lambda result: self.check_rg(result, {f"./{p}" for p in self.expected}))
        # Isolate per-file open and descriptor metadata from data transfer.
        self.pair("metadata", f"open + fstat + close ({DOCUMENTS:,} files)",
                   self.fstat_all,
                   lambda found: check(found == self.expected_sizes, "fstat sizes differ from manifest"))
        selected = [self.paths[i] for i in sorted(SAMPLE_INDICES)]
        # Expose negative-lookup caching, which may differ from positive stat costs.
        self.pair("metadata", f"stat missing ({len(selected)} paths)",
                   lambda: self.missing_sample(selected),
                   lambda count: check(count == len(selected), "incomplete negative lookup sample"))
        total_bytes = sum(self.expected_sizes.values())
        # Force the first full-content pass to expose cold-ish vs repeated cache cost.
        self.pair("page cache", f"rg no-match scan ({DOCUMENTS:,} files, {total_bytes / 1_000_000:.1f} MB)",
                   lambda: self.rg("-l", "-F", "BENCH_ABSENT_TOKEN"),
                   lambda result: self.check_rg(result, set(), code=1))
        rare = {f"./{self.paths[i]}" for i in RARE_DOCUMENTS}
        # Contrast the no-match scan with selective hits on already-touched content.
        self.pair("search", f"rg rare literal ({DOCUMENTS:,} files, {len(rare)} matches)",
                   lambda: self.rg("-l", "-F", "BENCH_RARE_NEEDLE"),
                   lambda result: self.check_rg(result, rare))
        branch = {f"./{p}" for p in self.paths if p.startswith("node_01_00/")}
        # Compare glob pruning with the unrestricted tree scans above.
        self.pair("path pruning", f"rg branch glob ({len(branch):,} candidate files)",
                   lambda: self.rg("-l", "-F", "BENCH_COMMON_SIGNAL", "-g", "node_01_00/**"),
                   lambda result: self.check_rg(result, branch))
        prefix = "/".join(f"node_{level:02d}_00" for level in range(1, DEPTH + 1))
        deep = {p for p in self.paths if p.startswith(prefix + "/")}
        # Contrast explicit deep-path resolution with root-level glob pruning.
        self.pair("path pruning", f"rg depth-10 subtree ({len(deep):,} files)",
                   lambda: self.rg("-l", "-F", "BENCH_COMMON_SIGNAL", target=prefix),
                   lambda result: self.check_rg(result, deep))
        # Compare Python reads with ripgrep after its scan has warmed the content.
        self.pair("page cache", f"open + read + SHA-256 ({DOCUMENTS:,} files, {total_bytes / 1_000_000:.1f} MB)",
                   self.read_all, lambda observed: self.verify_contents(observed, total_bytes))

        # Probe offset reads, while acknowledging prior scans may mask backend I/O.
        self.pair("random I/O", f"open + pread tail ({len(selected)} files x 4 KiB)",
                   lambda: self.pread_sample(selected),
                   lambda blocks: self.verify_pread(blocks, selected))
        # Keep scratch files out of all traversal and search measurements.
        if not skip_writes:
            self.writes()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path, help="corpus directory containing docs/ and manifest.json")
    parser.add_argument("--warm-runs", type=int, default=3, help="median of N repeats (default: 3)")
    parser.add_argument("--skip-writes", action="store_true", help="for read-only mounts")
    args = parser.parse_args()
    if args.warm_runs < 1:
        parser.error("--warm-runs must be positive")
    rg_path = shutil.which("rg")
    if rg_path is None:
        parser.error("ripgrep (rg) is required")
    rg_path = str(Path(rg_path).resolve())
    try:
        versions = tool_versions(rg_path)
    except (OSError, subprocess.CalledProcessError, IndexError) as exc:
        parser.error(f"could not determine ripgrep version: {exc}")
    print("Tool versions")
    render_table(("Tool", "Version", "Executable"), versions)
    print()
    print("Benchmark results")
    bench = None
    try:
        bench = Benchmark(args.root.resolve(), args.warm_runs, rg_path)
        bench.run(args.skip_writes)
    except (OSError, ValueError) as exc:
        render(bench.rows if bench else [])
        print(f"FAILED: {exc}")
        return 1
    render(bench.rows)
    print("First = first measured invocation, not guaranteed cold OS cache; warm = median repeat.")
    print("Final result comparisons are outside timings; in-loop checks are included.")
    print("Run on a fresh mount for first-touch comparisons.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

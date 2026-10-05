"""Regression tests for corpus integrity and mount-independent search behavior."""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from benchmark import Benchmark
from generate import DOCUMENTS, SAMPLE_INDICES, generate


class BenchmarkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.rg_path = shutil.which("rg")
        if cls.rg_path is None:
            raise unittest.SkipTest("ripgrep is required")
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name) / "corpus"
        generate(cls.root, seed=42, filler_lines=64)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.temp.cleanup()

    def benchmark(self) -> Benchmark:
        return Benchmark(self.root, warm_runs=1, rg_path=self.rg_path)

    def test_full_run_and_manifest(self) -> None:
        """The original corpus must pass every measured workload, including writes."""
        manifest = json.loads((self.root / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(len(manifest["sizes"]), DOCUMENTS)
        self.assertEqual(len(manifest["sha256"]), DOCUMENTS)
        self.assertEqual(len(manifest["tails"]), len(SAMPLE_INDICES))
        bench = self.benchmark()
        bench.run(skip_writes=False)
        self.assertTrue(all(row[-1] == "OK" for row in bench.rows))
        self.assertIn("file sync", {row[0] for row in bench.rows})
        self.assertFalse(list((self.root / "docs").glob(".vfs-benchmark-*")))

    def test_detects_corruption_after_markers(self) -> None:
        """Observed sizes and matching search markers cannot redefine the oracle."""
        path = self.root / "docs" / self.benchmark().paths[0]
        original = path.read_bytes()
        try:
            marker_end = original.index(b"BENCH_COMMON_SIGNAL\n") + len(b"BENCH_COMMON_SIGNAL\n")
            path.write_bytes(original[:marker_end])
            with self.assertRaisesRegex(ValueError, "sizes or paths differ from manifest"):
                self.benchmark().run(skip_writes=True)

            path.write_bytes(original[:-1] + b"!")
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                self.benchmark().run(skip_writes=True)
        finally:
            path.write_bytes(original)

    def test_pread_rejects_wrong_bytes_at_correct_size(self) -> None:
        """A VFS returning a different block at the requested offset must fail."""
        bench = self.benchmark()
        path = bench.paths[min(SAMPLE_INDICES)]
        actual = bench.pread_sample([path])
        bench.verify_pread(actual, [path])
        expected = actual[path]
        self.assertEqual(len(expected), 4096)
        with self.assertRaisesRegex(ValueError, "incorrect pread tail"):
            bench.verify_pread({path: expected[1:] + expected[:1]}, [path])

    def test_rejects_transient_corruption_during_timed_read(self) -> None:
        """A later correct read must not hide bytes corrupted in the measured pass."""
        bench = self.benchmark()
        target = self.root / "docs" / bench.paths[0]
        read_bytes = Path.read_bytes
        corrupted = False

        def read_once_wrong(path: Path) -> bytes:
            nonlocal corrupted
            data = read_bytes(path)
            if path == target and not corrupted:
                corrupted = True
                return data[:-1] + b"!"
            return data

        with patch.object(Path, "read_bytes", read_once_wrong):
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                bench.run(skip_writes=True)
        self.assertTrue(corrupted)

    def test_relative_path_rg_still_works_after_chdir(self) -> None:
        """The version probe and search must use the same absolute executable."""
        bin_dir = self.root.parent / "bin"
        bin_dir.mkdir()
        (bin_dir / "rg").symlink_to(self.rg_path)
        try:
            env = {**os.environ, "PATH": "bin" + os.pathsep + os.environ.get("PATH", "")}
            result = subprocess.run(
                [sys.executable, str(Path(__file__).resolve().with_name("benchmark.py")),
                 str(self.root), "--warm-runs", "1", "--skip-writes"],
                cwd=self.root.parent, env=env, capture_output=True, text=True, check=False,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn(str((bin_dir / "rg").resolve()), result.stdout)
            self.assertIn("rg --files", result.stdout)
        finally:
            (bin_dir / "rg").unlink()
            bin_dir.rmdir()

    def test_ignores_ambient_ignore_rules(self) -> None:
        """Parent and local ignore rules must not change the fixed corpus."""
        parent_ignore = self.root / ".ignore"
        ignore = self.root / "docs" / ".ignore"
        parent_ignore.write_text("*.txt\n", encoding="utf-8")
        ignore.write_text("*.txt\n", encoding="utf-8")
        try:
            bench = self.benchmark()
            bench.check_rg(bench.rg("--files"), {f"./{path}" for path in bench.paths})
        finally:
            ignore.unlink()
            parent_ignore.unlink()


if __name__ == "__main__":
    unittest.main()

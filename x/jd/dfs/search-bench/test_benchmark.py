import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import lancedb
from lancedb.expr import col

from benchmark import evaluate, percentiles
from corpus import digest, make_corpus, query_cases, write_corpus
from lance_backend import canonical_filter


class CorpusTests(unittest.TestCase):
    def test_reproducible_corpus_and_queries(self):
        first = make_corpus(100, 42)
        second = make_corpus(100, 42)
        self.assertEqual(digest(first), digest(second))
        self.assertEqual(digest(query_cases(first)), digest(query_cases(second)))
        self.assertNotEqual(digest(first), digest(make_corpus(100, 43)))
        paths = {r["path"] for r in first["files"]} | set(first["empty_directories"])
        self.assertEqual(len(paths), len(first["files"]) + 1)
        for case in query_cases(first):
            self.assertLessEqual(set(case["expected"]), paths)

    def test_existing_corpus_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "corpus"
            write_corpus(make_corpus(10, 42), root)
            target = root / "public/quarterly-plan.md"
            before = target.read_bytes()
            with self.assertRaises(FileExistsError):
                write_corpus(make_corpus(10, 43), root)
            self.assertEqual(target.read_bytes(), before)


class QueryTests(unittest.TestCase):
    def test_native_filter_composition_on_real_lance(self):
        with tempfile.TemporaryDirectory() as directory:
            table = lancedb.connect(directory).create_table(
                "nodes",
                [
                    {"node_id": "allowed", "basename": "O'Brien.txt", "kind": "File"},
                    {"node_id": "denied", "basename": "secret.txt", "kind": "File"},
                ],
            )
            for predicate in [
                "1=1",
                "basename = 'secret.txt' OR 1=1",
                "1=1 -- trailing comment",
                "basename = 'O''Brien.txt'",
            ]:
                with self.subTest(predicate=predicate):
                    rows = (
                        table.search()
                        .where(canonical_filter(predicate))
                        .where(col("node_id").isin(["allowed"]))
                        .to_list()
                    )
                    self.assertEqual([r["node_id"] for r in rows], ["allowed"])

    def test_filter_escapes_and_hidden_columns_rejected(self):
        for predicate in [
            "1=1) OR 1=1 --",
            "1=1; SELECT 1",
            "1=1 LIMIT 10",
            "node_id = 'hidden'",
            "EXISTS (SELECT 1)",
            "1=1 UNION SELECT 1",
        ]:
            with (
                self.subTest(predicate=predicate),
                self.assertRaises((ValueError, TypeError)),
            ):
                canonical_filter(predicate)

    def test_checker_rejects_leaks_duplicates_and_short_pages(self):
        case = {"expected": ["a", "b"], "limit": 2}
        for hits in [
            [],
            [{"node_id": "a"}],
            [{"node_id": "a"}, {"node_id": "secret"}],
            [{"node_id": "a"}, {"node_id": "a"}],
        ]:
            with self.subTest(hits=hits), self.assertRaises(AssertionError):
                evaluate(case, hits, {"a", "b"}, {"a": "a", "b": "b"})
        self.assertEqual(
            evaluate(
                case,
                [{"node_id": "a"}, {"node_id": "b"}],
                {"a", "b"},
                {"a": "a", "b": "b"},
            )["recall_at_k"],
            1,
        )
        self.assertEqual(percentiles([1, 2, 3, 4, 5])["p95"], 5)


class ReportTests(unittest.TestCase):
    def test_failure_is_reported_and_existing_run_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "run"
            command = [
                sys.executable,
                str(Path(__file__).with_name("benchmark.py")),
                "--output",
                str(output),
                "--bin",
                str(Path(directory) / "missing"),
                "--files",
                "10",
                "--rounds",
                "1",
            ]
            first = subprocess.run(
                command, check=False, capture_output=True, timeout=30
            )
            self.assertNotEqual(first.returncode, 0)
            before = (output / "report.json").read_bytes()
            report = json.loads(before)
            self.assertFalse(report["passed"])
            self.assertIn("fatal_error", report)
            second = subprocess.run(
                command, check=False, capture_output=True, timeout=30
            )
            self.assertNotEqual(second.returncode, 0)
            self.assertEqual((output / "report.json").read_bytes(), before)


if __name__ == "__main__":
    unittest.main()

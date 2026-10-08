import argparse
import hashlib
import importlib.metadata
import json
import math
import os
import platform
import random
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import psutil

from corpus import digest, make_corpus, query_cases, write_corpus
from dfs import DFS, paths_from_view
from lance_backend import LanceBackend


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def fingerprint(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def percentiles(values):
    ordered = sorted(values)
    return {
        f"p{p}": ordered[max(0, math.ceil(len(ordered) * p / 100) - 1)]
        for p in (50, 95, 99)
    }


def indexed_rows(dfs, corpus, identity="admin"):
    view = dfs.view(identity)
    paths = paths_from_view(view)
    texts = {"/files/corpus/" + r["path"]: r["text"] for r in corpus["files"]}
    rows = [
        {
            "node_id": r["node"]["id"],
            "basename": r["node"]["name"],
            "kind": r["node"]["kind"],
            "source_version": r["node"]["version"],
            "entry_token": r["node"]["entry_token"],
            "text": texts.get(paths[r["node"]["id"]], ""),
        }
        for r in view["nodes"]
    ]
    files = [row for row in rows if row["kind"] == "File"]
    for start in range(0, len(files), 128):
        batch = files[start : start + 128]
        data = dfs.call(
            identity,
            {
                "ReadPack": {
                    "ranges": [
                        {
                            "node": row["node_id"],
                            "version": row["source_version"],
                            "offset": 0,
                            "size": len(row["text"].encode()) + 1,
                        }
                        for row in batch
                    ]
                }
            },
        )["Pack"]
        for row, content in zip(batch, data, strict=True):
            require(
                bytes(content) == row["text"].encode(),
                "imported DFS bytes differ from fixture",
            )
    return rows, {
        path.removeprefix("/files/corpus/"): node_id for node_id, path in paths.items()
    }


def evaluate(case, results, eligible, mapping):
    expected = {mapping[path] for path in case["expected"]} & set(eligible)
    actual = [row["node_id"] for row in results]
    require(len(actual) == len(set(actual)), "duplicate result identity")
    require(set(actual) <= expected, "unauthorized or irrelevant result")
    target_count = min(case["limit"], max(0, len(expected) - case.get("offset", 0)))
    require(
        len(actual) == target_count,
        f"expected {target_count} authorized hits, got {len(actual)}",
    )
    scores = [r["_score"] for r in results if "_score" in r]
    require(all(math.isfinite(x) for x in scores), "non-finite native score")
    require(scores == sorted(scores, reverse=True), "native scores out of order")
    return {
        "relevant_count": len(expected),
        "recall_at_k": len(actual) / len(expected) if expected else None,
        "precision_at_k": 1.0 if actual else None,
        "result_ids": actual,
    }


def run_checks(backend, dfs, mapping, rows):
    records = []
    alice = dfs.identities[1]["principal"]
    by_id = {row["node_id"]: row for row in rows}

    def check(name, fn):
        started_ns = time.perf_counter_ns()
        try:
            fn()
            record = {"name": name, "passed": True}
        except Exception as error:
            record = {"name": name, "passed": False, "error": str(error)}
        records.append(
            {**record, "elapsed_ms": (time.perf_counter_ns() - started_ns) / 1e6}
        )

    def search(term, identity="alice", hook=None):
        return backend.search(
            {"field": "text", "query": term, "limit": 20}, identity, hook
        )[0]

    def expect(term, expected, identity="alice"):
        actual = {r["node_id"] for r in search(term, identity)}
        require(
            actual == {mapping[p] for p in expected},
            f"unexpected hits for {term}/{identity}",
        )

    def direct_read():
        node = mapping["private/shared.txt"]
        data = dfs.call(
            "alice",
            {
                "Read": {
                    "node": node,
                    "version": None,
                    "offset": 0,
                    "size": 1000,
                    "handle": None,
                }
            },
        )
        require(
            bytes(data["Data"]).decode() == by_id[node]["text"], "DFS Read disagrees"
        )
        denied = False
        try:
            dfs.call(
                "alice",
                {
                    "Read": {
                        "node": mapping["private/list-only.txt"],
                        "version": None,
                        "offset": 0,
                        "size": 1000,
                        "handle": None,
                    }
                },
            )
        except RuntimeError as error:
            require("13:" in str(error), "expected EACCES, not an unrelated failure")
            denied = True
        require(denied, "metadata-only file body readable")

    check("real_dfs_read_and_denial", direct_read)
    check(
        "no_grants_returns_empty",
        lambda: require(
            not search("commonneedle", "noaccess"), "ungranted principal got results"
        ),
    )
    check("bob_cannot_inherit_other_group", lambda: expect("movingbeacon", [], "bob"))

    def expired():
        rejected = False
        try:
            search("commonneedle", "expired")
        except RuntimeError as error:
            require(
                "credential expired" in str(error), "unexpected authentication failure"
            )
            rejected = True
        require(rejected, "expired credential accepted")

    check("expired_identity_rejected", expired)
    check(
        "direct_share_visible", lambda: expect("directbeacon", ["private/shared.txt"])
    )
    check(
        "scoped_session_excludes_direct_share",
        lambda: expect("directbeacon", [], "scoped"),
    )
    check("metadata_grant_cannot_search_body", lambda: expect("forbiddenbody", []))
    check(
        "cross_tenant_same_query",
        lambda: require(not search("crossworkspacebeacon"), "other tenant leaked"),
    )
    check(
        "other_tenant_can_search_own_body",
        lambda: require(
            len(search("crossworkspacebeacon", "alice-1")) == 1,
            "other tenant missing own row",
        ),
    )

    def hidden_parent():
        hits = search("directbeacon")
        require(len(hits) == 1, "missing shared file")
        require(
            hits[0]["visible_path"].startswith("/shared/shared.txt~"),
            "wrong projected path",
        )
        require("private" not in json.dumps(hits), "hidden ancestry leaked")

    check("hidden_parent_projection", hidden_parent)

    def revoke_group():
        dfs.member(alice, False)
        expect("movingbeacon", [])
        expect("overlapbeacon", ["group/overlap.txt"])

    check("group_revocation_preserves_direct_grant", revoke_group)
    check(
        "grant_restore_without_reindex",
        lambda: (dfs.member(alice, True), expect("movingbeacon", ["group/moving.txt"])),
    )

    def revoke_during_query():
        hits = search(
            "directbeacon",
            hook=lambda: dfs.grant(mapping["private/shared.txt"], alice, 0),
        )
        require(not hits, "revoked hit escaped final validation")
        expect("directbeacon", [])

    check("revocation_between_retrieval_and_response", revoke_during_query)
    check(
        "direct_grant_restore_without_reindex",
        lambda: (
            dfs.grant(mapping["private/shared.txt"], alice, 1),
            expect("directbeacon", ["private/shared.txt"]),
        ),
    )

    def move_hidden():
        node = next(
            r["node"]
            for r in dfs.view("admin")["nodes"]
            if r["node"]["id"] == mapping["group/moving.txt"]
        )
        dfs.mutate(
            "Rename",
            {
                "parent": node["parent"],
                "name": node["name"],
                "expected": node["entry_token"],
                "new_parent": mapping["private"],
                "new_name": "moving.txt",
                "destination": None,
            },
        )
        expect("movingbeacon", [])

    check("subtree_move_changes_inherited_permissions", move_hidden)

    def edit():
        old = by_id[mapping["public/edit.txt"]]
        outcome = dfs.mutate(
            "Write",
            {
                "node": old["node_id"],
                "base": old["source_version"],
                "offset": 0,
                "data": list(b"commonneedle aftereditbeacon!"),
                "append": False,
                "handle": None,
            },
        )
        expect("beforeeditbeacon", [])
        updated = {
            **old,
            "source_version": outcome["node"]["version"],
            "text": "commonneedle aftereditbeacon!",
        }
        backend.replace(updated)
        expect("aftereditbeacon", ["public/edit.txt"])
        expect("beforeeditbeacon", [])

    check("stale_content_suppressed_then_upserted", edit)

    def unlink():
        node_id = mapping["public/delete.txt"]
        node = next(
            r["node"] for r in dfs.view("admin")["nodes"] if r["node"]["id"] == node_id
        )
        dfs.mutate(
            "Unlink",
            {
                "parent": node["parent"],
                "name": node["name"],
                "expected": node["entry_token"],
                "directory": False,
            },
        )
        expect("deletebeacon", [])
        backend.delete(node_id)
        expect("deletebeacon", [])
        outcome = dfs.mutate(
            "Create",
            {
                "parent": node["parent"],
                "name": node["name"],
                "kind": "File",
                "mode": 420,
            },
        )
        require(outcome["node"]["id"] != node_id, "recreated path reused identity")
        expect("deletebeacon", [])

    check("delete_stale_index_and_recreate", unlink)

    def replace():
        nodes = {r["node"]["id"]: r["node"] for r in dfs.view("admin")["nodes"]}
        source = nodes[mapping["public/replace-source.txt"]]
        dest = nodes[mapping["public/replace-target.txt"]]
        outcome = dfs.mutate(
            "Rename",
            {
                "parent": source["parent"],
                "name": source["name"],
                "expected": source["entry_token"],
                "new_parent": dest["parent"],
                "new_name": dest["name"],
                "destination": dest["entry_token"],
            },
        )
        expect("targetbeacon", [])
        expect("sourcebeacon", [])
        backend.delete(dest["id"])
        backend.replace(
            {
                **by_id[source["id"]],
                "basename": dest["name"],
                "entry_token": outcome["node"]["entry_token"],
            }
        )
        expect("sourcebeacon", ["public/replace-source.txt"])

    check("rename_overwrite_removes_destination", replace)
    check(
        "reopen_persistent_index",
        lambda: (backend.reopen(), expect("directbeacon", ["private/shared.txt"])),
    )

    def malformed_filter():
        rejected = False
        try:
            backend.search(
                {
                    "field": "text",
                    "query": "commonneedle",
                    "filter": "1=1) OR 1=1 --",
                    "limit": 20,
                },
                "alice",
            )
        except (ValueError, RuntimeError):
            rejected = True
        require(rejected, "malformed filter accepted")

    check("filter_escape_rejected", malformed_filter)
    return records


def run(args):
    args.output.mkdir(parents=True, exist_ok=False)
    private = args.output / "private"
    private.mkdir(mode=0o700)
    report = {
        "schema": 1,
        "passed": False,
        "mode": "embedded-lance-with-real-dfs-grants",
        "limitations": [
            "No HTTP search service or journal indexer",
            "DFS CLI process/login overhead included separately",
            "First invocation is not a cold-cache measurement",
            "Synthetic whole-file text rows, not passage indexing",
        ],
        "settings": {
            "files": args.files,
            "seed": args.seed,
            "rounds": args.rounds,
            "concurrency": args.concurrency,
        },
        "checks": [],
        "samples": [],
    }
    dfs = None
    try:
        source = Path(__file__).parent
        report["environment"] = {
            "python": sys.version,
            "platform": platform.platform(),
            "cpu_count": os.cpu_count(),
            "git_revision": subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=source, text=True
            ).strip(),
            "dfs_sources": {
                str(p.relative_to(source.parent)): fingerprint(p)
                for p in sorted((source.parent / "src").rglob("*.rs"))
            },
            "dfs_cargo_lock_sha256": fingerprint(source.parent / "Cargo.lock"),
            "pyproject_sha256": fingerprint(source / "pyproject.toml"),
            "dependencies": {
                name: importlib.metadata.version(name)
                for name in ("lancedb", "pyarrow", "numpy", "psutil", "sqlglot")
            },
            "sources": {p.name: fingerprint(p) for p in sorted(source.glob("*.py"))},
            "lock_sha256": fingerprint(source / "uv.lock"),
            "binaries": {
                name: fingerprint(args.bin / name) for name in ("dfsd", "dfsctl")
            },
            "cache_control": "none",
            "lance_cpu_threads": os.environ.get("LANCE_CPU_THREADS"),
            "lance_io_threads": os.environ.get("LANCE_IO_THREADS"),
        }
        corpus = make_corpus(args.files, args.seed)
        cases = query_cases(corpus)
        report["corpus_sha256"] = digest(corpus)
        report["queries_sha256"] = digest(cases)
        write_json(args.output / "corpus.json", corpus)
        write_json(args.output / "queries.json", cases)
        write_corpus(corpus, private / "corpus")
        dfs = DFS(args.bin, private)
        dfs.start()
        report["import"] = dfs.import_tree(private / "corpus")
        rows, mapping = indexed_rows(dfs, corpus)
        alice, bob = dfs.identities[1]["principal"], dfs.identities[2]["principal"]
        dfs.grant(mapping["public"], alice, 13)
        dfs.grant(mapping["public"], bob, 13)
        dfs.grant(mapping["group"], "search-team", 13)
        dfs.member(alice, True)
        dfs.grant(mapping["private/shared.txt"], alice, 1)
        dfs.grant(mapping["private/list-only.txt"], alice, 4)
        dfs.grant(mapping["group/overlap.txt"], alice, 1)
        other = {
            "files": [
                {
                    "path": "decoy.txt",
                    "text": "commonneedle rarebeacon crossworkspacebeacon",
                }
            ],
            "empty_directories": [],
        }
        write_corpus(other, private / "other")
        dfs.import_tree(private / "other", "admin-1")
        other_rows, _ = indexed_rows(dfs, other, "admin-1")
        other_root = next(
            r["node"]["id"]
            for r in dfs.view("admin-1")["nodes"]
            if r["visible_name"] == "files"
        )
        dfs.call(
            "admin-1",
            {
                "Grant": {
                    "node": other_root,
                    "subject": dfs.identities[4]["principal"],
                    "verbs": 13,
                }
            },
            "mutate",
        )
        dfs.stop()
        dfs.scoped_identity(mapping["public"])
        dfs.additional_identity("noaccess")
        dfs.additional_identity("expired", expires_ms=1)
        dfs.start()
        started_ns = time.perf_counter_ns()
        backend = LanceBackend(private / "lance", dfs, rows + other_rows)
        report["index_build_ms"] = (time.perf_counter_ns() - started_ns) / 1e6
        report["index_rows"] = len(rows) + len(other_rows)
        report["principals"] = {
            name: {"principal": dfs.identities[index]["principal"], "admin": False}
            for name, index in (("alice", 1), ("bob", 2), ("scoped", 1), ("alice-1", 4))
        }
        samples_file = (args.output / "samples.jsonl").open("w")

        def measure(item):
            phase, round_index, identity, case = item
            started_ns = time.perf_counter_ns()
            record = {
                "phase": phase,
                "round": round_index,
                "identity": identity,
                "case": case["name"],
            }
            try:
                hits, timings, eligible = backend.search(case, identity)
                record.update(timings)
                record.update(evaluate(case, hits, eligible, mapping))
                record["passed"] = True
            except Exception as error:
                record.update(
                    {
                        "passed": False,
                        "error": str(error),
                        "total_ms": (time.perf_counter_ns() - started_ns) / 1e6,
                    }
                )
            return record

        try:
            first = [
                ("first_invocation", 0, identity, case)
                for identity in ("alice", "bob", "scoped")
                for case in cases
            ]
            warm = [
                ("warm", r, identity, case)
                for r in range(args.rounds)
                for identity in ("alice", "bob", "scoped")
                for case in cases
            ]
            random.Random(args.seed).shuffle(warm)
            report["phases"] = []
            for workload in (first, warm):
                phase_started_ns = time.perf_counter_ns()
                with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
                    for record in pool.map(measure, workload):
                        report["samples"].append(record)
                        samples_file.write(json.dumps(record) + "\n")
                        samples_file.flush()
                elapsed_seconds = (time.perf_counter_ns() - phase_started_ns) / 1e9
                report["phases"].append(
                    {
                        "phase": workload[0][0],
                        "elapsed_seconds": elapsed_seconds,
                        "completed_queries_per_second": len(workload) / elapsed_seconds,
                    }
                )
        finally:
            samples_file.close()
        report["checks"] = run_checks(backend, dfs, mapping, rows)
        report["dfs_rss_bytes"] = psutil.Process(dfs.process.pid).memory_info().rss
        dfs.stop()
        failed_closed = False
        try:
            backend.search(cases[0], "alice")
        except RuntimeError:
            failed_closed = True
        report["checks"].append(
            {"name": "authority_unavailable_fails_closed", "passed": failed_closed}
        )
        report["peak_process_rss_note"] = (
            "RSS snapshot after queries; not a peak or cgroup measurement"
        )
        report["process_rss_bytes"] = psutil.Process().memory_info().rss
        report["index_bytes"] = sum(
            p.stat().st_size for p in (private / "lance").rglob("*") if p.is_file()
        )
        report["passed"] = all(
            r["passed"] for r in report["samples"] + report["checks"]
        )
        report["summary"] = {}
        for case in cases:
            for identity in ("alice", "bob", "scoped"):
                selected = [
                    r
                    for r in report["samples"]
                    if r["phase"] == "warm"
                    and r["case"] == case["name"]
                    and r["identity"] == identity
                ]
                report["summary"][f"{identity}/{case['name']}"] = {
                    "samples": len(selected),
                    "failures": sum(not r["passed"] for r in selected),
                    "total_ms": percentiles([r["total_ms"] for r in selected]),
                    "lance_ms": percentiles(
                        [r["lance_ms"] for r in selected if "lance_ms" in r]
                    )
                    if any("lance_ms" in r for r in selected)
                    else None,
                }
    except Exception as error:
        report["fatal_error"] = str(error)
    finally:
        if dfs is not None:
            try:
                dfs.stop()
            except Exception as error:
                report["passed"] = False
                report["cleanup_error"] = str(error)
        write_json(args.output / "report.json", report)
    print(
        json.dumps(
            {
                "passed": report["passed"],
                "samples": len(report["samples"]),
                "checks": len(report["checks"]),
                "report": str(args.output / "report.json"),
            }
        )
    )
    return 0 if report["passed"] else 1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--bin", type=Path, default=Path(__file__).resolve().parents[1] / "target/debug"
    )
    parser.add_argument("--files", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--rounds", type=int, default=5)
    parser.add_argument("--concurrency", type=int, default=1)
    args = parser.parse_args()
    if (
        not 10 <= args.files <= 100000
        or not 1 <= args.rounds <= 1000
        or not 1 <= args.concurrency <= 32
    ):
        parser.error("files: 10..100000; rounds: 1..1000; concurrency: 1..32")
    args.output = args.output.resolve()
    args.bin = args.bin.resolve()
    return run(args)


if __name__ == "__main__":
    sys.exit(main())

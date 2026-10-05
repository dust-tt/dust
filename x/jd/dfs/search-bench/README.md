# DFS search testbench

**Execution requirement:** Deploy and run all builds, correctness checks, recovery tests, and benchmarks directly on GCP resources in project `dust-dev`. Pass `--project=dust-dev` explicitly to GCP commands. Do not run local tests, benchmarks, or Docker validation. Local work is limited to editing, preparing uploads, orchestration, and reviewing exported evidence. Run the commands below on the GCP VM; see [deployment instructions](../DEPLOYMENT.md).

This is an executable experiment for native Lance queries with real DFS authorization. It follows the existing filesystem benchmark's seeded fixtures, correctness gates, raw results, and isolated output directories. See the [design doc](../LANCEDB_SEARCH_DESIGN.md) for the Core/Qdrant comparison and architecture choices.

The [local validation results](../results/search/README.md) retain a 1,000-file run and a four-client concurrency run, including raw samples and grant checks.

It runs a private local DFS server and embeds LanceDB in Python. It does not implement the proposed search HTTP service, WAL/journal consumer, or async indexer. The benchmark adapter is experimental code, not a production authorization gateway.

## Run

Requires `uv`, Python 3.12 (managed by uv), and the DFS Rust build prerequisites listed in the parent README. No FUSE, cloud credentials, Product services, or preexisting databases are required. Build both binaries from the same source:

```sh
cd x/jd/dfs
cargo build --locked --bin dfsd --bin dfsctl
cd search-bench
uv sync --locked --python 3.12
uv run --locked python -m unittest -v
uv run --locked python benchmark.py \
  --files 1000 --seed 42 --rounds 5 --concurrency 1 \
  --output ../runtime/search-run-01
```

Run again with a new output path. Existing paths are rejected, including partial failed runs. For a quick smoke test, use `--files 30 --rounds 1`. `--files` controls generated filler documents; 15 fixed edge-case files, directories, and a second workspace decoy are additional. Fixed edge cases remain present at every size.

For load comparison, repeat the same corpus and rounds with `--concurrency 4`. A larger corpus uses `--files 10000`. Imports and individual DFS CLI operations currently have a 60-second timeout; exceeding it is an explicit failed run. Prefer release binaries for meaningful DFS cost measurements:

```sh
cd ..
cargo build --locked --release --bin dfsd --bin dfsctl
cd search-bench
uv run --locked python benchmark.py \
  --bin ../target/release --files 10000 --seed 42 --rounds 20 \
  --output ../runtime/search-release-01
```

Use an otherwise idle machine for timing comparisons. The benchmark records the actual binary hashes; a debug run is not interchangeable with a release run. No cache-dropping commands run. First invocation means the first query of that workload/identity in the process, not cold OS or index caches.

## Fixtures and permission model

Generation is deterministic for seed and file count. DFS generates fresh opaque identities and versions per run, so reproducibility is defined by logical fixtures and query expectations, not identical UUIDs or equal-score ordering.

| Identity | Real DFS setup |
| --- | --- |
| Alice | Inherited READ/LIST/TRAVERSE on public files; group access to another subtree; direct shares; a metadata-only file. |
| Bob | Public subtree only. |
| Scoped Alice | Same principal and grants, with the credential scope restricted to the public subtree. |
| No access | Authenticated identity with no grants. |
| Expired | Expired real DFS credential. |
| Other workspace Alice | Read access to a second workspace containing a high-relevance decoy. |

Administrative credentials only import, read back fixture bytes, and perform policy/mutation setup. Measured queries obtain eligible node IDs from the caller's actual DFS `View`; content additionally requires its READ verb. The harness does not implement inheritance, membership, or effective-grant resolution. It revalidates returned identities, versions, bindings, and visible paths through DFS before returning a result.

For isolation testing, the two workspaces deliberately share a physical Lance table. This stresses mandatory eligibility filtering; it is not a change to the design's initial table-per-workspace recommendation. Metadata and content use separate tables so a metadata-only grant cannot select or filter body text. Tests deliberately retain stale index rows during revocation, mutation, and deletion.

## Cases

The 16 repeated workloads cover exact/prefix/substring names, native fuzzy FTS, Unicode, escaped apostrophes, duplicate basenames, empty folders, phrase and rare/common content queries, no matches, direct shares, metadata-versus-content rights, and an `OR` client filter that must not weaken authorization. Each runs as Alice, Bob, and scoped Alice, once initially and then in seed-shuffled rounds.

Separate stateful checks cover actual DFS read/denial, no grants, group inheritance and revocation with surviving direct grants, restore without reindex, expiry, hidden ancestry, scoped shares, workspace isolation, revoke between retrieval and final validation, moving out of an inherited grant, editing before index refresh, deletion/recreation, rename-overwrite, persistent index reopen, malformed-filter rejection, and authority unavailability.

No database is mocked. Unit tests verify deterministic generation, refusal to overwrite files, real Lance filter composition, rejection of escaped predicates/private columns, detection of bad result sets, and failed-run reporting. Pure result-checker tests deliberately supply invalid row sets to ensure a broken backend cannot pass.

## Reading results

Every run emits:

- `corpus.json` and `queries.json`: deterministic fixtures and relevance expectations.
- `samples.jsonl`: one flushed record per completed query, including failures, phase, identity, result IDs, and component timings.
- `report.json`: settings, fingerprints, environment, every query sample, scenario outcomes, per-case/identity p50/p95/p99, phase throughput, index build time/size, and process RSS snapshots.
- `private/`: disposable databases, imported files, server logs, and credentials. This directory is mode 0700 and must not be included in shared result exports.

Exit status is nonzero for any failed case or fatal error. A report with `passed=false` cannot support performance claims. The report retains source/dependency/binary hashes and the Git revision; Git revision alone does not describe untracked prototype code. Compare corpus/query hashes before comparing runs. Timing percentiles use nearest rank; with few rounds p99 is effectively the maximum. Phase throughput includes correctness checking and report collection overhead.

`authorization_ms` includes starting `dfsctl`, logging in, and retrieving the full authorized view. `lance_ms` includes filter compilation and native query materialization. `validation_ms` includes a second DFS CLI/view call and result projection. `total_ms` covers all three. This makes the cost of the current full-view approach visible, but does not predict latency of a future persistent RPC connection or batched authorization API. Failed calls retain their elapsed time; a missing engine timing is not converted to zero.

Expected result sets come from known literal/fixture matches intersected with actual DFS eligibility. Checks reject unauthorized or irrelevant hits, duplicates, short top-k pages, and non-finite/out-of-order native scores. Tied results may differ across runs. `recall_at_k` is returned relevant rows divided by the complete eligible relevant set, so a common query with many matches naturally has low recall at 20; it is not a relevance regression by itself. The suite does not claim to measure human judgments of real-world ranking.

Text is one row per file in this first bench, using native BM25 with stemming/stop-word removal disabled and positions enabled. Filename FTS has the same language settings without positions; substring cases use native `LIKE`. Incremental updates are exercised before an optimize call. The dependency lock currently selects LanceDB 0.39.0. The Python wrapper's SQL string composition required complete-expression validation: SQLGlot canonicalizes this bench's scalar filters, and only `basename` and `kind` are queryable filter fields. Native Rust query parity, arbitrary SQL expressions, passage boundaries, and multi-language relevance need separate experiments.

## Extending the bench

Add deterministic query fixtures in `corpus.py`, measured adapter behavior in `lance_backend.py`, and policy/mutation scenarios in `run_checks` in `benchmark.py`. Keep DFS as the authority. Keep expectations independent of the search results; do not generate ground truth by asking the index being tested.

When the HTTP service and journal worker exist, add a second backend using the same fixtures and result checks, then measure persisted-source-to-index visibility, dropped wakeups, consumer restart/replay, snapshot expiry, and manifest crash boundaries. These are explicitly untested today. Full resource peaks/cgroups, latency under sustained writes, binary extraction, passage-based retrieval, and production-scale authorization sets are also future test dimensions.

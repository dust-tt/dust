# v5 Search measurements

## Search API, 2026-10-07

All 13 real-gRPC cases passed locally and on the existing GCP fixture. The shared corpus contains
10,000 files (177,499,149 bytes) and 100 directories. Every first sample starts a new server, session
and connection; each case then has 20 repeats. FDB/ES/OS caches remain. Warm denotes a retained
process/connection, not a guarantee that the asynchronously built permission tree was ready before
every sample. P95 is nearest rank (19th of 20).

| Query | Local first ms | Local median ms | Local p95 ms | GCP first ms | GCP median ms | GCP p95 ms | Hits |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Rare keyword | 11.69 | 3.88 | 10.90 | 16.03 | 13.67 | 15.76 | 4 |
| Case-insensitive keyword | 18.76 | 8.27 | 17.22 | 37.77 | 18.01 | 42.70 | 100 |
| Broad keyword, top 20 | 19.35 | 6.77 | 20.19 | 35.24 | 13.20 | 34.23 | 20 |
| Metadata + MIME + size | 13.43 | 10.48 | 14.16 | 32.83 | 22.57 | 32.58 | 100 |
| Keyword + xattr equality | 6.63 | 5.42 | 7.30 | 11.03 | 9.23 | 10.96 | 2 |
| Binary xattr equality | 6.63 | 5.23 | 7.33 | 11.05 | 8.61 | 10.19 | 1 |
| Rare keyword, selective grant | 13.43 | 5.39 | 11.58 | 13.97 | 12.74 | 15.37 | 1 |
| Rare keyword, 512 grants | 96.51 | 5.10 | 6.25 | 314.53 | 6.47 | 7.06 | 1 |
| Directory metadata, top 20 | 17.55 | 6.02 | 16.06 | 37.94 | 14.08 | 49.12 | 20 |
| Name tokens, files and folders | 17.34 | 6.03 | 20.59 | 32.37 | 13.76 | 37.91 | 20 |
| Recursive directory scope | 11.97 | 7.02 | 14.90 | 17.33 | 8.11 | 16.61 | 1 |
| Direct children scope | 15.14 | 10.36 | 15.11 | 33.49 | 23.31 | 31.59 | 90 |
| Mixed metadata, top 20 | 16.84 | 5.56 | 18.54 | 30.38 | 11.90 | 34.30 | 20 |

| Population/indexing | Local seconds | GCP seconds |
| --- | ---: | ---: |
| RPC population | 2.924 | 4.904 |
| Remaining indexing drain | 20.318 | 27.844 |

Both runs verified an empty durable FDB queue and exactly 10,100 live ES documents. This is RPC
population timing, not FUSE untar. No GetIndexStatus RPC is used.

Both search columns are run `f`, including bounded FDB ranges, resident/peak permission reservations,
1024-object backfill pages, busy-sweep scheduling, bounded pre-commit read retries and generation-bound
ES write aliases. Source identities match. A subsequent cached-client prerequisite-clock correction
does not change the raw gRPC Search path; its filesystem validation is tracked separately below.

Environment: local Apple M4 Max / 64 GiB host, Docker aarch64 / 16 vCPUs / 16 GiB RAM, FDB 7.3.69
single/ssd-2 and ES 8.15.3 with 1 GiB heap / 3 GiB container limit. GCP workload is n2-standard-8
(8 vCPUs / 32 GiB), existing FDB 7.3.69 with 18 processes across four hosts and three zones, double
replication / ssd-2; ES 8.15.3 runs on the workload VM with 2 GiB heap / 4 GiB limit. Each search
index has one primary and no replicas. No cloud resources or FDB settings were changed.

Local search source SHA-256: `71e2b9acc6235dd8f54823f3d96c5f61d6daf6f88af8351b02c63f50a81c454f`.
GCP search source SHA-256: `71e2b9acc6235dd8f54823f3d96c5f61d6daf6f88af8351b02c63f50a81c454f`.
Raw local report: `/tmp/dfs-v5-local-search-20261007-f/run.json` in `dfs-v4-dev-1`; host copy
`/tmp/dfs-v5-local-search-f-run.json`. GCP: `/var/log/dfs-bench/v5/search-20261007-f/run.json`;
host copy `/tmp/dfs-v5-gcp-search-f-run.json`. Prior run `a` reports are retained at the analogous
paths. The initial driver recorded maximum latency in its p95 field; the current driver is fixed.

## Filesystem with background indexing enabled

GCP run `f` failed during post-untar drain with one `writeback.expired_dependency` and no
server mutation RPC errors. It is not a successful benchmark. The client charged an unresolved
prerequisite's RPC wait against W; the corrected clock unions actual prerequisite RPC intervals and
continues to charge queued/local time. Unit tests cover overlap/clipping, and a real-FDB 350 ms
stalled-prerequisite test verifies both writes commit without deadline expiry. Full local tests,
strict clippy, mounted checks and the complete local filesystem run `g` pass, with zero dispatch
expirations. GCP run `h` now also passed all 24 checks, both hash passes and recursive cleanup, with
zero dispatch expirations, no failed client drains and 360.52 MiB peak accounted client memory.
The failed report is retained at `/var/log/dfs-bench/v5/search-fs-20261007-f`; services were restored.

Both full runs passed all 24 timed checks, both full-content hash passes, and recursive cleanup.
Client defaults remain 512 MiB shared accounted memory, 200 ms maximum buffering and 800 ms cache
validity. These are individual runs under background indexing load, not statistical estimates.

| Population | Local g | GCP h |
| --- | ---: | ---: |
| Untar seconds | 5.789 | 15.779 |
| Remaining durable client drain ms | 0 | 25 |

| Workload | Phase | Local previous ms | Local g ms | GCP h ms |
| --- | --- | ---: | ---: | ---: |
| scandir + stat (100 dirs, 10,000 files) | first | 6,321.85 | 5,375.76 | 5,934.46 |
| scandir + stat (100 dirs, 10,000 files) | warm | 5,624.24 | 5,388.64 | 4,396.46 |
| rg --files (10,000 files) | first | 269.56 | 178.72 | 599.09 |
| rg --files (10,000 files) | warm | 13.88 | 16.37 | 33.34 |
| open + fstat + close (10,000 files) | first | 6,324.96 | 6,095.18 | 5,572.45 |
| open + fstat + close (10,000 files) | warm | 5,503.57 | 5,693.23 | 4,286.89 |
| stat missing (256 paths) | first | 1,489.36 | 1,045.11 | 1,751.69 |
| stat missing (256 paths) | warm | 1,254.11 | 473.62 | 392.66 |
| rg no-match scan (10,000 files, 177.5 MB) | first | 6,915.71 | 7,030.62 | 17,179.02 |
| rg no-match scan (10,000 files, 177.5 MB) | warm | 4,412.55 | 4,552.45 | 8,276.52 |
| rg rare literal (10,000 files, 4 matches) | first | 6,244.42 | 6,352.32 | 16,674.01 |
| rg rare literal (10,000 files, 4 matches) | warm | 3,033.68 | 3,028.07 | 7,676.86 |
| rg branch glob (981 candidate files) | first | 1,232.49 | 1,117.38 | 2,147.20 |
| rg branch glob (981 candidate files) | warm | 721.41 | 650.49 | 1,526.98 |
| rg depth-10 subtree (136 files) | first | 341.51 | 296.48 | 549.08 |
| rg depth-10 subtree (136 files) | warm | 122.74 | 118.70 | 261.52 |
| open + read + SHA-256 (10,000 files, 177.5 MB) | first | 21,900.45 | 24,750.62 | 22,185.67 |
| open + read + SHA-256 (10,000 files, 177.5 MB) | warm | 8,316.06 | 8,682.76 | 8,589.08 |
| open + pread tail (256 files x 4 KiB) | first | 2,552.23 | 1,948.50 | 2,741.46 |
| open + pread tail (256 files x 4 KiB) | warm | 702.54 | 598.52 | 480.28 |
| create + write (32 x 32 KiB files) | once | 23.24 | 53.40 | 124.21 |
| fsync (32 files) | once | 25.89 | 8.94 | 36.33 |
| close (32 files) | once | 0.57 | 0.63 | 0.64 |
| unlink (32 files) | once | 6.60 | 9.31 | 8.06 |

The local previous run is the deletion-fix baseline (6.402 s untar + 14 ms drain, no ES worker).
The prior GCP baseline is [RESULTS.md](../gcp/RESULTS.md), with 14.660 s untar + 88 ms drain.
Local untar improved in its sample. GCP untar is 7.6% slower than the prior baseline; most read
workloads improved against search-enabled run `b`, while its small-write sample increased from
67.19 ms to 124.21 ms. Some content passes and small writes remain slower with indexing.
For example, local warm rare grep is 3.028 s versus 3.034 s, and GCP warm rare grep is 7.677 s
versus 6.280 s. These results do not establish absence of performance regressions under indexing load.
No correctness or cleanup failures occurred in the successful runs tabulated here. Both drivers restored the captured interactive service
states; the separate local user demo remained running.

Raw filesystem reports: `/tmp/dfs-v5-local-search-fs-20261007-g/run.json` inside `dfs-v4-dev-1` and
`/var/log/dfs-bench/v5/search-fs-20261007-h/run.json` on GCP. Host copies are
`/tmp/dfs-v5-local-search-fs-g-run.json` and `/tmp/dfs-v5-gcp-search-fs-h-run.json`.
Local server SHA-256: `252d55374842e1d3b43715b07ccf943516faede3eb3d9e791d60b8b3e35ae5a5`.
GCP server SHA-256: `6300dc001d94680d0dbd1e1e7f52dde046c1005dcf150475f817c80a78182193`.
Local FUSE SHA-256: `6b4fd0f9c532eee8d640bc8cca2229b963b3543a3a8b1c2d8b3b1a47fe05842b`.
GCP FUSE SHA-256: `77529713e04d786182f5d4e3b57a23eb5331743888eacf49c056b3a597b90ad9`.

GCP filesystem source SHA-256: `95e0d70b288039fdd5caae2705f1a3b6f0f3c81919d92e6b6a15ba49b3b30788`. Runtime `h` includes the
fixture repair helper; runtime search semantics are unchanged from the matching Search runs `f`.

## Durable scale fixture — in progress

Stronger public-RPC verification found an offline-loader child-index encoding error after the first
tree measurements: tagged 17-byte references prevented lookup/list, although direct reads and tree
bootstrap worked. The corrected loader writes raw 16-byte UUIDs and verifies actual lookup/list.
An idempotent repair validated 10,100 existing local child rows; both repaired and freshly seeded
tenants passed exact bytes, namespace, metadata, inherited/explicit grants and tenant-isolation checks.
Runtime h repaired 1,010,000 GCP child rows for 1M and 2,286,240 for the partially loaded 10M tenant;
second scans changed zero rows. The 1M population then passed actual lookup/list validation and a new
warmup under `scale-20261007-c`. The current table uses that repaired result. The user cancelled 100M
before its population started; only the 1M/10M fixtures and service are now in scope.
Earlier Search and filesystem benchmarks populated through normal RPCs and are unaffected by this
fixture encoding defect.

The offline loader writes complete v5 records, content, metadata, child/grant indexes, tree heads
and log rows, and search obligations in resumable FDB batches. Its 10,000-file / 100-directory
local smoke test passed; a second invocation inserted zero files. This is fixture-loading throughput,
not filesystem throughput.

A fresh process bootstrapped those 10,101 nodes from real FDB in 1.838 s with the original adapter.
Explicit bounded range pages reduced that smoke test to 0.185 s using the same production bootstrap
path. FDB/OS caches remained warm. This is not a million-file result or an extrapolated scale claim.

GCP population uses prefix `dfs-v5-scale-20261007-a`, with private manifests and logs under
`/var/log/dfs-bench/v5/scale-20261007-a`. Initial attempts stopped on FDB `process_behind` during
heavy ingestion. The server now preserves the typed FDB cause and retries only safe pre-commit read
failures with fresh snapshots and bounded backoff. Unknown commits and application failures remain
non-replayable. Real-FDB tests verify discarded attempt writes and exactly one committed increment.
The loader resumed its atomic cursors without duplicating committed objects.

| Tenant | Files | Directories + root | Verified nodes | FDB bootstrap s | Tree MiB | Final RSS MiB | Peak RSS MiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1M | 1,000,000 | 10,001 | 1,010,001 | 15.759 | 86.85 | 99.01 | 116.34 |
| 10M | pending | pending | pending | pending | pending | pending | pending |
| 100M | deferred by user | — | — | — | — | — | — |

The 1M warmup used the production `Replica::bootstrap`, a fresh process, 4096-node bounded base pages,
and a 24 GiB peak allowance. FDB/OS caches remained. RSS before the repeated bootstrap was
22.58 MiB. All 748 sampled objects allowed the owner and denied empty grants.
FDB may return a partial range page, so the sample can be shorter than its row limit. The exact
node count is checked across the complete loaded tree. The final successful loader invocation took
156.454 seconds to finish its remaining files; it excludes earlier partial attempts and is not a
full-population throughput measurement.

Raw report: `/var/log/dfs-bench/v5/scale-20261007-c/run.json`; raw warmup:
`/var/log/dfs-bench/v5/scale-20261007-c/1m/warmup.log`. The report records binary hashes, FDB configuration
checks and service restoration. A local checkpoint copy is `/tmp/dfs-v5-gcp-scale-c-run.json`.
The 10M attempt subsequently stopped on a pre-commit read timeout. The updated runtime also retries
that case within its shared deadline, and the loader now uses eight concurrent transactions across
its unchanged sixteen durable partitions. Report directory `scale-20261007-b` resumes the same FDB
prefix and private manifests. It repeated the 1M warmup, then was stopped during 10M population for
the child-index repair described above. The replacement `dfs-v5-finalize-20261007-h` job retains
separate reports and proceeds to `scale-20261007-c` after validation and repair. Persistent service
and live access verification remain outstanding. Search publication uses per-incarnation write
aliases to prevent late bulk requests from recreating deleted indices.

The table uses the repaired 1M warmup from report `scale-20261007-c` (15.759 s). Older tree-only
reports remain: `a` at 15.688 s and `b` at 17.537 s. All loaded exactly 1,010,001 nodes and checked
748 permission candidates; the latest 1M loader resume inserted zero additional files. The following
10M attempt added another 200K files, then stopped on FDB process_behind. The driver now resumes only
terminal typed 1031/1037 failures from atomic cursors, lowers concurrency and backs off 30–60 seconds
within eight attempts. Unit `dfs-v5-resume-20261007-i` selects only 1M and 10M, preserving the measured
Rust binaries and all prior logs. The actual 10M warmup and persistent service remain outstanding.

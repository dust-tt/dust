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

## Durable scale fixture, 2026-10-07

Both persistent GCP tenants are populated and verified. The user deferred 100M before its population
started; the current scope is 1M and 10M. FDB prefix: `dfs-v5-scale-20261007-a`. Measurement directory:
`/var/log/dfs-bench/v5/scale-20261007-c`.

The offline loader writes complete objects, content, metadata, child/grant indexes, tree heads/log
rows and search obligations. Sixteen top-level directories branch four ways. Files span depths 2–7
for 1M and 2–9 for 10M, with 100 files per directory on average. Content is 128 bytes normally and
4096 bytes for every thousandth file. Grants include a root owner and selected explicit attachments
from a 64-team dictionary. This is a realistic tree shape with small generated payloads.

| Tenant | Files | Directories + root | Verified nodes | FDB bootstrap s | Tree MiB | Final RSS MiB | Peak RSS MiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1M | 1,000,000 | 10,001 | 1,010,001 | 15.759 | 86.85 | 99.01 | 116.34 |
| 10M | 10,000,000 | 100,001 | 10,100,001 | 147.669 | 806.53 | 513.27 | 727.04 |
| 100M | deferred by user | — | — | — | — | — | — |

Each timed interval calls production `Replica::bootstrap` in a new process, after database/tenant
connection setup, with 4096-node base pages and a 24 GiB peak allowance. FDB/OS caches remain.
RSS before bootstrap was 22.58 MiB / 22.86 MiB.
The exact complete node counts passed, as did owner-allowed and empty-grant-denied checks on 748 /
741 sampled objects. FDB can return partial range pages, so samples can be shorter than the row limit.
Tree memory is conservative accounting; RSS is separately measured process residency and can be lower.
These figures describe the permission tree, not a content/filename cache or an ES index.

| Cluster counters during warmup | 1M | 10M |
| --- | ---: | ---: |
| Read-request counter delta | 10,904 | 125,402 |
| Read-byte counter delta, MiB | 112.39 | 1,569.12 |

These are cluster-wide before/after counter differences, including other activity, not isolated
bootstrap RPC counts. FDB remained available and fully replicated at both boundaries; configuration
was unchanged and the captured interactive service states were restored. The 1M backend was quiet.
The 10M run followed ingestion with 1.40 GiB of queued storage writes, decreasing to 0.96 GiB by the
end, while FDB repartitioned data. These are single measurements under the recorded conditions.

| Tenant storage at 14:16:56 UTC | Estimated logical FDB bytes | GiB | File payload bytes |
| --- | ---: | ---: | ---: |
| 1M | 793,471,750 | 0.739 | 131,968,000 |
| 10M | 8,079,625,500 | 7.525 | 1,319,680,000 |

`fixture_size` uses FDB's byte-sample estimate over each existing tenant prefix without initialization
or writes. This includes metadata, content and remaining durable indexes; it excludes physical
replication/log overhead, ES and RAM. Background indexing/GC can change these stored indexes. The
helper was built after all timed runs, passed strict GCP clippy, and left the server, client, FUSE,
seed and warmup binary hashes unchanged.

The persistent `dfs-v5-scale-server` is live at `http://127.0.0.1:18095` on the workload VM, using
immutable copies of runtime h. Its current-start readiness records verify both complete trees;
these separate live-service bootstraps took 18.130 s / 159.544 s with ES indexing enabled. At
14:20:44 UTC, the combined server had 654.37 MiB RSS and 837.53 MiB process high-water RSS.
These service figures are separate from the fresh-process measurements above.

Public-RPC verification checked six files per tenant (8704 total bytes per tenant), exact content,
MIME metadata, lookup links, the root's 16 directories, inherited/explicit team grants, owner access,
empty-grant rejection and cross-tenant isolation. The owner allowed all nine sampled objects; empty
grants denied all nine. Team-01 allowed 2 / 3 objects and team-07 allowed one per tenant, matching the
fixture oracle. Each tenant rejected the sampled foreign object. Follow-up current-session/root
reads passed, and owner key files were mode 0600. [Usage and renewal commands](../gcp/README.md) keep
credentials in private files; sessions expire after one hour.

The large fixture's full ES drain is not measured here. At 14:20:44 UTC its index was green with
199,680 documents. Metadata Search returned a hit for 1M and no hits yet for 10M: each tenant's
initial FDB backfill must finish before its jobs publish to ES. This is independent of permission-tree
readiness; the 10M filesystem and permission tree are complete while its search index is still
building. The earlier 10K-object Search benchmarks verified their own full indexing drains.

Raw evidence on the workload VM:

- `scale-20261007-c/run.json`, plus each size's `warmup.log`, `fdb-before-warmup.json`,
  `fdb-after-warmup.json` and `service-states.json` under `scale-20261007-c/1m` and `10m`.
- `scale-20261007-c/service-1791382530856184189.json`.
- `scale-20261007-c/verification-1791382534760121244.json`.
- `resume-20261007-i/state.json`: population, both warmups, serving and verification completed.
- `size-20261007-k/state.json`: storage measurements and unchanged runtime identities; build/clippy
  logs and raw per-tenant outputs are retained alongside it.

All paths above are relative to `/var/log/dfs-bench/v5`. Local checkpoint copies are
`/tmp/dfs-v5-gcp-scale-c-run.json` and `/tmp/dfs-v5-gcp-scale-final-evidence.json`.
Seed SHA-256: `e6101a3228f221b82f7ec1553d20acf7bcd3a3fae3b707c7b82b9d0cb8f0cea8`.
Warmup SHA-256: `61abbd2ba4f5f05e8f10826b7760ab659e54c6b74a73b8e4373249fb28a64c9f`.
Size-helper SHA-256: `efb3688f452fd47382579742a21dda15e954bf4b874ceede774225bc44e4dc44`.
The server identity is recorded above and in the service report.

Population resumed previously committed batches: the final invocation inserted 7,608,192 files in
6823.748 s at concurrency four, using the same sixteen durable partitions and 256-file batches.
This excludes earlier attempts and is not full-population or filesystem throughput. FDB storage
write queues limited ingestion. The driver can resume only terminal typed 1031/1037 failures with
bounded backoff and lower concurrency; this final process needed no such restart.

Before these measurements, an offline-loader bug wrote tagged 17-byte child references where
lookup/list require raw 16-byte UUIDs. The fixed loader and its idempotent repair passed local real
RPC checks; GCP repair corrected 1,010,000 1M child rows and 2,286,240 partial-10M rows, and repeat
scans changed zero rows. Normal RPC-created files and the Search/filesystem benchmarks were
unaffected. Older tree-only reports `scale-20261007-a` (15.688 s for 1M) and `b` (17.537 s) remain
historical; the table uses repaired report `c` and the completed 10M fixture.

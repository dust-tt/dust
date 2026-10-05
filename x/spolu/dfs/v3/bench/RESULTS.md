# Benchmark results — dfs v3 localhost

2026-10-05. First baselines, before revision-validated block retention. Both runs use revision
`a090704e0f`, with identical server and FUSE binaries. All **24 checks per run passed**, including
SHA-256 verification of every file; no background publication failures were recorded.

## Configuration and method

- Native Linux ARM64 in Docker Desktop on an Apple M4 Max. Docker VM: 16 vCPUs, 7.65 GiB RAM.
  Rust 1.98.1 release builds; one local FDB 7.3.69 node with native tuning, single SSD storage,
  a 3 GiB container limit, and a persistent Docker volume. No Elasticsearch or GCP.
- Same jd corpus/workloads: **10,000 files, 100 directories, 177,499,149 bytes (177.5 MB)**, seed 42.
  Untar uses an uncompressed archive containing the documents and manifest, 13 directories below
  the tenant root, accessed through `/shared` with an inherited grant.
- Server: 1 GiB cache budget, 256 MiB dirty budget, 16 concurrent publications, 25 ms coalescing.
  Publication deadline and read/authorization cache age each receive half of `D`:
  500 ms each at `D=1000`, 4,000 ms each at `D=8000`.
- FUSE: eight workers, direct I/O, zero name/attribute TTL, no kernel writeback or userspace
  content/xattr/directory-page cache. **Writes and fsync acknowledge server RAM**, not FDB durability.
- Every `first` read row starts a new server, session, and mount; FDB and OS caches remain.
  `warm` is one repeat on that mount. These are single runs, not statistical estimates or
  cold-backend measurements. The 8-second run preceded the 1-second run.

Table labels follow jd's benchmark: `page cache` names a workload category, not an enabled client
cache; `search` means filesystem `rg`, not a search service. Compared with older versions, account
for these different caching, restart, durability, and deep-path conditions.

## Untar

Remaining drain is measured after tar returns and server admission stops. Publication runs
concurrently during untar; drain is only the work left at the end. There is no client writeback.

| Baseline | Untar (s) | Remaining FDB drain (ms) |
| --- | ---: | ---: |
| D = 1s | 68.395 | 18 |
| D = 8s | 138.807 | 33 |

The 8-second untar is **2.03× slower**. Its cause has not yet been profiled. Code inspection suggests
longer retention and repeated scans of the RAM mutation history as a candidate; this is a hypothesis,
not a measured attribution. Both population phases accepted 47,642 edits (including fixture setup),
with 10,264 FDB commits at 1s and 10,230 at 8s. The similar commit counts and short remaining drains
alone do not establish where the extra time went.

## dfs v3 [baseline, D = 1s]

```text
+--------------+------------------------------------------------+-------+-----------+--------+
| Feature      | Workload                                       | Phase | Time (ms) | Result |
+--------------+------------------------------------------------+-------+-----------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 73,848.40 | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 75,101.67 | OK     |
| metadata     | rg --files (10,000 files)                      | first | 428.09    | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 446.71    | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 79,118.89 | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 80,838.60 | OK     |
| metadata     | stat missing (256 paths)                       | first | 1,734.88  | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 1,593.78  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 14,637.51 | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 15,246.08 | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 14,606.26 | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 14,759.51 | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 9,307.78  | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 9,718.84  | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 2,486.97  | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 2,431.64  | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 94,511.55 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 92,402.29 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 2,512.38  | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 2,060.75  | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 172.56    | OK     |
| file sync    | fsync (32 files)                               | once  | 4.45      | OK     |
| write        | close (32 files)                               | once  | 0.61      | OK     |
| write        | unlink (32 files)                              | once  | 180.89    | OK     |
+--------------+------------------------------------------------+-------+-----------+--------+
```

## dfs v3 [baseline, D = 8s]

```text
+--------------+------------------------------------------------+-------+-----------+--------+
| Feature      | Workload                                       | Phase | Time (ms) | Result |
+--------------+------------------------------------------------+-------+-----------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 66,805.00 | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 70,382.25 | OK     |
| metadata     | rg --files (10,000 files)                      | first | 399.05    | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 309.48    | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 71,843.98 | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 72,685.09 | OK     |
| metadata     | stat missing (256 paths)                       | first | 1,562.96  | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 1,307.54  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 16,059.22 | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 16,048.76 | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 15,889.05 | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 16,358.77 | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 10,066.21 | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 10,482.52 | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 2,547.34  | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 2,501.57  | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 83,667.59 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 84,567.64 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 2,202.91  | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 1,450.34  | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 158.63    | OK     |
| file sync    | fsync (32 files)                               | once  | 4.68      | OK     |
| write        | close (32 files)                               | once  | 0.56      | OK     |
| write        | unlink (32 files)                              | once  | 151.39    | OK     |
+--------------+------------------------------------------------+-------+-----------+--------+
```

## Reproduction and pending work

From the dfs directory, using the measured revision:

```sh
v3/local/run up
v3/local/run exec cargo build --workspace --release
v3/local/run exec env MAX_EVENTUAL_CONSISTENCY_DELAY_MS=8000 DFS_BENCH_REVISION=a090704e0f python3 /dfs/v3/bench/run.py
v3/local/run exec env MAX_EVENTUAL_CONSISTENCY_DELAY_MS=1000 DFS_BENCH_REVISION=a090704e0f python3 /dfs/v3/bench/run.py
```

The validated reports remain outside Git in the development container:

- 1s: `/tmp/dfs-v3-benchmark-pelljr65/run.json`.
- 8s: `/tmp/dfs-v3-benchmark-bf5_pgep/run.json`.

Both corpus manifests have SHA-256
`67fdf87da1a1b94bc1f6482f00b912c1010d512a907846e5747ba9c893d8a3c1`.
Earlier pilot/failed runs are excluded. Raw JSON, logs, and credentials are not committed.

The original baselines above are preserved. Investigation and the block-reuse comparison resumed
below. The 100k and networked GCP evaluations remain future work.

## Untar profiling — before block reuse

Opt-in aggregate profiling at revision `35a427d8e5`, otherwise the same setup and workload.
Both populations completed without publication failure. These are additional runs; instrumentation
adds overhead, so the later block-reuse comparison must use the same profiling settings.

| Measurement | D = 1s | D = 8s |
| --- | ---: | ---: |
| Untar wall time (s) | 70.643 | 133.007 |
| Remaining publication drain (ms) | 18 | 10 |
| Client RPC calls | 229,669 | 229,669 |
| Cumulative client RPC time (s) | 65.650 | 127.102 |
| Cumulative server handler time (s) | 46.504 | 103.958 |
| Server CPU, user + system (s) | 37.800 | 110.070 |
| Client CPU, user + system (s) | 18.610 | 20.750 |
| RAM key reads | 12,635,795 | 12,598,142 |
| Retained edits examined by key reads | 2,202,096,489 | 8,440,659,746 |
| RAM overlay scan time (s) | 9.903 | 54.560 |
| RAM read-view construction time (s) | 2.258 | 17.280 |
| History reaping time (s) | 1.642 | 8.150 |
| Publication selection time (s) | 1.504 | 14.472 |
| Cumulative FDB get time (s) | 72.209 | 72.391 |
| Cumulative FDB commit time (s) | 19.411 | 18.257 |

**The longer-window slowdown is in the RAM cache's history scans.**
`Snapshot::load` scans the pinned edit list backwards for each key; `WriteBatch::value` then scans
each edit's mutations. An authorization walk reads multiple parent/grant keys, and hinted prefetch
also passes through this lookup. This produced about 12.6 million key reads in each untar, despite
only 229,669 RPCs. At 8s, the retained history is larger: the same reads examine 8.44 billion edits
instead of 2.20 billion. Building each request's view and scanning publication history also grow.
Key reads should use an indexed overlay rather than a full history scan; block reuse addresses a
different cost and does not fix this behavior.

These timings are **nested and sometimes concurrent**, not additive wall-time categories. In
particular, reaping is included in read-view construction/selection, and FDB reads include parallel
background publication validation. Client RPC time includes server time plus transport, serialization,
and runtime scheduling; their difference is not pure network latency. Population server counters
also include the small untimed fixture setup. CPU samples stop before shutdown/drain.

Profile reports remain outside Git: `/tmp/dfs-v3-benchmark-w4ifis7y` (1s) and
`/tmp/dfs-v3-benchmark-wp7sltav` (8s), inside the development container. The 8s full suite passed all
24 checks. The 1s suite was stopped at the user's request after five complete rows, to prioritize
RAM access optimization. Its untar/profile above completed before that interruption. Full-suite
reruns and block reuse are deferred until the memory-access work is validated.

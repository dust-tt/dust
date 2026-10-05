# Benchmark results — dfs v3 localhost

Latest: [four-run block-retention comparison](#block-retention-comparison) and
[current timing breakdown](#where-latest-version-time-is-spent). Original baselines are preserved below.

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

The original 8-second untar is **2.03× slower**. The later profiling below attributes that penalty
to repeated scans/copies of retained RAM mutation history. Both population phases accepted 47,642
edits (including fixture setup),
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
reruns and block reuse were deferred until the memory-access work was validated.

## RAM access optimization — focused untar only

Source committed as `047a7e84cc`, including the indexed history from `debc3b1aa9`. Same 10k corpus,
deep path, configuration, and `DFS_PROFILE=1` as the profiled baselines. The 8s run preceded 1s.
Both untars finished with **zero publication failures**. No full suite was rerun for this milestone.

| Measurement | Before, D = 1s | After, D = 1s | Before, D = 8s | After, D = 8s |
| --- | ---: | ---: | ---: | ---: |
| Untar wall time (s) | 70.643 | 51.623 | 133.007 | 46.959 |
| Server CPU, user + system (s) | 37.800 | 21.380 | 110.070 | 22.000 |
| Client CPU, user + system (s) | 18.610 | 18.740 | 20.750 | 19.210 |
| Remaining publication drain (ms) | 18 | 29 | 10 | 22 |
| Client RPC calls | 229,669 | 229,669 | 229,669 | 229,669 |
| RAM key reads | 12,635,795 | 5,884,675 | 12,598,142 | 5,873,841 |
| Retained edits examined by key reads | 2,202,096,489 | 494,691 | 8,440,659,746 | 1,583,884 |
| RAM overlay lookup time (s) | 9.903 | 0.818 | 54.560 | 1.368 |
| RAM read-view construction time (s) | 2.258 | 0.024 | 17.280 | 0.025 |
| History reaping time (s) | 1.642 | 0.232 | 8.150 | 0.198 |
| Publication selection time (s) | 1.504 | 0.254 | 14.472 | 0.227 |

Server CPU fell **43% at 1s and 80% at 8s**. The longer-window penalty disappeared in these runs;
the actual CPU totals are now similar. Indexed lookup examines at most one retained version per
measured key read here, rather than scanning unrelated edits. There is still per-RPC, authorization,
serialization, and native FDB client work; the total server CPU is not a cache-only measurement.

Changes: key/file-clear indexes, constant-size pinned views, pending-participant indexes, incremental
retirement, borrowed point-cache lookups, one ancestor decode per read, and no speculative hint
construction for resident primary objects. All semantic reads still validate the view and grants.
Faster acceptance exposed the old three-attempt publication limit: definite FDB conflicts now retry
immediately with fresh validation within the original deadline, without added backoff. Changed
preconditions reject the tentative edit; uncertain commit outcomes are never replayed.

Correctness validation: real FDB contract tests (including concurrent sibling publication, pinned
views, truncation, remote moves/revocations, and ambiguous commits) and mounted checks at both bounds.
These focused runs do not substitute for the full benchmark's content/SHA validation. Full suites
and revision-validated block reuse were deferred at this milestone; their completed runs follow.

Reports remain in the development container, outside Git:

- 1s: `/tmp/dfs-v3-benchmark-y_b0ma44/run.json`.
- 8s: `/tmp/dfs-v3-benchmark-9q15qu35/run.json`.

Both use server binary SHA-256
`f6d64759bf19182f2eb4340f214616b7a07d058334bc6c51227546185a08413d`.
Intermediate runs with publication failures are excluded. Reproduce with the measured source and
the earlier command, adding `DFS_PROFILE=1` and `--untar-only`.

## Block retention comparison

Compare the RAM-optimized baseline (`047a7e84cc`) with revision-validated block reuse
(`a479054e1e`), both using `DFS_PROFILE=1`, identical FUSE binaries, and the same configuration
and corpus as above. All **96 checks across the four full suites passed**, including SHA-256
verification of every file. All four runs recorded zero publication failures.

| Implementation | D | Untar (s) | Remaining FDB drain (ms) | DFS CPU during population (s) |
| --- | --- | ---: | ---: | ---: |
| RAM optimized, no block reuse | 1s | 50.797 | 21 | 20.860 |
| RAM optimized, no block reuse | 8s | 48.014 | 20 | 23.140 |
| Revision-validated block reuse | 1s | 52.065 | 22 | 20.960 |
| Revision-validated block reuse | 8s | 46.802 | 24 | 21.330 |

Block reuse recorded **zero hits and zero misses during either untar**: newly written content
was served by the RAM journal. The small mixed changes in untar time are not evidence of a
retention benefit. The earlier RAM indexing optimization removed the pathological 8s slowdown;
retention targets repeated reads after the short-lived FDB base expires.

### dfs v3 [RAM optimized, no block reuse, D = 8s]

Untar: **48.014 s**; remaining FDB drain: **20 ms**. All 24 checks passed, including full SHA-256
verification; zero publication failures. Population server CPU: 23.140 s; client CPU: 20.220 s.

```text
+--------------+------------------------------------------------+-------+-----------+--------+
| Feature      | Workload                                       | Phase | Time (ms) | Result |
+--------------+------------------------------------------------+-------+-----------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 66,001.26 | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 66,371.70 | OK     |
| metadata     | rg --files (10,000 files)                      | first | 332.80    | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 118.97    | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 72,723.34 | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 74,468.55 | OK     |
| metadata     | stat missing (256 paths)                       | first | 1,630.80  | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 1,186.51  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 7,592.94  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 7,588.90  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 7,710.45  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 7,559.71  | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 6,680.69  | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 6,706.87  | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 1,695.71  | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 1,600.47  | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 85,315.73 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 85,656.08 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 2,308.37  | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 1,313.96  | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 224.19    | OK     |
| file sync    | fsync (32 files)                               | once  | 12.71     | OK     |
| write        | close (32 files)                               | once  | 0.67      | OK     |
| write        | unlink (32 files)                              | once  | 101.90    | OK     |
+--------------+------------------------------------------------+-------+-----------+--------+
```

Report: `/tmp/dfs-v3-benchmark-3q09nh8a/run.json` in the development container.

### dfs v3 [RAM optimized, no block reuse, D = 1s]

Untar: **50.797 s**; remaining FDB drain: **21 ms**. All 24 checks passed, including full SHA-256
verification; zero publication failures. Population server CPU: 20.860 s.

```text
+--------------+------------------------------------------------+-------+-----------+--------+
| Feature      | Workload                                       | Phase | Time (ms) | Result |
+--------------+------------------------------------------------+-------+-----------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 78,458.09 | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 77,146.23 | OK     |
| metadata     | rg --files (10,000 files)                      | first | 355.94    | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 161.01    | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 78,370.99 | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 76,673.63 | OK     |
| metadata     | stat missing (256 paths)                       | first | 1,688.24  | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 1,652.22  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 7,690.31  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 7,628.79  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 7,731.53  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 7,936.64  | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 6,775.27  | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 6,750.50  | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 1,721.74  | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 1,668.91  | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 88,792.83 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 88,873.88 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 2,155.13  | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 2,356.58  | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 173.60    | OK     |
| file sync    | fsync (32 files)                               | once  | 3.80      | OK     |
| write        | close (32 files)                               | once  | 0.59      | OK     |
| write        | unlink (32 files)                              | once  | 101.88    | OK     |
+--------------+------------------------------------------------+-------+-----------+--------+
```

Report: `/tmp/dfs-v3-benchmark-z356lspm/run.json` in the development container.

### Where baseline time is spent

CPU is process CPU for the FUSE client and DFS server, excluding Python/tar and the FDB server.
Elapsed columns are cumulative, include waits, and overlap; they MUST NOT be added as wall time.
Read rows combine first + warm plus their small untimed setup; untar includes fixture setup.

| Workload | D | FUSE CPU (s) | DFS CPU (s) | Client RPC elapsed (s) | Handler elapsed (s) | FDB get elapsed (s) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Untar | 1s | 18.370 | 20.860 | 46.237 | 27.501 | 69.508 |
| Untar | 8s | 20.220 | 23.140 | 42.649 | 21.749 | 71.333 |
| Scandir + stat | 1s | 66.200 | 40.650 | 136.732 | 68.479 | 58.842 |
| Scandir + stat | 8s | 67.020 | 39.660 | 113.108 | 43.656 | 32.548 |
| Open + fstat + close | 1s | 68.770 | 41.340 | 134.986 | 63.829 | 53.931 |
| Open + fstat + close | 8s | 69.450 | 41.800 | 127.092 | 55.148 | 43.672 |
| rg no-match | 1s | 31.910 | 35.410 | 117.331 | 39.728 | 23.744 |
| rg no-match | 8s | 32.290 | 35.600 | 116.140 | 36.480 | 18.157 |
| Open + read + SHA-256 | 1s | 74.960 | 47.020 | 154.840 | 77.560 | 66.425 |
| Open + read + SHA-256 | 8s | 74.750 | 46.540 | 148.344 | 70.900 | 58.539 |

The client/handler gap includes channel queueing, serialization, runtime scheduling, and loopback
transport; it is not a measurement of network latency alone. During untar, FDB reads also include
parallel publication validation, which explains why their cumulative duration exceeds wall time.
FDB commit durations total 17.9 s (1s) / 17.7 s (8s), mostly overlapping foreground work.

For directory traversal, server CPU is similar at both bounds, but the shorter cache window causes
99,496 FDB gets versus 65,292. This explains the direction of the remaining bound-dependent cost.
The paired SHA workload makes about 736k RPCs; its block-read phase totals only 10.5–10.9 s.
Block retention targets repeated byte fetches, while metadata refresh and the many uncached FUSE
round trips remain. The current timers cannot separate FDB server processing from native-client
scheduling and its network wait.

### dfs v3 [block reuse, D = 8s]

Source `a479054e1e`, same configuration and `DFS_PROFILE=1`. Untar: **46.802 s**;
remaining FDB drain: **24 ms**. Population server CPU: **21.330 s**, with 47,642 accepted
edits, 10,225 commits, and zero publication failures. Retained-block hits and misses were both
zero during population: this untar difference is not evidence of a block-reuse benefit.

All **24 checks passed**, including full SHA-256 verification, with zero publication failures
across all server lifetimes.

```text
+--------------+------------------------------------------------+-------+-----------+--------+
| Feature      | Workload                                       | Phase | Time (ms) | Result |
+--------------+------------------------------------------------+-------+-----------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 67,533.70 | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 66,884.55 | OK     |
| metadata     | rg --files (10,000 files)                      | first | 347.27    | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 103.81    | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 75,677.47 | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 75,766.66 | OK     |
| metadata     | stat missing (256 paths)                       | first | 1,607.24  | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 1,151.57  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 7,572.16  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 7,450.91  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 7,512.54  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 7,364.62  | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 6,919.30  | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 6,713.40  | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 1,733.44  | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 1,583.62  | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 84,574.70 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 82,294.06 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 2,252.28  | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 1,278.27  | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 144.37    | OK     |
| file sync    | fsync (32 files)                               | once  | 3.56      | OK     |
| write        | close (32 files)                               | once  | 0.55      | OK     |
| write        | unlink (32 files)                              | once  | 100.14    | OK     |
+--------------+------------------------------------------------+-------+-----------+--------+
```

For the paired no-match scans, cumulative block-read time fell from **4.541 s to 2.529 s**
and FDB gets from **100,400 to 93,317**. Retention recorded 30,001 hits, 10,000 misses, and
no evictions. Overall scan time fell only 1.0%; these single-run results still show metadata
and RPC costs dominating. Warm read-and-SHA time fell 3.9%, from 85.656 s to 82.294 s.
Across its two passes, block-read time fell from 10.876 s to 5.303 s, with 10,000 retention hits.

Report: `/tmp/dfs-v3-benchmark-a5y2h1ng/run.json` in the development container. Server binary
SHA-256: `d6b3f1975eba393615f2511763b17e9bd9800df4e32883318ffaebda01f691eb`.
The FUSE binary is unchanged from both RAM-optimized baselines:
`d9bdf18dd6dec399e6562595de37c91cda5a10af3c1a820466318c7f456b35c6`.

### dfs v3 [block reuse, D = 1s]

Source `a479054e1e`, same configuration, corpus, profiling, and binaries as the 8s run.
Untar: **52.065 s**; remaining FDB drain: **22 ms**. Population server CPU: **20.960 s**.
All **24 checks passed**, including full SHA-256 verification; zero publication failures.

```text
+--------------+------------------------------------------------+-------+-----------+--------+
| Feature      | Workload                                       | Phase | Time (ms) | Result |
+--------------+------------------------------------------------+-------+-----------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 76,772.59 | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 77,238.99 | OK     |
| metadata     | rg --files (10,000 files)                      | first | 347.37    | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 152.01    | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 77,179.21 | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 77,363.61 | OK     |
| metadata     | stat missing (256 paths)                       | first | 1,702.46  | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 1,665.75  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 7,697.88  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 7,664.85  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 7,732.92  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 7,505.73  | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 6,783.22  | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 6,754.28  | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 1,692.57  | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 1,671.79  | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 88,939.95 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 85,248.42 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 2,436.43  | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 2,272.96  | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 163.49    | OK     |
| file sync    | fsync (32 files)                               | once  | 3.82      | OK     |
| write        | close (32 files)                               | once  | 0.67      | OK     |
| write        | unlink (32 files)                              | once  | 151.82    | OK     |
+--------------+------------------------------------------------+-------+-----------+--------+
```

Report: `/tmp/dfs-v3-benchmark-2w077yoi/run.json` in the development container.

### Where latest-version time is spent

Revision `a479054e1e`, with block reuse. CPU columns measure the FUSE and DFS processes,
including the native FDB client inside DFS, but exclude Python/tar and the FDB server.
Read rows combine first + warm and their small untimed setup; untar includes fixture setup.
Elapsed columns are cumulative, nested, and sometimes concurrent: **do not add them as wall time**.

| Workload | D | FUSE CPU (s) | DFS CPU (s) | Client RPC elapsed (s) | Handler elapsed (s) | FDB get elapsed (s) | FDB commit elapsed (s) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Untar | 1s | 18.580 | 20.960 | 47.125 | 28.333 | 70.363 | 18.123 |
| Untar | 8s | 18.400 | 21.330 | 42.075 | 23.027 | 66.786 | 17.858 |
| Scandir + stat | 1s | 66.960 | 41.430 | 134.809 | 65.602 | 55.796 | 0.000 |
| Scandir + stat | 8s | 65.650 | 38.340 | 115.837 | 47.809 | 37.064 | 0.000 |
| Open + fstat + close | 1s | 67.540 | 41.070 | 136.191 | 66.854 | 57.117 | 0.000 |
| Open + fstat + close | 8s | 67.960 | 41.010 | 131.673 | 61.048 | 49.905 | 0.000 |
| rg no-match | 1s | 32.160 | 35.020 | 117.638 | 38.739 | 23.023 | 0.000 |
| rg no-match | 8s | 32.020 | 34.380 | 114.933 | 35.517 | 15.949 | 0.000 |
| Open + read + SHA-256 | 1s | 75.500 | 47.550 | 151.241 | 72.974 | 61.186 | 0.000 |
| Open + read + SHA-256 | 8s | 75.220 | 47.060 | 144.099 | 66.568 | 52.864 | 0.000 |

The client/handler gap includes queueing, protobuf, runtime scheduling, and loopback transport;
it is not pure network time. During untar, FDB reads and commits largely serve concurrent
background publication, so their totals can exceed foreground handler time. Neither these
timers nor process CPU separate FDB server execution from native-client/network waiting.

### Retention decision

**Keep block reuse.** It cuts repeated block-fetch work at both freshness bounds while preserving
current-view authorization and revision checks. Warm read-and-SHA improves about 4% in both
runs; this is a modest content-read improvement, not a general filesystem speedup.

| Workload | D | Warm before (s) | Warm after (s) | Change |
| --- | --- | ---: | ---: | ---: |
| rg no-match | 1s | 7.629 | 7.665 | +0.5% |
| rg no-match | 8s | 7.589 | 7.451 | -1.8% |
| Read + SHA-256 | 1s | 88.874 | 85.248 | -4.1% |
| Read + SHA-256 | 8s | 85.656 | 82.294 | -3.9% |

Block timings and FDB counts below cover the paired first + warm lifetimes, including setup.
FDB counts include metadata/authorization reads as well as blocks.

| Workload | D | Block-read time before (s) | After (s) | FDB gets before | After |
| --- | --- | ---: | ---: | ---: | ---: |
| rg no-match | 1s | 4.618 | 2.469 | 125,357 | 115,431 |
| rg no-match | 8s | 4.541 | 2.529 | 100,400 | 93,317 |
| Read + SHA-256 | 1s | 10.459 | 5.591 | 96,017 | 85,659 |
| Read + SHA-256 | 8s | 10.876 | 5.303 | 82,468 | 72,514 |

The retained cache recorded roughly 30k hits / 10k misses for each no-match pair and
10k hits / 10k misses for each SHA pair, with no evictions in these workloads. Metadata
and authorization still refresh on the original schedule: directory traversal performs
98,347 FDB gets at 1s versus 64,987 at 8s. The paired SHA passes still issue about 736k RPCs,
and process CPU stays around 75 s in FUSE / 47 s in DFS. Retaining blocks does not remove
that metadata, authorization, serialization, or scheduling work.

These are single runs, with mixed changes outside the target read path. For example, 1s
first tail reads increased from 2.155 s to 2.436 s and unlink from 0.102 s to 0.152 s.
Repeated runs would be needed to establish the variability of these differences. Untar recorded
no block-retention activity and showed no consistent improvement. The large 8s untar
regression was fixed by RAM history indexing, before this comparison.

Validation before timing: formatting, Clippy, the full Rust workspace tests against real FDB,
and mounted checks at both bounds passed. Retention tests cover unchanged revisions, peer
writes, holes, truncate/re-extend, inherited-grant revocation, partial-write publication
conflicts, and eviction/reload. No code changes occurred between the measured builds and
these results; no builds or tests overlapped timed workloads.

To reproduce the retained-block runs, build source `a479054e1e`, then run from the dfs directory:

```sh
v3/local/run exec cargo build --workspace --release
v3/local/run exec env DFS_PROFILE=1 MAX_EVENTUAL_CONSISTENCY_DELAY_MS=8000 DFS_BENCH_REVISION=a479054e1e python3 /dfs/v3/bench/run.py
v3/local/run exec env DFS_PROFILE=1 MAX_EVENTUAL_CONSISTENCY_DELAY_MS=1000 DFS_BENCH_REVISION=a479054e1e python3 /dfs/v3/bench/run.py
```

# Benchmark results — dfs v4 localhost

Full-suite baseline: 2026-10-06, source `c1784434e9`. **All 24 checks passed**, including every-file SHA-256
in both first and warm passes. Untar and all subsequent phases recorded zero writeback failures.
The later [directory absence cache](#directory-absence-cache) run measures untar only; the full
baseline table remains below.

## Configuration and method

- Native Linux ARM64 in Docker Desktop on an Apple M4 Max; 16 vCPUs, 7.65 GiB VM RAM.
  Rust 1.98.1 release builds, one local FDB 7.3.69 node, native tuning, `single ssd`, persistent
  Docker volume and 3 GiB FDB container limit. One DFS server. No ES or GCP.
- Same jd corpus/workloads: **10,000 files, 100 directories, 177,499,149 bytes**, seed 42.
  Uncompressed untar runs 13 directories below the tenant root through `/shared` and an inherited grant.
- Client: **D=2s, W=1s, C=1s**, 25ms coalescing, 1 GiB accounted cache, 256 MiB dirty cap,
  eight FUSE workers. Bounded full-attribute directory prefetch; file content is demand-loaded.
  Revision-validated blocks survive metadata expiry. Direct I/O, zero kernel name/attribute TTLs,
  no kernel data cache or writeback. The cache budget is not a hard process RSS limit.
- Server: direct FDB commits, bounded advisory ancestry/grant hints, no authoritative read cache
  or writeback. Fair per-primary-object scheduling reduces same-process conflicts; independent
  servers still coordinate through FDB. **Fsync waits for durable target commits.**
- Every `first` read starts a new server/session/mount; FDB/OS caches remain. `warm` is one repeat
  on that mount and may outlast the one-second metadata TTL. Profiling enabled (`DFS_PROFILE=1`),
  no concurrent builds/tests. Single-run measurements, not statistical estimates.

The existing `page cache` and `search` labels name benchmark categories; search here is filesystem
`rg`, not a search service. Kernel caching remains disabled.

## Full table

Untar: **39.053s**, followed by **1.801s** inside the explicit client drain.
Unmount from signal to process exit, including that drain, took **1.955s**.
Background publication overlaps untar; these are only the remaining waits after tar returns.
Drain waits for FDB-confirmed group responses, before stopping the server. There is no separate
server persistence stage. Drain can exceed W because server/network time is excluded from D.

```text
+--------------+------------------------------------------------+-------+-----------+--------+
| Feature      | Workload                                       | Phase | Time (ms) | Result |
+--------------+------------------------------------------------+-------+-----------+--------+
| population   | untar (10,000 files, 177.5 MB)                 | once  | 39,052.67 | OK     |
| writeback    | remaining client drain after untar             | once  |  1,801.00 | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 10,573.94 | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 10,718.60 | OK     |
| metadata     | rg --files (10,000 files)                      | first |    339.31 | OK     |
| metadata     | rg --files (10,000 files)                      | warm  |     28.25 | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 23,787.66 | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 23,910.63 | OK     |
| metadata     | stat missing (256 paths)                       | first |  1,304.76 | OK     |
| metadata     | stat missing (256 paths)                       | warm  |  1,291.66 | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first |  4,351.71 | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  |  1,863.35 | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first |  4,105.71 | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  |  2,083.82 | OK     |
| path pruning | rg branch glob (981 candidate files)           | first |  1,654.66 | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  |  1,822.66 | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first |    455.83 | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  |    418.78 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 70,666.15 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 25,539.53 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first |  2,460.98 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  |  1,790.71 | OK     |
| write        | create + write (32 x 32 KiB files)             | once  |     66.99 | OK     |
| file sync    | fsync (32 files)                               | once  |     93.85 | OK     |
| write        | close (32 files)                               | once  |      1.00 | OK     |
| write        | unlink (32 files)                              | once  |     25.93 | OK     |
+--------------+------------------------------------------------+-------+-----------+--------+
```

## Directory absence cache

2026-10-06, source `427d20bce0`. Same local fixture, corpus, deep path, cache settings and profiling;
the server binary is unchanged. One focused untar run, not a rerun of the full read suite.
After drain, a fresh server and mount verified the manifest and all 10,000 persisted file sizes and
SHA-256 hashes outside the timed run. Unit, real FDB integration, and mounted filesystem tests passed.

| Measurement | Baseline `c1784434e9` | Absence cache `427d20bce0` |
| --- | ---: | ---: |
| Untar (s) | 39.053 | 24.625 |
| Remaining client drain (s) | 1.801 | 3.540 |
| Untar + remaining drain (s) | 40.854 | 28.165 |
| Lookup RPCs | 10,233 | 347 |
| Cumulative Lookup RPC elapsed (s) | 14.180 | 0.676 |
| Mutation batch RPCs | 5,239 | 1,195 |
| Mutation groups | 10,192 | 10,140 |
| FUSE CPU (s) | 6.120 | 5.100 |
| DFS CPU, including drain (s) | 14.170 | 11.430 |

Untar is **37% faster**; including the remaining drain, **31% faster**. Lookup RPC count falls **97%**.
The client answered 19,578 missing-name checks from directory coverage, including repeated checks
for the same name. Fresh directory ranges and newly created directories now avoid those RPCs while
keeping the original one-second expiry. Local edits exclude touched names without discarding the
rest of the range. Each mutation group still commits independently in FDB.

Both runs issued **zero fsync/fsyncdir calls** during untar. Their 10,001 FUSE flush callbacks are
close notifications, not publication barriers. The new run had zero writeback failures; the 313
Lookup errors were expected `NotFound` responses. Unmount including drain took 3.695s. Elapsed RPC
and CPU measurements overlap; they do not sum to wall time. Admission-wait durations remain unmeasured.

Reproduce the focused run:

```sh
v4/local/run exec env DFS_PROFILE=1 DFS_BENCH_REVISION=427d20bce0 python3 /dfs/v4/bench/run.py --untar-only
```

Report: `/tmp/dfs-v4-427d20bce0-absence/run.json` inside `dfs-v4-dev-1`.
FUSE binary SHA-256: `aa5ca5e4b6feb2ba0524bc4d8c710d6d2233f75f7e0f061b200c7a9c8a1dd5d1`.
The manifest and server binary hashes match the baseline below.

### Where the remaining untar time is spent

Diagnostic repeat on 2026-10-06, source `5379856c36`: **26.146s untar + 1.453s remaining drain**.
This adds callback/wait timers and tar CPU accounting without changing cache or publication behavior.
It is a separate single run, not a replacement for the measurements above. No fsync/fsyncdir calls
or writeback failures occurred; the Rust/FDB tests passed before the run.

| Client phase | Calls | Cumulative elapsed (s) |
| --- | ---: | ---: |
| Flush before refreshing expired dirty metadata | 3 | **19.589** |
| Dirty-memory admission | 47,628 | 0.593 |
| Total-memory reservation | 47,628 | 0.003 |
| Pending-group admission | 47,628 | 0.002 |
| Object gate acquisition | 47,941 | 0.008 |
| Read/metadata RPCs, including prefetch/session | 317 | 0.540 |

`stat_locked` flushes pending edits when the object's cached metadata expires, before issuing Stat.
Write and setattr call it too: ordinary foreground operations can therefore wait for durable
publication without an application fsync. These three implicit barriers dominate the run;
memory backpressure is small and group/object-lock admission is negligible.

All 247,994 FUSE callbacks totaled 23.047s, including **13.052s in write** and **7.868s in setattr**.
Those callback totals already include the waits above. FUSE process CPU was 4.990s; tar used 0.080s
user CPU + 1.158s system CPU, with 229,685 voluntary context switches. Timers are nested/concurrent,
so these figures are not an additive wall-time decomposition. The 1,446 asynchronous mutation RPCs
carried 10,142 groups; buffering does not prevent a later foreground refresh from awaiting them.

Next target: refresh authorization and committed state while preserving a coherent pending overlay,
instead of requiring publication merely to refresh metadata. Keep the same freshness bound.

Report: `/tmp/dfs-v4-5379856c36-waits/run.json` inside `dfs-v4-dev-1`.
FUSE binary SHA-256: `96afa63a1f8ef8f6a534d37be177d235342bb7390c498ad3381946b250ef9d45`.

## Comparison with v3

[Latest v3 localhost results](../../v3/bench/RESULTS.md#latest-full-suites), same corpus and deep path.
This compares whole designs: v3 cached on the server, used D=1s, and acknowledged fsync in server RAM;
v4 caches on the client, uses D=2s, and fsync waits for FDB. It is not a cache-only ablation.

| Workload | v3 D=1s (s) | v4 D=2s (s) | v3 / v4 |
| --- | ---: | ---: | ---: |
| Untar, excluding drain | 50.662 | 39.053 | 1.30× |
| scandir + stat, first | 65.832 | 10.574 | 6.23× |
| open + fstat + close, first | 77.030 | 23.788 | 3.24× |
| rg no-match scan, first | 7.722 | 4.352 | 1.77× |
| open + read + SHA-256, first | 91.711 | 70.666 | 1.30× |

V3's remaining untar drain was 22ms, versus 1801ms here. The timed fsync rows also have
different durability guarantees. First `rg --files` and random-tail reads do not necessarily improve;
the gains depend on the metadata/content reuse and the number of RPCs avoided.

## Where time is spent

Read rows combine first + warm and small untimed setup; untar includes fixture setup. FUSE CPU is
sampled before unmount; DFS CPU and profiles include client drain. CPU excludes the FDB server and
benchmark process. Elapsed columns are cumulative, nested and often concurrent: **do not add them
as wall time**. Mutation-group elapsed includes server scheduling and commit waits; batch header
latency is deliberately excluded from unary RPC time. Handler time includes group scheduling too.

| Workload | FUSE CPU (s) | DFS CPU (s) | Unary RPC elapsed (s) | Mutation groups elapsed (s) | Handler elapsed (s) | FDB get elapsed (s) | FDB commit elapsed (s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Untar | 6.120 | 14.170 | 14.745 | 1517.028 | 1120.575 | 119.835 | 20.353 |
| Scandir + stat | 6.080 | 1.480 | 6.551 | 0.000 | 6.308 | 16.159 | 0.000 |
| Open + fstat + close | 8.520 | 5.780 | 29.511 | 0.000 | 28.184 | 54.334 | 0.000 |
| rg no-match | 10.450 | 6.250 | 33.349 | 0.000 | 30.627 | 161.337 | 0.000 |
| Open + read + SHA-256 | 13.730 | 16.030 | 72.689 | 0.000 | 68.973 | 146.871 | 0.000 |

Untar issued 10,192 mutation groups and 10,233 Lookup RPCs. FDB recorded
12,122 commit attempts including retries/setup. Client caching removes most
path-stat RPCs, but missing-name checks, durable transactions, grant resolution and FUSE callbacks
remain. The long warm SHA-256 pass can reuse file blocks after refreshing metadata/authorization.

## Reproduction

```sh
v4/local/run up
v4/local/run exec cargo build --workspace --release
v4/local/run exec env DFS_PROFILE=1 DFS_BENCH_REVISION=c1784434e9 python3 /dfs/v4/bench/run.py
```

Validated report: `/tmp/dfs-v4-c1784434e9/run.json` inside `dfs-v4-dev-1`.
Raw JSON, logs, credentials and earlier failed/pilot runs remain outside Git. Only this final
committed version is tabulated. The 100k, multi-server throughput and GCP evaluations remain future work.

- Corpus manifest SHA-256: `67fdf87da1a1b94bc1f6482f00b912c1010d512a907846e5747ba9c893d8a3c1`.
- Server binary SHA-256: `4d614f831be3d13124f6d4f50a10bdf7367051508034bd7f4e25169232070116`.
- FUSE binary SHA-256: `2ed5172ab4f6f4494e39771400ff5c210a1b6e9652a21116086b51c0278d3ee2`.

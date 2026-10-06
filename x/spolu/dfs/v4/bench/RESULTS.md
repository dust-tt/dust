# Benchmark results — dfs v4 localhost

Latest full-suite measurements: **2026-10-06**, source `133f09dac5`. All **24 timed checks and final
cleanup passed**. The [new full table and EIO diagnosis](#latest-full-table--directory-cleanup-fix)
record the directory-publication race fix. Client budget remains 512 MiB; previous tables and failures
are preserved below. Replicated-backend measurements are in [GCP results](../gcp/RESULTS.md).

## Configuration and method

- Original fixture: native Linux ARM64 in Docker Desktop on an Apple M4 Max; 16 vCPUs, 7.65 GiB VM RAM.
  Rust 1.98.1 release builds, one local FDB 7.3.69 node, native tuning, `single ssd`, persistent
  Docker volume and 3 GiB FDB container limit. One DFS server. No ES or GCP.
- Same jd corpus/workloads: **10,000 files, 100 directories, 177,499,149 bytes**, seed 42.
  Uncompressed untar runs 13 directories below the tenant root through `/shared` and an inherited grant.
- Baseline client: **D=2s, W=1s, C=1s**, 25ms coalescing, 1 GiB accounted cache, 256 MiB dirty cap,
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

**Later local configuration change:** a large Git clone OOM-killed FDB under its 3 GiB container
limit. Docker was increased to 16 GiB and FDB to 8 GiB, retaining the native 2 GiB page cache.
A separate 2 GiB streamed write then completed in 40.207s plus 0.233s fsync; a fresh server/mount
read and verified its SHA-256 in 11.612s. Peak FDB cgroup memory was 3.44 GiB, with zero OOM events
or restarts. This was a large-file recovery check, not a Git clone or suite rerun. Benchmark
tables before the directory-cache work retain their original **3 GiB FDB / 7.65 GiB Docker**
configuration and timings; the directory-cache and cleanup-fix tables use the enlarged fixture.
Diagnostic report: `/tmp/dfs-v4-large-write-omfo6v36/result.json` inside `dfs-v4-dev-1`.

## Latest full table — directory cleanup fix

2026-10-06, source `133f09dac5`. Same 10k corpus and directory-cache configuration as the preceding
run: 512 MiB client budget, 1s read TTL, 25ms coalescing, 16 GiB Docker / 8 GiB FDB limit.
Each first read uses a new server/session/mount with FDB/OS caches retained. Full suite, one warm
repeat, profiling enabled, no concurrent builds/tests, fresh isolated prefix; existing data retained.

**Clean suite pass: all 24 timed checks, both full-content hash passes, and final recursive scratch
cleanup succeeded.** Harness exit **0**. Untar: **6.523s + 0.450s drain =
6.973s**. Unmount including drain: 0.477s.

```text
+--------------+------------------------------------------------+-------+-----------+--------+
| Feature      | Workload                                       | Phase | Time (ms) | Result |
+--------------+------------------------------------------------+-------+-----------+--------+
| population   | untar (10,000 files, 177.5 MB)                 | once  |  6,522.83 | OK     |
| writeback    | remaining client drain after untar             | once  |    450.00 | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 11,662.99 | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 19,134.11 | OK     |
| metadata     | rg --files (10,000 files)                      | first |    368.43 | OK     |
| metadata     | rg --files (10,000 files)                      | warm  |     42.80 | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 10,659.91 | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 12,998.09 | OK     |
| metadata     | stat missing (256 paths)                       | first |  1,316.02 | OK     |
| metadata     | stat missing (256 paths)                       | warm  |    810.64 | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first |  4,217.59 | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  |  2,294.41 | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first |  4,465.94 | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  |  1,617.82 | OK     |
| path pruning | rg branch glob (981 candidate files)           | first |  1,951.71 | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  |  2,415.43 | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first |    431.22 | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  |    405.97 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 64,338.39 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 14,982.72 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first |  2,144.31 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  |  4,010.82 | OK     |
| write        | create + write (32 x 32 KiB files)             | once  |     25.74 | OK     |
| file sync    | fsync (32 files)                               | once  |    142.64 | OK     |
| write        | close (32 files)                               | once  |      0.58 | OK     |
| write        | unlink (32 files)                              | once  |     22.53 | OK     |
+--------------+------------------------------------------------+-------+-----------+--------+
```

### Scratch cleanup EIO diagnosis

Successful unlink completions changed the client directory generation while a List RPC was in flight.
After four discarded snapshots, the client returned `Unavailable`, which FUSE translated to `EIO`.
Python's recursive cleanup failed in `scandir`, before reaching `rmdir`. The isolated deep-directory
reproduction recorded **eight races, two exhausted retry loops, zero failed List RPCs**.

The retry now pauses dispatch only for the affected directory, waits for its captured in-flight
groups, then lists and applies queued namespace edits. Queued edits are not forced to persist;
unrelated objects keep publishing. Snapshot validation and overlay projection share one lock,
preventing a completion from retiring a deletion marker between those steps. The pause releases
on success, error or cancellation; server transaction semantics and freshness limits are unchanged.

The full rerun encountered **one listing race**, waited **1.730ms** for an in-flight completion,
and completed `rmdir` with **zero retry exhaustion or writeback errors**. Regression coverage includes
a deterministic real-FDB publication race, unrelated-object progress, queued unlink visibility,
five deep mounted cleanup cycles, and ten repetitions of jd's isolated write/cleanup workload.
Workspace tests, clippy and mounted release checks passed before timing. FDB stayed available with
no restart or OOM kill. This validates the fix locally; earlier GCP measurements predate it.

Report: `/tmp/dfs-v4-133f09dac5-full/run.json` inside `dfs-v4-dev-1`.
Server SHA-256: `016b7ac67daa7f6c8e4cee045ff798d090052f23c7df905c4f79199e17b4920a`.
FUSE SHA-256: `545039110bbb3bbcc4ec87d07765dddba258f92125e98f9778ad5ac6e6631766`.
Manifest SHA-256 is unchanged. Raw reports/logs remain outside Git; earlier failed runs remain below.

## Previous full table — directory cache and page-ahead prefetch

2026-10-06, source `7d10f75eae` (runtime implementation `3e481abc97`). Full 10k suite with directory
revision validation, independent child-attribute refresh and demand-driven one-page-ahead prefetch.
Same corpus, deep `/shared` path, 512 MiB client budget, 25ms coalescing, one-second read TTL,
128 in-flight groups, 16 RPC envelopes and eight FUSE workers as the preceding directory-split run.
The server still commits directly to local FDB, with no authoritative read cache or writeback.

This run uses the **enlarged local fixture: 16 GiB Docker / 8 GiB FDB limit**, native 2 GiB FDB page
cache, 16 vCPUs and ARM64 release binaries. Earlier tables used 7.65 GiB Docker / 3 GiB FDB, so this
is not a controlled code-only comparison. Each first read starts a new server/session/mount;
FDB/OS caches and previous data remain. New isolated FDB prefix, no concurrent builds or tests;
the idle interactive demo mount stayed available. Warm is one repeat, not a guarantee of fresh TTLs.

Untar: **6.626s**, remaining client drain: **0.437s**, total: **7.063s**.
Unmount including drain took 0.579s. No fsync/fsyncdir calls occurred during untar.
All **24 timed checks passed**, including all 10,000 sizes and hashes in both full-content passes.
Final recursive scratch-directory cleanup again failed with `EIO`; harness exit **1**, not a clean
suite pass. Each row below reports its individual validation result.

```text
+--------------+------------------------------------------------+-------+-----------+--------+
| Feature      | Workload                                       | Phase | Time (ms) | Result |
+--------------+------------------------------------------------+-------+-----------+--------+
| population   | untar (10,000 files, 177.5 MB)                 | once  |  6,626.42 | OK     |
| writeback    | remaining client drain after untar             | once  |    437.00 | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 11,510.45 | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 18,213.57 | OK     |
| metadata     | rg --files (10,000 files)                      | first |    338.57 | OK     |
| metadata     | rg --files (10,000 files)                      | warm  |     35.81 | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 10,898.51 | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 13,278.87 | OK     |
| metadata     | stat missing (256 paths)                       | first |  1,406.83 | OK     |
| metadata     | stat missing (256 paths)                       | warm  |    915.03 | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first |  4,057.97 | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  |  2,136.87 | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first |  3,999.42 | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  |  1,842.63 | OK     |
| path pruning | rg branch glob (981 candidate files)           | first |  1,724.35 | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  |  2,231.44 | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first |    365.28 | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  |    369.43 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 62,619.93 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 14,515.69 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first |  2,085.89 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  |  3,238.47 | OK     |
| write        | create + write (32 x 32 KiB files)             | once  |     24.80 | OK     |
| file sync    | fsync (32 files)                               | once  |    146.57 | OK     |
| write        | close (32 files)                               | once  |      0.81 | OK     |
| write        | unlink (32 files)                              | once  |     27.49 | OK     |
+--------------+------------------------------------------------+-------+-----------+--------+
```

Compared with the previous local full table, cold open/fstat/close falls from **23.184s to 10.899s**,
and warm full-content reads from **25.322s to 14.516s**. Cold full-content reads remain near the
previous result (**64.601s → 62.620s**). The gains are not uniform: warm scandir/stat rises from
**11.258s to 18.214s**, and warm random tail reads from **1.833s to 3.238s**. These are single samples,
with the fixture-memory difference above; further attribution needs a separate measurement.

FDB was healthy before and after, with unchanged configuration, no container restarts or OOM kill.
Workspace/FDB tests and release-mounted checks passed before timing. Existing corpora and the demo
mount are retained. Raw reports and logs remain outside Git.

```sh
v4/local/run exec env DFS_PROFILE=1 DFS_BENCH_REVISION=7d10f75eae python3 /dfs/v4/bench/run.py --files 10000
```

Report: `/tmp/dfs-v4-7d10f75eae-full/run.json` inside `dfs-v4-dev-1`.
Server SHA-256: `51f0ea219d8d37a2548a4d9674505c7280f92cedcffd0eed0d4e2046c22e74ea`.
FUSE SHA-256: `a2577ab0306bf5441a5357503c4259eafa787f86ae84fb9bb5f84e07c702ec47`.
Manifest SHA-256: `67fdf87da1a1b94bc1f6482f00b912c1010d512a907846e5747ba9c893d8a3c1`.

## Previous full table — directory-record split

Source `26dbc5e862` (implementation `9e8c6ea3c7`). Same 10k corpus and local setup described above;
512 MiB shared clean/dirty/bookkeeping budget, including a 96 MiB transient reserve, with no separate
dirty cap. 128 in-flight groups, 16 RPC envelopes, 25ms coalescing, eight FUSE workers and 64 active
server transactions maximum. Creates schedule by their new object ID. Each first read starts a new
server/session/mount; the run used a new FDB prefix and retained existing FDB data and OS caches.

Untar: **6.629s**, remaining client drain: **0.531s**, total: **7.160s**.
Unmount including drain took 0.681s. All 24 timed workload checks passed, and all 10,000 file sizes
and SHA-256 hashes matched in both first and warm full-read passes. Final recursive cleanup of the
scratch directory failed with `EIO` after the timed unlink row; the harness exited unsuccessfully.
The rows below retain their individual validation results, not an overall success claim.

```text
+--------------+------------------------------------------------+-------+-----------+--------+
| Feature      | Workload                                       | Phase | Time (ms) | Result |
+--------------+------------------------------------------------+-------+-----------+--------+
| population   | untar (10,000 files, 177.5 MB)                 | once  |  6,628.56 | OK     |
| writeback    | remaining client drain after untar             | once  |    531.00 | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 10,874.94 | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 11,258.43 | OK     |
| metadata     | rg --files (10,000 files)                      | first |    373.37 | OK     |
| metadata     | rg --files (10,000 files)                      | warm  |     29.45 | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 23,183.74 | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 22,961.64 | OK     |
| metadata     | stat missing (256 paths)                       | first |  1,267.85 | OK     |
| metadata     | stat missing (256 paths)                       | warm  |  1,272.81 | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first |  4,575.14 | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  |  2,146.77 | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first |  4,387.89 | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  |  2,037.68 | OK     |
| path pruning | rg branch glob (981 candidate files)           | first |  1,655.91 | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  |  1,710.65 | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first |    410.60 | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  |    380.28 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 64,601.13 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 25,322.49 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first |  2,406.25 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  |  1,832.79 | OK     |
| write        | create + write (32 x 32 KiB files)             | once  |     25.43 | OK     |
| file sync    | fsync (32 files)                               | once  |    141.08 | OK     |
| write        | close (32 files)                               | once  |      0.85 | OK     |
| write        | unlink (32 files)                              | once  |     24.02 | OK     |
+--------------+------------------------------------------------+-------+-----------+--------+
```

```sh
v4/local/run exec env DFS_PROFILE=1 DFS_CLIENT_CACHE_MIB=512 DFS_BENCH_REVISION=26dbc5e862 python3 /dfs/v4/bench/run.py --files 10000
```

Report: `/tmp/dfs-v4-26dbc5e862-full/run.json` inside `dfs-v4-dev-1`. Server, FUSE and manifest
hashes match the [directory-split measurement](#directory-record-split). Raw reports remain outside Git.

## Original full table

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
v4/local/run exec env DFS_PROFILE=1 DFS_CLIENT_CACHE_MIB=1024 DFS_BENCH_REVISION=427d20bce0 python3 /dfs/v4/bench/run.py --untar-only
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

This identified the implicit publication barrier addressed in the next measurement.

Report: `/tmp/dfs-v4-5379856c36-waits/run.json` inside `dfs-v4-dev-1`.
FUSE binary SHA-256: `96afa63a1f8ef8f6a534d37be177d235342bb7390c498ad3381946b250ef9d45`.

## Overlay-aware refresh

2026-10-06, source `85fc70805f`, same 10k corpus/configuration and **25ms coalescing**. New objects now
have their own 1s TTL from acceptance; parent expiry does not shorten it. Expired dirty views refresh
their base without forcing queued publication. Commit replies renew returned objects, including
parents, and confirmed name bindings. No server/API or cache-size change.

| Measurement (s) | Absence cache `427d20bce0` | Instrumented repeat `5379856c36` | Overlay refresh `85fc70805f` |
| --- | ---: | ---: | ---: |
| Untar | 24.625 | 26.146 | **21.278** |
| Remaining client drain | 3.540 | 1.453 | **8.598** |
| Untar + remaining drain | 28.165 | 27.599 | **29.876** |

Tar returns 14% sooner than the absence-cache run, but more work remains afterward: completion through
drain is 6% slower in these single samples. This removes a foreground barrier, not FDB's independent
durable transactions. Unmount including drain took 8.738s. Zero application fsync/fsyncdir calls and
zero writeback failures. All 10,000 persisted file sizes/hashes and the manifest were verified after
starting a new server/session/mount; Rust/FDB and mounted filesystem tests also passed.

### Where the overlay-refresh untar time is spent

| Client phase | Calls | Cumulative elapsed (s) |
| --- | ---: | ---: |
| Forced publication for metadata expiry | 0 | **0.000** |
| Wait for ambiguous in-flight refresh results | 0 | 0.000 |
| Refresh published bases, preserving edits | 17 | 0.026 |
| Refresh tentative objects through an existing ancestor | 72 | 0.123 |
| Dirty-memory admission | 47,628 | **15.085** |
| Total-memory reservation | 47,628 | 0.005 |
| Pending-group admission | 47,628 | 0.003 |
| Object gate acquisition | 47,803 | 0.008 |
| Read/metadata RPCs, including prefetch/session | 176 | 0.321 |

The foreground bottleneck is now the **256 MiB accounted dirty budget**: admission waits for durable
responses to release reservations. It includes payload copies and metadata, not just file bytes.
The old 19.589s refresh-flush wait disappears; reducing the 25ms coalescing window is not the primary
remaining opportunity. Pending-group admission is negligible, so its 4,096-group cap is not binding.

There were **798 RPCs**: 622 mutation batches carrying 10,116 independent groups, 110 Stat, 37 Lookup,
28 List and one session RPC. The 239,670 FUSE callbacks totaled 17.712s, including 11.649s in write
and 2.193s in setattr. FUSE CPU was 4.570s; DFS CPU including drain was 9.930s. Tar used 0.087s user
and 1.260s system CPU. Timers are nested/concurrent and are not additive wall-time components.

Report: `/tmp/dfs-v4-85fc70805f-refresh/run.json` inside `dfs-v4-dev-1`; raw reports remain outside Git.
FUSE binary SHA-256: `35f4e7b28db047edbbb0d5dbfa71e76abfe9bdb0205caf0de0946db822c8326f`.
This is an untar-only comparison, not a rerun of the full filesystem table.

## One shared memory budget

2026-10-06, source `1110a3419b`. Removed the separate dirty cap: **one 1 GiB accounted budget** now
covers clean cache, pending writes and bookkeeping, including the existing 96 MiB transient reserve.
Writes evict clean entries before waiting for capacity. Payload-copy accounting, 25ms coalescing,
TTL, transaction scheduling and server binary remain unchanged. Same deep 10k-file/177.5 MB corpus.

| Measurement (s) | 256 MiB dirty cap `85fc70805f` | Shared budget `1110a3419b` |
| --- | ---: | ---: |
| Untar | 21.278 | **16.026** |
| Remaining client drain | 8.598 | **13.955** |
| Untar + remaining drain | 29.876 | **29.981** |
| Dirty-budget admission wait | 15.085 | Removed |
| Shared-memory admission | 0.005 | **0.004** |
| Pending-group admission | 0.003 | **10.121** |

Tar returns **25% sooner**; total completion is essentially unchanged in these single runs. More work
is buffered, with the remaining foreground wait at the **4,096-group queue limit**. Every edit currently
reserves a group slot before deciding whether it can coalesce, so this counter includes both new and
merged edits. The scheduling/throughput work is proposed in [PLAN.md](../PLAN.md#4-transaction-throughput),
not implemented in this measurement. Unmount including drain took 13.991s.

There were 750 RPCs: 613 mutation batches carrying 10,114 independent groups, 81 Stat, 32 Lookup,
23 List and one session RPC. FUSE CPU was 4.250s; DFS CPU including drain was 10.170s. Tar used 0.066s
user and 1.194s system CPU. Zero fsync/fsyncdir calls, foreground errors or writeback failures.
Timers include overlapping work and are not additive wall-time components.

Rust/FDB tests, shared-memory eviction/backpressure tests and mounted filesystem checks passed.
All 10,000 persisted file sizes/hashes and the manifest were checked after a new server/session/mount.
Only untar was rebenchmarked; the historical full filesystem table above remains unchanged.

With this source checked out:

```sh
v4/local/run exec cargo build --workspace --release
v4/local/run exec env DFS_PROFILE=1 DFS_CLIENT_CACHE_MIB=1024 DFS_BENCH_REVISION=1110a3419b python3 /dfs/v4/bench/run.py --untar-only
```

Report: `/tmp/dfs-v4-1110a3419b-shared-memory/run.json` inside `dfs-v4-dev-1`.
FUSE binary SHA-256: `d9bef5b9629a6c0b411da428024b03f307fe59b0ad5a3820fe75f680aa65dbb6`.
The manifest and server hashes match the preceding overlay-refresh run. Raw reports remain outside Git.

## Transaction throughput investigation

Instrumented control `b9f56a195e`: **16.803s untar + 15.427s drain = 32.230s**. Same corpus/settings;
new aggregate timers measure scheduling without changing transaction semantics. Client envelope
capacity was blocked for 25.903s across untar/drain. FDB reached only **4 concurrent transaction
attempts**, while **64 operations waited on primary-object locks**. Cumulative server parent wait
was 1553.484s, batch-window wait 647.027s, actual transaction attempts 55.669s, and retry backoff
2.034s (331 retries). These overlap and must not be added as wall time.

A separate direct-gRPC diagnostic creates **2,048 files of 16 KiB**, each in an independent
create+write transaction, with four concurrent 32-group envelopes. Fixture creation and full content
verification are outside timing. It runs 13 levels deep with inherited grants, without FUSE or a
client writeback cache. Files are distributed round-robin across the specified parents.

| Parent directories | Durable completion (s) | Groups/s | Peak FDB attempts | Retries |
| --- | ---: | ---: | ---: | ---: |
| 1 | 10.806 | 190 | 1 | 0 |
| 64 | 0.390 | 5,253 | 64 | 0 |

This demonstrates available independent-object parallelism; it is **not an untar timing**. All
2,048 files in each case passed content verification. Reports inside `dfs-v4-dev-1`:
`/tmp/dfs-v4-b9f56a195e-scheduling/run.json` and `/tmp/dfs-v4-b9f56a195e-groups/run.json`.

Reproduce with the matching source and binaries:

```sh
v4/local/run exec cargo build --workspace --release
v4/local/run exec cargo build --workspace --examples --release
v4/local/run exec env DFS_PROFILE=1 DFS_BENCH_REVISION=b9f56a195e python3 /dfs/v4/bench/groups.py
```

### Independent-group scheduling

Same instrumented 10k corpus and shared 1 GiB budget. Revision `ab57bf94ff` separates queued groups
from active transactions, starts all bounded batch groups, rotates ready parents, releases client
capacity per outcome, and reserves queue slots only for new groups.

| Configuration | Untar (s) | Remaining drain (s) | Total (s) |
| --- | ---: | ---: | ---: |
| Instrumented control | 16.803 | 15.427 | 32.230 |
| Scheduler, 32 in-flight groups | 6.126 | 5.728 | 11.854 |
| Scheduler, 64 in-flight groups | 5.675 | 5.549 | 11.224 |
| Scheduler, 128 in-flight groups | 5.277 | 4.898 | 10.175 |

Use **128 groups** by default; envelope, byte and total memory bounds still apply. These are individual
runs, not confidence intervals. At 64 groups, queue-slot waiting fell to 0.303s, peak FDB attempts rose
from 4 to 10, and retries fell from 331 to 59. The separate direct-gRPC diagnostic took 10.475s with one
parent and 0.354s with 64 parents (195 / 5,786 groups/s); all files verified. A single hot parent still
serializes locally, while independent parents have substantial capacity.

Reports: `/tmp/dfs-v4-ab57bf94ff-{scheduling,flight32,flight128,groups}/run.json`.

### Create reads and same-parent concurrency

UUID collision prefetch now starts alongside ancestry/name prefetch. The semantic check still adds
its FDB read conflict and preserves authorization/error precedence. Source `92c6dfbbb9` measured
**5.782s + 4.994s = 10.776s**, repeated at **5.866s + 4.834s = 10.700s**. The one-parent diagnostic
improved from 10.475s to 9.276s; the 64-parent case was 0.351s.

A final paired check on `4acecff7f4`, with only collision prefetch removed in the control binary,
measured **10.933s total untar without / 11.084s with**. There is no established incremental untar gain
from this small change. The paired one-parent diagnostic improved from **10.385s to 8.756s**, with zero
retries; retain the overlap for that measured transaction-throughput benefit. The variant was not
committed; both reports retain binary hashes. All diagnostic files passed content verification.

Same-parent scheduling sweep, client capacity 128; source `4acecff7f4` for the 2/4 experiments and
final default. Each create still has its own durable transaction and rechecks current authorization.

| Transactions per primary | Untar (s) | Remaining drain (s) | Total (s) | Peak FDB attempts | Retry attempts |
| --- | ---: | ---: | ---: | ---: | ---: |
| **1 — retained default** | **5.751** | **5.333** | **11.084** | 10 | 113 |
| 2 | 5.491 | 4.171 | 9.662 | 14 | 3,444 |
| 4 | 5.950 | 4.516 | 10.466 | 25 | 10,321 |

| Transactions per primary | One-parent diagnostic (s) | Retries | 64-parent diagnostic (s) | Retries |
| --- | ---: | ---: | ---: | ---: |
| 1 | 9.276 | 0 | 0.351 | 0 |
| 2 | 8.393 | 853 | 0.463 | 205 |
| 4 | 7.617 | 2,409 | 0.522 | 291 |

These pre-split results retained **one per primary**: higher concurrency bought some hot-directory
latency with substantial retry amplification and worsened the independent-parent workload.
`DFS_PRIMARY_CONCURRENCY=2|4` remains an
explicit experiment. The [directory-record split](../DESIGN-DIRECTORY.md), measured below, subsequently
removed both the shared parent-record conflict and the local parent gate for sibling creates.

The measured configuration at `4acecff7f4` uses one shared **1 GiB** budget, 128 in-flight client groups,
16 bounded envelopes, 25ms coalescing and unchanged TTL/FDB durability. Relative to the instrumented control, total
completion fell **32.230s → 11.084s (2.9×)**. Untar alone fell **16.803s → 5.751s**.

In this run, group-slot waiting was 0.0005s and memory waiting 0.0043s. Envelope capacity was blocked
for 7.202s over untar plus drain; cumulative parent waiting was 995.072s, transaction attempts 40.098s,
and retry backoff 0.642s. These overlapping totals are not additive wall-time components. FUSE used
4.480 CPU-seconds before drain; the server used 6.420 CPU-seconds including drain. There were 1,220
client RPCs, including 1,179 batches / 10,121 independent groups, and no writeback failure.

Reports inside `dfs-v4-dev-1`:

- `/tmp/dfs-v4-92c6dfbbb9-{prefetch,prefetch-repeat,groups}/run.json`.
- `/tmp/dfs-v4-4acecff7f4-{primary2,primary4,groups2,groups4,final}/run.json`.
- `/tmp/dfs-v4-4acecff7f4-{no-prefetch,no-prefetch-groups,prefetch-groups}/run.json`.

Final server SHA-256: `6f644e4f44d64d9ba32e9fa048a107a32cef24e74e43206b6beb160c3e206d62`.
Final FUSE SHA-256: `715c8757f4dd2a1044fec97dbf786c82f59f47f57c6eed616407d4fad3325977`.
The corpus manifest is unchanged. These are local, individual trials; the full read suite was not rerun.
Rust/FDB tests and mounted filesystem checks passed. A new server/session/mount verified the final
run's manifest and every persisted file size/SHA-256 (10,000 files), outside timing. Tests cover
concurrent writers, UUID/name collisions, moved/revoked authority, stalled batch tails, and object-only
fsync. Raw reports, verification output and logs remain outside Git.

Reproduce the final default untar with the matching source and release binaries:

```sh
v4/local/run exec cargo build --workspace --release
v4/local/run exec env DFS_PROFILE=1 DFS_CLIENT_CACHE_MIB=1024 DFS_BENCH_REVISION=4acecff7f4 python3 /dfs/v4/bench/run.py --untar-only
```

## 512 MiB client budget

2026-10-06, source `17d5aa08c6`. Same deep 10k-file / 177.5 MB untar, new server/session/mount and
FDB prefix, with FDB/OS caches retained. One shared **512 MiB** budget, including the 96 MiB transient
reserve; 128 in-flight groups, 25ms coalescing and one server transaction per primary. The server
binary, manifest and all other benchmark settings match the preceding default run.

| Measurement (s) | 1 GiB `4acecff7f4` | 512 MiB `17d5aa08c6` |
| --- | ---: | ---: |
| Untar | 5.751 | **6.140** |
| Remaining client drain | 5.333 | **4.710** |
| Untar + remaining drain | 11.084 | **10.850** |
| Shared-memory admission wait | 0.0043 | **0.0044** |
| Pending-group admission wait | 0.0005 | **0.0005** |

Total completion is similar in these individual trials. Memory admission remained negligible, so
this run does not establish that the smaller budget caused extra foreground backpressure. Untar and
client drain completed without errors; only population/drain were rerun, without the read suite or
another full-content verification pass. Unmount including drain took 4.843s. FUSE CPU before drain was
4.810s; server CPU including drain was 6.870s. FDB peaked at eight transaction attempts with 92 retries.

```sh
v4/local/run exec env DFS_PROFILE=1 DFS_CLIENT_CACHE_MIB=512 DFS_BENCH_REVISION=17d5aa08c6 python3 /dfs/v4/bench/run.py --untar-only
```

Report: `/tmp/dfs-v4-17d5aa08c6-512mib/run.json` inside `dfs-v4-dev-1`.
FUSE SHA-256: `29d0e915946e9f669aed12b77d70568202ea05706ef3c1c6ac3c312067aef6e1`.
Raw reports and logs remain outside Git.

## Directory-record split

2026-10-06, source `9e8c6ea3c7`, paired with the saved pre-split server from `f4211c48b0`.
Same **512 MiB client binary**, deep 10k corpus, 25ms coalescing, 128 in-flight groups and 64 active
server transactions maximum. Only the server/storage format changed. As authorized, the dedicated
local v4 FDB user keyspace was cleared before each variant; FDB itself and OS caches were not restarted.
Other local versions and GCP were untouched. These are single trials, not confidence intervals.

| Measurement | Before split | Directory split |
| --- | ---: | ---: |
| Untar (s) | 6.116 | **6.814** |
| Remaining client drain (s) | 3.998 | **0.414** |
| Untar + remaining drain (s) | 10.114 | **7.228** |
| Unmount including drain (s) | 4.131 | 0.477 |
| Peak concurrent FDB attempts | 8 | 64 |
| Retry attempts | 99 | 31 |
| FUSE CPU before drain (s) | 4.850 | 6.300 |
| DFS CPU including drain (s) | 6.710 | 6.790 |

Completion through drain improved **29%**, and the remaining drain fell **90%**. Foreground untar
took 0.698s longer; this change improves durable publication throughput, not every foreground metric.
Both runs had zero writeback failures and no fsync/fsyncdir calls. Memory admission stayed negligible
(0.0053s / 0.0060s), so the difference is not dirty-memory backpressure.

### Where the directory-split untar time is spent

The former shared-parent scheduling wait fell from **894.388s cumulative to 0.0008s** of target-object
waiting. FDB now reaches the configured 64 active attempts; admission waiting totals 13.353s and
transaction attempts total 60.111s, versus 0.001s and 34.227s previously. These timers overlap:
more concurrent transaction time can accompany shorter wall time. The 31 remaining retries can
still arise from genuine metadata/namespace conflicts; the split does not weaken those checks.

Client envelope-capacity blocking fell from **6.384s to 0.182s**. Faster outcomes also changed batch
packing: 10,123 groups / 1,588 RPC envelopes before, versus 10,132 / 7,707 after. The increase in
small RPCs accompanies higher client CPU and slightly slower foreground untar. Both runs made the
same 22 Lookup, 14 List, seven Stat and one session RPC. Client batching was not changed in this work.

The direct-gRPC diagnostic isolates sibling-create throughput: **2,048 independent create+16 KiB
write transactions**, four concurrent 32-group envelopes, same deep inherited-grant path.

| Parent directories | Before split (s) | Directory split (s) | Peak FDB attempts, before / after | Retries, before / after |
| --- | ---: | ---: | ---: | ---: |
| 1 | 8.643 | **0.353** | 1 / 64 | 0 / 0 |
| 64 | 0.325 | **0.338** | 64 / 64 | 0 / 0 |

The hot-directory diagnostic improved **24.5×** while the many-parent case stayed similar. This is
not an untar timing; every diagnostic file was verified outside timing. Rust tests against real FDB,
Clippy and mounted filesystem checks passed, including two-server namespace/grant conflict cases.
A fresh server/session/mount verified all **10,000 persisted file sizes and SHA-256 hashes**, plus
the manifest, after the split run. This untimed check took 70.679s; the full read suite was not rerun.

```sh
v4/local/run exec cargo build --workspace --release
v4/local/run exec env DFS_PROFILE=1 DFS_CLIENT_CACHE_MIB=512 DFS_BENCH_REVISION=9e8c6ea3c7 python3 /dfs/v4/bench/run.py --untar-only
```

Reports inside `dfs-v4-dev-1`: `/tmp/dfs-v4-directory-split-control/run.json` and
`/tmp/dfs-v4-9e8c6ea3c7-directory-split/run.json`. Diagnostic reports use the same directory names
with `-groups` appended. Raw reports/logs remain outside Git.

- New server SHA-256: `581600f3ba44117f7c2f599bdccbdf88c7153406a319e5027e073275a9b8cd2c`.
- Control server SHA-256: `6f644e4f44d64d9ba32e9fa048a107a32cef24e74e43206b6beb160c3e206d62`.
- Unchanged FUSE SHA-256: `29d0e915946e9f669aed12b77d70568202ea05706ef3c1c6ac3c312067aef6e1`.
- Manifest SHA-256: `67fdf87da1a1b94bc1f6482f00b912c1010d512a907846e5747ba9c893d8a3c1`.

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

## Where time is spent — full-suite baseline

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
v4/local/run exec env DFS_PROFILE=1 DFS_CLIENT_CACHE_MIB=1024 DFS_BENCH_REVISION=c1784434e9 python3 /dfs/v4/bench/run.py
```

Baseline report: `/tmp/dfs-v4-c1784434e9/run.json` inside `dfs-v4-dev-1`; focused-run reports are listed
above. Raw JSON, logs, credentials and earlier failed/pilot runs remain outside Git. The 100k,
multi-server throughput and GCP evaluations remain future work.

- Corpus manifest SHA-256: `67fdf87da1a1b94bc1f6482f00b912c1010d512a907846e5747ba9c893d8a3c1`.
- Server binary SHA-256: `4d614f831be3d13124f6d4f50a10bdf7367051508034bd7f4e25169232070116`.
- FUSE binary SHA-256: `2ed5172ab4f6f4494e39771400ff5c210a1b6e9652a21116086b51c0278d3ee2`.

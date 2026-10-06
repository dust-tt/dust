# Benchmark results — dfs v4 dust-dev

Latest full-suite measurements: **2026-10-06**, source `4ad853b432`. All **24 checks and final
cleanup passed**, including both full-content hash passes. The [new full table](#latest-full-table--paired-rerun)
follows a [complete local run of the same revision](../bench/RESULTS.md#latest-full-table--paired-rerun).
The earlier full table and focused comparisons remain below; their cleanup failure is now fixed.

## Fixture and method

- Existing five `dfs-v2-spolu-*` VMs in **dust-dev**, each `n2-standard-8` (8 vCPU, 32 GiB).
  No cloud resource creation/deletion or FDB reconfiguration; prior corpora are retained.
- FDB 7.3.69: 18 processes across four hosts and three zones (`us-central1-a`, `b`, `f`),
  double replication, three coordinators, native latency settings. Storage/log hosts use local
  NVMe. GRV/commit proxies, master and resolver remain on the preferred transaction node in zone `a`.
- FUSE and DFS share the workload VM in zone `a`, communicating over loopback; FDB transactions
  cross the VPC. This is a replicated backend evaluation, not a remote client hop or multi-client test.
  Rust 1.98.1 release, native x86-64, Python 3.13.5, ripgrep 14.1.1, Linux `7.0.0-1011-gcp`.
- Same jd generator/workloads as [localhost](../bench/RESULTS.md#latest-full-table--paired-rerun),
  verified byte for byte: **10,000 files, 100 directories, 177,499,149 document bytes**, seed 42.
  Untar uses the uncompressed corpus archive, 13 directories below the tenant root through `/shared`
  and an inherited grant. The archive also includes `manifest.json`.
- Client: **D=2s, W=1s, C=1s**, 25ms coalescing, 512 MiB shared clean/dirty/bookkeeping budget
  including a 96 MiB transient reserve, 128 in-flight groups, 16 RPC envelopes, eight FUSE workers.
  D bounds client-controlled buffering/cache age; server and network delays are excluded.
  Bounded directory attribute prefetch; revision-validated retained blocks; no content prefetch.
  Direct I/O, zero kernel name/attribute TTLs, no kernel data cache or writeback.
- Server: direct durable FDB transactions, directory core/state split, advisory authorization hints,
  no read cache or writeback. Up to 64 active transactions; creates schedule by new object ID.
  **Fsync waits for the object's durable commits.** Untar acknowledges client RAM; remaining drain
  waits for FDB-confirmed responses. There is no subsequent server persistence stage.
- Each first read starts a new server/session/mount; FDB and OS caches remain. Warm is one repeat
  and can outlast the one-second TTL. Profiling enabled. Builds/tests finish before timing;
  interactive v2/v3 services are paused during the run and restored to their exact prior states.
  Single-run measurements, not statistical estimates.

## Latest full table — paired rerun

2026-10-06T18:34:43Z, source `4ad853b432` (runtime implementation `133f09dac5`). Full **10,000-file** run:
100 directories, **177,499,149 document bytes**, seed 42, with both first and warm passes.
Run after the local suite, release workspace tests against replicated FDB, and mounted checks.
Existing dust-dev workload VM: native x86-64, 8 vCPUs, 32 GiB. FUSE and DFS communicate over loopback;
FDB uses the existing 18-process, four-host, three-zone cluster with double replication and native
settings. Interactive v2/v3 services were paused for timing and restored to their exact prior states.
This compares different machines and FDB topologies, not network latency alone.

Client: **512 MiB**, 1s read TTL, 25ms coalescing, 128 in-flight groups, 16 envelopes, eight FUSE workers.
Directory revision reuse, bounded page-ahead attribute prefetch and the cleanup-race fix are enabled;
no file-content prefetch or kernel data/writeback caching. Each first read restarts server/session/mount;
FDB and OS caches remain. Warm is one repeat and can outlast the TTL. Profiling enabled; no concurrent
builds/tests. Existing data retained under separate prefixes. Single samples, not statistical estimates.

**All 24 timed checks, both full-content hash passes and final cleanup passed; exit 0.**
Untar: **12.744s + 0.559s remaining client drain = 13.303s**.
Unmount including drain: 0.666s. Fsync waits for durable FDB commits;
there is no later server persistence stage.

```text
+--------------+------------------------------------------------+-------+-----------+--------+
| Feature      | Workload                                       | Phase | Time (ms) | Result |
+--------------+------------------------------------------------+-------+-----------+--------+
| population   | untar (10,000 files, 177.5 MB)                 | once  | 12,744.45 | OK     |
| writeback    | remaining client drain after untar             | once  |    559.00 | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 12,133.13 | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 19,002.92 | OK     |
| metadata     | rg --files (10,000 files)                      | first |    684.32 | OK     |
| metadata     | rg --files (10,000 files)                      | warm  |     36.13 | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 11,230.15 | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 16,038.61 | OK     |
| metadata     | stat missing (256 paths)                       | first |  2,025.86 | OK     |
| metadata     | stat missing (256 paths)                       | warm  |  2,140.75 | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 11,958.06 | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  |  3,516.16 | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 12,533.00 | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  |  3,571.72 | OK     |
| path pruning | rg branch glob (981 candidate files)           | first |  2,722.63 | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  |  3,030.12 | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first |    603.64 | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  |    314.74 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 80,022.36 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 17,669.95 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first |  3,140.04 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  |  6,307.88 | OK     |
| write        | create + write (32 x 32 KiB files)             | once  |     28.71 | OK     |
| file sync    | fsync (32 files)                               | once  |    216.02 | OK     |
| write        | close (32 files)                               | once  |      0.83 | OK     |
| write        | unlink (32 files)                              | once  |     21.31 | OK     |
+--------------+------------------------------------------------+-------+-----------+--------+
```

### Where time is spent in this run

Read rows cover first + warm; untar includes fixture setup. FUSE CPU is sampled before remaining
drain, DFS CPU after it; neither includes FDB server CPU. Instrumented durations overlap and must
not be added as a wall-time breakdown.

| Workload | FUSE CPU (s) | DFS CPU (s) | FDB get elapsed (s) | FDB commit elapsed (s) |
| --- | ---: | ---: | ---: | ---: |
| Untar | 14.630 | 19.780 | 407.220 | 34.419 |
| Scandir + stat | 10.480 | 6.340 | 36.811 | 0.000 |
| Open + fstat + close | 11.310 | 6.420 | 36.688 | 0.000 |
| rg no-match | 13.020 | 24.330 | 370.719 | 0.000 |
| Open + read + SHA-256 | 20.290 | 29.780 | 229.020 | 0.000 |

Report: `/var/log/dfs-bench/v4/full-4ad853b432-20261006/benchmark/run.json`.
Server SHA-256: `43118364cb893a7a18b9e963c631e773d554f3f1224821bc5639d954111ef13e`.
FUSE SHA-256: `962b6d180620c3e221fd4d0e62e4a40a10e6cdba77097faa2c0dd814e5eeb566`.
Manifest SHA-256: `67fdf87da1a1b94bc1f6482f00b912c1010d512a907846e5747ba9c893d8a3c1`.
Generated reports, logs and credentials remain outside Git.

No fsync/fsyncdir calls occurred during untar. Cleanup encountered one listing race and stabilized
it with **0.092ms** cumulative in-flight wait; no listing retry exhaustion or writeback errors.
FDB stayed healthy with identical configuration/process roles and one-zone fault tolerance.
Benchmark and service restoration both exited **0**; the restored v3 mount was verified accessible.

### Local and GCP comparison

Seconds, from the two full runs above. `First` resets client/server state, retaining FDB/OS caches.

| Workload | Local | GCP |
| --- | ---: | ---: |
| Untar | 6.509 | 12.744 |
| Remaining client drain | 0.528 | 0.559 |
| Untar + drain | 7.037 | 13.303 |
| scandir + stat (100 dirs, 10,000 files), first | 11.771 | 12.133 |
| rg --files (10,000 files), first | 0.340 | 0.684 |
| open + fstat + close (10,000 files), first | 10.656 | 11.230 |
| rg no-match scan (10,000 files, 177.5 MB), first | 4.246 | 11.958 |
| open + read + SHA-256 (10,000 files, 177.5 MB), first | 64.177 | 80.022 |
| open + read + SHA-256 (10,000 files, 177.5 MB), warm | 15.484 | 17.670 |
| fsync (32 files), once | 0.148 | 0.216 |

## Previous full table — directory-record split

2026-10-06, source `a44ae816c9`, directory-record split and the **512 MiB** client cache.
All **24 timed checks passed**, including both full-content SHA-256 passes, but final recursive
scratch-directory cleanup failed with `EIO`, reproducing the local failure. This is **not a clean
suite pass**. The table preserves every measured row and its individual validation result.
The cleanup fix is included in the latest run above.

Untar: **12.869s**, remaining client drain: **0.479s**, total: **13.348s**.
Unmount, including that drain, took **0.665s**. No fsync/fsyncdir calls occurred during untar.
The `page cache` and `search` labels below are jd's workload categories; search means filesystem
`rg`, and kernel caching is disabled.

```text
+--------------+------------------------------------------------+-------+------------+--------+
| Feature      | Workload                                       | Phase |  Time (ms) | Result |
+--------------+------------------------------------------------+-------+------------+--------+
| population   | untar (10,000 files, 177.5 MB)                 | once  |  12,868.95 | OK     |
| writeback    | remaining client drain after untar             | once  |     479.00 | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first |  12,513.22 | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  |  12,869.65 | OK     |
| metadata     | rg --files (10,000 files)                      | first |     820.70 | OK     |
| metadata     | rg --files (10,000 files)                      | warm  |      40.25 | OK     |
| metadata     | open + fstat + close (10,000 files)            | first |  37,422.73 | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  |  36,813.13 | OK     |
| metadata     | stat missing (256 paths)                       | first |   2,372.61 | OK     |
| metadata     | stat missing (256 paths)                       | warm  |   2,306.90 | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first |  14,252.53 | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  |   2,403.29 | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first |  13,566.32 | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  |   2,426.30 | OK     |
| path pruning | rg branch glob (981 candidate files)           | first |   2,495.06 | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  |   1,752.20 | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first |     596.87 | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  |     242.89 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 109,479.86 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  |  39,292.75 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first |   4,051.18 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  |   3,012.99 | OK     |
| write        | create + write (32 x 32 KiB files)             | once  |      27.45 | OK     |
| file sync    | fsync (32 files)                               | once  |     235.26 | OK     |
| write        | close (32 files)                               | once  |       0.92 | OK     |
| write        | unlink (32 files)                              | once  |      19.76 | OK     |
+--------------+------------------------------------------------+-------+------------+--------+
```

## Cold open + fstat + close: RPC counts

Focused rerun on 2026-10-06 using harness `8203a56c5c` and the **same server/FUSE binaries and
defaults** as the full table. New isolated 10k corpus, fresh server/session/mount, FDB/OS caches
retained. Only the first `open + fstat + close` pass ran: **35,921.14ms**, all sizes verified.
This is a separate measurement; the original full-suite row above is unchanged.

| RPC | Calls | Cumulative client elapsed (s) |
| --- | ---: | ---: |
| Lookup | 4,382 | 24.548 |
| List (directory attribute prefetch) | 556 | 4.871 |
| Stat | 37 | 0.138 |
| **Workload total** | **4,975** | **29.557** |
| CurrentSession (mount setup, excluded above) | 1 | 0.000346 |

**0.4975 workload RPCs/file**; 4,976 including mount setup. No Read, mutation, or fsync RPCs.
Open/close use local handles; metadata cache misses use the RPCs above. Directory prefetch overlaps
foreground work, so cumulative RPC elapsed is not additive wall time. The original full-suite
counters combined cold and warm; this first-only run isolates them without changing the runtime.

Client/server Lookup/List/Stat counts agree exactly, all completed with zero errors, and the server
reported no active handlers at shutdown. Mount counters additionally show **154,004 FUSE lookup**
and **174,006 getattr** callbacks, plus 10,000 each of open/flush/release. These kernel-to-client calls
are distinct from network RPCs; the userspace cache handles most of them.

Reproduce by appending `--workload-prefix 'open + fstat + close' --first-only` to the GCP benchmark
command. Population and manifest setup use separate mounts; `case-2-client-metrics.json` contains
only this cold pass, its background directory prefetch, and mount initialization. Report:
`/var/log/dfs-bench/v4/fstat-first-8203a56c5c-20261006/benchmark/run.json`. The focused run and service
restoration both exited **0**. It omits scratch writes and does not resolve the full-suite cleanup bug.

## Directory revision reuse and page-ahead prefetch

2026-10-06, source `3e481abc97`. Same focused first-only method, corpus, replicated FDB topology,
512 MiB client budget and one-second TTL as the preceding measurement. New server/session/mount;
FDB/OS caches retained. This is one run per version, not an ablation or a full-suite rerun.

Real-directory pages now carry their snapshot revision. Matching fresh directory metadata validates
retained names/IDs, while `StatMany` refreshes child attributes independently in bounded batches.
Child writes, attributes and grants do not update the parent revision. Consuming a cached page also
prefetches its next page; background completion never recursively loads further pages. Virtual root
and `/shared` keep refreshing through List because their visibility can change independently.

| Measurement | Before (`8203a56c5c`) | After (`3e481abc97`) |
| --- | ---: | ---: |
| Cold open + fstat + close, 10,000 files (ms) | 35,921.14 | **10,348.06** |
| Lookup RPCs | 4,382 | 130 |
| List RPCs | 556 | 238 |
| Stat RPCs | 37 | 12 |
| StatMany RPCs | 0 | 94 |
| **Total workload RPCs** | **4,975** | **474** |
| Workload RPCs/file | 0.4975 | 0.0474 |
| Cumulative client RPC elapsed (s) | 29.557 | 3.367 |
| FUSE CPU (s) | 7.700 | 5.100 |
| DFS CPU (s) | 8.290 | 1.220 |
| FDB get calls | 120,072 | 20,199 |
| Cumulative FDB get elapsed (s) | 100.769 | 15.332 |

**3.47× faster**, with **90.5% fewer workload RPCs** and **97.0% fewer Lookups**. The client reused
85 expired pages after validating membership; 94 StatMany calls refreshed their attributes.
The combined measurement does not isolate revision reuse from page-ahead prefetch.
Cumulative RPC/FDB durations include parallel work and are not an additive wall-time breakdown.

All 10,000 sizes verified. Client/server Lookup/List/Stat/StatMany counts match exactly, with zero
RPC errors and no active handlers at shutdown. Each run additionally has one CurrentSession setup
RPC, excluded from the table. There were no content, mutation, or fsync RPCs in this workload.
FUSE callbacks remain 154,004 lookup, 174,006 getattr, and 10,000 each of open/flush/release.

This run's population took **12.853s untar + 0.542s remaining client drain = 13.395s**,
with no fsync/fsyncdir calls, versus 12.869s + 0.479s in the earlier full run.

Workspace tests against local and replicated FDB, plus mounted checks with release binaries, passed,
including rename,
replacement, ancestor grant revocation, independent child attribute expiry and bounded prefetch.
FDB remained healthy with unchanged configuration; benchmark and service restoration both exited 0.
The previously active interactive services were restored, and the v2 mount remained inactive.
This focused run omits scratch cleanup and does not resolve the full-suite cleanup failure above.

Report: `/var/log/dfs-bench/v4/fstat-first-3e481abc97-20261006/benchmark/run.json`.
Server SHA-256: `249f75ccdcb1fc183ceea650d786d3caf5c73a60d00b33dcc4d6c0b150b4f6ce`.
FUSE SHA-256: `d35b0cca701ad398e30e14965df53db6f82cf8b94baeee91061a15c679995799`.
Manifest SHA-256 is unchanged from the full table. Generated reports and logs stay outside Git.

## Where time is spent (earlier full table)

Cumulative instrumented seconds; read rows cover **first + warm** and their small untimed setup.
Untar includes fixture setup; FUSE CPU is sampled before remaining drain, DFS CPU after it.
CPU excludes the tar/benchmark process and FDB server processes. FDB gets run in parallel and overlap
other work: **these columns must not be added or subtracted as a wall-time breakdown**.

| Workload | FUSE CPU (s) | DFS CPU (s) | FDB get elapsed (s) | FDB commit elapsed (s) |
| --- | ---: | ---: | ---: | ---: |
| Untar | 14.520 | 20.300 | 553.468 | 34.549 |
| Scandir + stat | 10.080 | 3.620 | 46.624 | 0.000 |
| Open + fstat + close | 16.320 | 18.740 | 209.721 | 0.000 |
| rg no-match | 13.760 | 21.890 | 484.111 | 0.000 |
| Open + read + SHA-256 | 26.650 | 42.840 | 440.539 | 0.000 |

Untar completed 10,137 mutation groups with zero writeback errors. Cumulative memory-admission
wait was **13ms**, group-slot wait **3ms**, and metadata-refresh waiting for in-flight writes **81ms**.
There were 164 FDB retry-backoff events, totaling **0.908s** across concurrent transactions. These
counters show little foreground admission waiting; they do not attribute the whole untar duration.

## Validation and provenance (earlier full table)

Release workspace tests against replicated FDB and mounted filesystem checks passed before timing.
Both full-read passes matched all 10,000 file sizes/hashes; the first used a new server/mount after
population and drain, verifying persisted data.
The suite then failed during recursive cleanup after the timed unlink row. Client writeback reported
no failures; the failed phase logged directory listing callbacks but no `rmdir` callback. The
cleanup failure was unresolved at that revision; the same failure is documented in the local results.
The latest full run above includes the fix and passes cleanup.

FDB was healthy before and after the run, with two replicas remaining, one-zone fault tolerance,
and unchanged process roles/configuration. The previous three active interactive services were
restored; the previously inactive v2 mount remained inactive. The v3 mount was verified accessible
as `spolu`. Existing data and the new corpus remain available.

Server SHA-256: `4b708622f274dbf0cc9c873464e0f6623464f3617874f9dc28a99e497977ed6a`.
FUSE SHA-256: `2c8ffd1b9cab040450b5d6645718b1a1633fe25291c5ddf2aa2c8b0b5fd813aa`.
Manifest SHA-256: `67fdf87da1a1b94bc1f6482f00b912c1010d512a907846e5747ba9c893d8a3c1`.

Report: `/var/log/dfs-bench/v4/full-a44ae816c9-20261006/benchmark/run.json` on the workload VM.
Raw metrics, logs, cluster snapshots and credentials stay outside Git. Benchmark exit: **1**
(cleanup error); service restoration exit: **0**. Reproduction: [README.md](README.md).

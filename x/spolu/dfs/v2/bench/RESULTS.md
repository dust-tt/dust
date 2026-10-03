# Benchmark results — dfs v2 localhost

2026-10-02–03. Native Linux ARM64 in Docker Desktop on an Apple M4 Max; Rust 1.98.1 release builds.
One FDB 7.3.69 node (single SSD storage), one ES 8.15.3 node (one primary, zero replicas).
The Docker VM has 16 vCPUs and 7.65 GiB RAM.
FDB/ES each have a 3 GiB container limit; ES has a 1 GiB heap. The v1 Rust client/FUSE
uses kernel metadata/directory/page caching and writeback. No v2 application content cache.
The only approved client change is raising its inode cap to 1,000,000 for the 100,000-file rerun.
Database data lives on persistent Docker volumes without a separate per-volume disk quota.

These are **local shared-cluster measurements**. Each first search starts a new dfs-server/session
and connection; FDB, ES, and OS caches remain warm. This differs from v1's native macOS server,
remote GCS, and discarded backend caches. No cold-disk or GCP claim is made.

## Filesystem

Same jd workloads and v1 Linux FUSE client, with the inode-cap exception above. **Every first read row restarts dfs-server and
creates a new session and mount** (ten resets). Warm is one repeat on that mount. FDB/ES caches
and the Docker VM's OS cache are retained; local is the generated corpus on the container filesystem
and is not guaranteed cold. All 24 rows passed the original workload's result checks.

### dfs v2 [100,000 files: client inode limit]

2026-10-03. First attempt with 100,000 files / 1,775.1 MB in the same 100 directories.
Untar completed in **405.282 s**, with **0.000425 s** of remaining client `syncfs`, but the first
`scandir + stat` failed with **ENOSPC**. This is an **incomplete run**, not a successful full benchmark.

The v1 FUSE client used in this run limited its live inode table to 100,000 entries, including
directories and mount entries. Full traversal exceeds that limit even though backend disk space is available
(722 GiB free when checked). Server and tuning settings match the current 10,000-file baseline.
All 24 local-filesystem checks passed. The approved rerun raises only this cap to 1,000,000.

[Run metadata](current-v2-100k-inode-limit/filesystem.json),
[failure details](current-v2-100k-inode-limit/failure.json),
[full output](current-v2-100k-inode-limit/failure.txt), and
[local results](current-v2-100k-inode-limit/local.json).

### dfs v2 [current: no commit-version reuse, default GRV]

2026-10-03. Current v2 defaults: commit-version reuse removed; FDB's **5 ms GRV batching timeout**
restored. The other four tuning settings and overlapping metadata/authorization reads remain.
This is a new full **10,000-file** run, not the earlier default-GRV diagnostic.
Measured server revision `2717953273`; all 24 checks passed with the unchanged client/workload,
normal durable FDB commits, and ten server/session/mount resets. Phase profiling was disabled.
FDB restarted before the run; its volumes and the OS cache were retained, as was ES.

```text
+--------------+------------------------------------------------+-------+-----------+--------+
| Feature      | Workload                                       | Phase | Time (ms) | Result |
+--------------+------------------------------------------------+-------+-----------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 1,708.12  | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 132.45    | OK     |
| metadata     | rg --files (10,000 files)                      | first | 263.50    | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 5.99      | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 6,052.59  | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 851.85    | OK     |
| metadata     | stat missing (256 paths)                       | first | 184.38    | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 1.76      | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 5,426.34  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 188.91    | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 5,362.80  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 189.60    | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 767.57    | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 30.67     | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 129.46    | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 6.88      | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 12,313.19 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 1,212.25  | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 359.42    | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 16.28     | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 58.70     | OK     |
| file sync    | fsync (32 files)                               | once  | 18.74     | OK     |
| write        | close (32 files)                               | once  | 0.69      | OK     |
| write        | unlink (32 files)                              | once  | 35.11     | OK     |
+--------------+------------------------------------------------+-------+-----------+--------+
```

Untar: **37.201 s**. Remaining client `syncfs`: **0.000079 s**
after untar and **0.000056 s** after the suite. Shutdown: **0.036 s**.
These drain timings exclude writeback already completed during the workload; there is no remaining
FDB persistence drain after acknowledgment. Backend/OS caches remain warm; these are single runs.

A separate run through **two server processes in the same workspace** completed and verified
100 writes (50 × 1 KiB per writer) in **39.34 ms**. It also checked search/workspace
isolation and shared discovery with 1/2/512 grants. Debug commit logging was enabled only for this
separate run. Both runs verified fixture cleanup.

[Run metadata](current-v2/filesystem.json), [DFS rows](current-v2/dfs.json),
[local rows](current-v2/local.json), [two-server results](current-v2/workspaces.json),
[configuration](current-v2/configuration.json), and [per-case RPC counters](current-v2/).

Sequential milestones (single runs; full tables and raw reports follow):

| Server changes | Untar |
| --- | ---: |
| Before these three steps | 197.439 s |
| 1. FDB latency tuning | 44.301 s |
| 2. Recent commit version reuse | 43.066 s |
| 3. Early metadata/authorization reads | 36.421 s |
| 4. Remove commit-version reuse | 35.563 s |
| 5. Restore default GRV timeout (current) | 37.201 s |

The 30-second target remains unmet. Step 3's population mount recorded 40,335 mutation RPCs averaging
about 0.752 ms each, plus 10,205 lookups averaging 0.391 ms. These are client RPC timings, not FDB
commit-only measurements or an additive wall-time breakdown; mount counters also include setup
and manifest reads outside timed untar. See [counters](early-reads/case-0-client-metrics.json).

### FDB tuning ablation (fresh read versions)

2026-10-03. **1,000 files**, selected from the same fixed corpus, extracted six directories below a
selective grant attached six directories below the workspace root. Commit-version reuse is removed;
early metadata/authorization reads remain. This deep-folder diagnostic differs from the full
10,000-file benchmark below; do not extrapolate its timings directly.

Each of 12 configurations ran three times in seeded shuffled order, with the same release binary
(`c2f04430ca`), unchanged FUSE client, profiling disabled, and a new fixture. FDB restarted before
every run; its volumes and the OS cache were retained, as was ES. All **36,000 file hashes** passed
and every fixture was cleaned. The original node settings were restored. The five settings and their
units are documented in [README](../README.md).

First, restore one setting at a time from the fully tuned profile:

| Configuration | Untar median | Min–max (3 runs) | 100 writes, two servers |
| --- | ---: | ---: | ---: |
| All five tuned | 4.647 s | 4.343–4.953 s | 39.16 ms |
| Restore GRV timeout to 5 ms | 4.493 s | 4.353–4.701 s | 44.20 ms |
| Disable client busy-wait | 9.542 s | 9.353–9.633 s | 101.98 ms |
| Restore minimum commit interval to 1 ms | 5.852 s | 5.422–5.954 s | 76.96 ms |
| Restore idle commit interval to 500 µs | 10.536 s | 10.244–11.366 s | 102.13 ms |
| Disable server busy-wait | 8.057 s | 7.952–8.101 s | 46.71 ms |
| All five at FDB defaults | 23.868 s | 23.514–23.936 s | 191.00 ms |

Conversely, enable only one setting while keeping the other four at FDB defaults:

| Configuration | Untar median | Min–max (3 runs) | 100 writes, two servers |
| --- | ---: | ---: | ---: |
| Only GRV timeout = 1 µs | 15.704 s | 15.432–15.746 s | 151.64 ms |
| Only client busy-wait = 100 µs | 12.184 s | 11.265–12.401 s | 103.09 ms |
| Only minimum commit interval = 10 µs | 23.480 s | 23.058–24.031 s | 199.83 ms |
| Only idle commit interval = 10 µs | 17.444 s | 17.416–17.553 s | 170.51 ms |
| Only server busy-wait = 100 µs | 23.104 s | 23.063–23.326 s | 192.45 ms |

The idle commit interval and both busy-wait settings have the largest effects in the combined
profile. The minimum commit interval also helps there, despite providing little improvement alone.
Effects are not additive: server busy-wait alone changes little, but removing it from the tuned
combination increases median untar from 4.647 to 8.057 seconds.

In the 1,000-file diagnostic, the 1 µs GRV cap shows **no demonstrated benefit**: the default cap's
4.493-second median is slightly lower than 4.647 seconds, with overlapping ranges. Three runs do not
establish a reliable improvement. A subsequent full 10,000-file comparison gave **40.265 s with
default GRV versus 38.346 s tuned**, using the same binary and a fresh FDB process before each run.
The earlier tuned no-reuse run was 35.563 s. The effect is small and uncertain compared with the
other knobs, and may depend on workload size or background load; do not conclude that the cap is
universally unnecessary. Full tables and raw reports for both follow below.

Whole-fixture median CPU time (including generation, setup, hash verification, cleanup, and background
work) was **5.430 FDB / 10.737 dev CPU-seconds** with defaults and
**2.271 FDB / 5.390 dev CPU-seconds** fully tuned. These are not untar-only CPU measurements;
the dev container includes the server, FUSE, and benchmark processes. ES CPU is not included.

Each configuration also passed a separate **two-server, same-workspace** run: 100 verified writes,
shared discovery with 1/2/512 grants, and search/workspace isolation. Those columns are single runs
with debug profiling enabled (`f08533b5fa`, same server binary), not sustained throughput tests.
This experiment establishes local latency effects, **not production scalability**.

Reproduce with `bench/ablate.py --work <new-directory> --files 1000 --repeats 3`; use
`--workload workspaces --repeats 1` for the independent-writer checks. Run sequentially.
[Untar run order/settings](tuning-ablation/summary.json), [statistics](tuning-ablation/statistics.json),
[all untar reports and RPC counters](tuning-ablation/), and
[independent-writer reports](tuning-ablation-writers/summary.json).

### dfs v2 [fresh read versions, tuned control]

2026-10-03. Matched control following the default-GRV diagnostic: all five knobs tuned, same server
binary, no commit-version reuse, and an FDB process restart before the run. Untar measured
**38.346 s**, versus **40.265 s** with default GRV (5.0% more time). The earlier tuned no-reuse run
was **35.563 s**; retain this variation rather than attribute the entire difference to one knob.
These full-corpus samples do not establish that the GRV cap can be removed without cost.
Measured server revision `f08533b5fa`; all 24 checks passed with the unchanged client/workload,
normal durable FDB commits, and ten server/session/mount resets. Phase profiling was disabled.

```text
+--------------+------------------------------------------------+-------+-----------+--------+
| Feature      | Workload                                       | Phase | Time (ms) | Result |
+--------------+------------------------------------------------+-------+-----------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 1,782.62  | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 140.45    | OK     |
| metadata     | rg --files (10,000 files)                      | first | 308.13    | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 8.57      | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 6,133.73  | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 847.16    | OK     |
| metadata     | stat missing (256 paths)                       | first | 179.05    | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 1.92      | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 5,346.04  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 196.91    | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 5,526.46  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 196.79    | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 793.32    | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 30.68     | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 131.29    | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 8.74      | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 12,345.60 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 1,317.15  | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 380.61    | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 16.56     | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 56.99     | OK     |
| file sync    | fsync (32 files)                               | once  | 17.78     | OK     |
| write        | close (32 files)                               | once  | 0.71      | OK     |
| write        | unlink (32 files)                              | once  | 42.87     | OK     |
+--------------+------------------------------------------------+-------+-----------+--------+
```

Untar: **38.346 s**. Remaining client `syncfs`: **0.000062 s**
after untar and **0.000049 s** after the suite. Shutdown: **0.072 s**.
These drain timings exclude writeback already completed during the workload; there is no remaining
FDB persistence drain after acknowledgment. Backend/OS caches remain warm; these are single runs.

A separate run through **two server processes in the same workspace** completed and verified
100 writes (50 × 1 KiB per writer) in **39.16 ms**. It also checked search/workspace
isolation and shared discovery with 1/2/512 grants. This writer setup differs from the historical
single-server, different-workspace sample; debug commit logging was enabled only for this separate run.

[Run metadata](tuned-control/filesystem.json), [DFS rows](tuned-control/dfs.json),
[local rows](tuned-control/local.json), [two-server results](tuned-control/workspaces.json),
[configuration](tuned-control/configuration.json), and [per-case RPC counters](tuned-control/).

### dfs v2 [fresh read versions, default GRV timeout]

2026-10-03. Diagnostic override: GRV batch timeout restored to 5 ms; all four other knobs remain
tuned. No commit-version reuse. The full 10,000-file untar measured **40.265 s**. This differs from
the 1,000-file deep diagnostic, where restoring GRV showed no clear disadvantage. Node process
restarted before this run; normal local knob defaults have not been changed.
Measured server revision `f08533b5fa`; all 24 checks passed with the unchanged client/workload,
normal durable FDB commits, and ten server/session/mount resets. Phase profiling was disabled.

```text
+--------------+------------------------------------------------+-------+-----------+--------+
| Feature      | Workload                                       | Phase | Time (ms) | Result |
+--------------+------------------------------------------------+-------+-----------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 1,746.61  | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 140.62    | OK     |
| metadata     | rg --files (10,000 files)                      | first | 286.82    | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 7.73      | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 6,166.68  | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 860.32    | OK     |
| metadata     | stat missing (256 paths)                       | first | 184.02    | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 1.94      | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 5,625.19  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 204.07    | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 5,651.01  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 209.91    | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 772.44    | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 35.62     | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 139.50    | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 7.76      | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 12,217.16 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 1,118.55  | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 368.25    | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 16.71     | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 61.03     | OK     |
| file sync    | fsync (32 files)                               | once  | 14.50     | OK     |
| write        | close (32 files)                               | once  | 0.69      | OK     |
| write        | unlink (32 files)                              | once  | 37.42     | OK     |
+--------------+------------------------------------------------+-------+-----------+--------+
```

Untar: **40.265 s**. Remaining client `syncfs`: **0.000065 s**
after untar and **0.000049 s** after the suite. Shutdown: **0.036 s**.
These drain timings exclude writeback already completed during the workload; there is no remaining
FDB persistence drain after acknowledgment. Backend/OS caches remain warm; these are single runs.

A separate run through **two server processes in the same workspace** completed and verified
100 writes (50 × 1 KiB per writer) in **44.20 ms**. It also checked search/workspace
isolation and shared discovery with 1/2/512 grants. This writer setup differs from the historical
single-server, different-workspace sample; debug commit logging was enabled only for this separate run.

[Run metadata](default-grv/filesystem.json), [DFS rows](default-grv/dfs.json),
[local rows](default-grv/local.json), [two-server results](default-grv/workspaces.json),
[configuration](default-grv/configuration.json), and [per-case RPC counters](default-grv/).

### dfs v2 [fresh read versions]

2026-10-03. Removed commit-version reuse and its speculative fallback paths. All attempts now obtain
fresh read versions from FDB. Early metadata/authorization reads and the five tuned settings remain.
Untar measured **35.563 s**, compared with the previous **36.421 s** with reuse. This is a single-run
comparison across runs, not evidence that removing reuse itself improves performance.
Measured server revision `0502f90865`; all 24 checks passed with the unchanged client/workload,
normal durable FDB commits, and ten server/session/mount resets. Phase profiling was disabled.

```text
+--------------+------------------------------------------------+-------+-----------+--------+
| Feature      | Workload                                       | Phase | Time (ms) | Result |
+--------------+------------------------------------------------+-------+-----------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 1,705.91  | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 134.00    | OK     |
| metadata     | rg --files (10,000 files)                      | first | 275.65    | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 8.84      | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 5,883.14  | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 874.47    | OK     |
| metadata     | stat missing (256 paths)                       | first | 171.37    | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 1.76      | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 5,134.33  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 202.83    | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 5,146.33  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 194.60    | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 755.48    | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 29.83     | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 130.56    | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 8.76      | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 11,483.78 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 1,089.46  | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 355.12    | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 16.00     | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 62.21     | OK     |
| file sync    | fsync (32 files)                               | once  | 22.32     | OK     |
| write        | close (32 files)                               | once  | 0.68      | OK     |
| write        | unlink (32 files)                              | once  | 35.43     | OK     |
+--------------+------------------------------------------------+-------+-----------+--------+
```

Untar: **35.563 s**. Remaining client `syncfs`: **0.000064 s**
after untar and **0.000058 s** after the suite. Shutdown: **0.070 s**.
These drain timings exclude writeback already completed during the workload; there is no remaining
FDB persistence drain after acknowledgment. Backend/OS caches remain warm; these are single runs.

A separate run through **two server processes in the same workspace** completed and verified
100 writes (50 × 1 KiB per writer) in **35.21 ms**. It also checked search/workspace
isolation and shared discovery with 1/2/512 grants. This writer setup differs from the historical
single-server, different-workspace sample; debug commit logging was enabled only for this separate run.

[Run metadata](no-version-reuse/filesystem.json), [DFS rows](no-version-reuse/dfs.json),
[local rows](no-version-reuse/local.json), [two-server results](no-version-reuse/workspaces.json),
[configuration](no-version-reuse/configuration.json), and [per-case RPC counters](no-version-reuse/).

### dfs v2 [early metadata and authorization reads]

Builds on both previous steps. Workspace, primary object, hinted ancestors/grants, and child-name
reads now start together in the current transaction. File-parent hints cover writes after create.
Untar measured **43.066 → 36.421 s** (**15.4% less time**); full read/SHA-256 measured
**14.229 → 12.060 s**. The 30-second untar target is still unmet.
Measured server revision `f4944598bf`; all 24 checks passed with the unchanged client/workload,
normal durable FDB commits, and ten server/session/mount resets. Phase profiling was disabled.

```text
+--------------+------------------------------------------------+-------+-----------+--------+
| Feature      | Workload                                       | Phase | Time (ms) | Result |
+--------------+------------------------------------------------+-------+-----------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 1,942.81  | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 151.05    | OK     |
| metadata     | rg --files (10,000 files)                      | first | 313.69    | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 8.49      | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 6,606.75  | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 875.86    | OK     |
| metadata     | stat missing (256 paths)                       | first | 170.96    | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 1.89      | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 5,580.49  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 199.35    | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 5,637.36  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 199.91    | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 771.52    | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 39.21     | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 123.46    | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 6.78      | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 12,059.95 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 1,326.46  | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 348.92    | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 16.34     | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 62.87     | OK     |
| file sync    | fsync (32 files)                               | once  | 20.23     | OK     |
| write        | close (32 files)                               | once  | 0.76      | OK     |
| write        | unlink (32 files)                              | once  | 34.09     | OK     |
+--------------+------------------------------------------------+-------+-----------+--------+
```

Untar: **36.421 s**. Remaining client `syncfs`: **0.000069 s**
after untar and **0.000072 s** after the suite. Shutdown: **0.069 s**.
These drain timings exclude writeback already completed during the workload; there is no remaining
FDB persistence drain after acknowledgment. Backend/OS caches remain warm; these are single runs.

A separate run through **two server processes in the same workspace** completed and verified
100 writes (50 × 1 KiB per writer) in **44.65 ms**. It also checked search/workspace
isolation and shared discovery with 1/2/512 grants. This writer setup differs from the historical
single-server, different-workspace sample; debug commit logging was enabled only for this separate run.

[Run metadata](early-reads/filesystem.json), [DFS rows](early-reads/dfs.json),
[local rows](early-reads/local.json), [two-server results](early-reads/workspaces.json),
[configuration](early-reads/configuration.json), and [per-case RPC counters](early-reads/).

### dfs v2 [recent commit version]

Builds on the FDB latency settings. First mutation attempts reuse a recent committed snapshot;
all dependency reads and conflict checks remain live. Rejections and read-only results retry fresh.
Untar measured **44.301 → 43.066 s** (**2.8% less time**), a small single-run difference.
Measured server revision `8693ce4c73`; all 24 checks passed with the unchanged client/workload,
normal durable FDB commits, and ten server/session/mount resets. Phase profiling was disabled.

```text
+--------------+------------------------------------------------+-------+-----------+--------+
| Feature      | Workload                                       | Phase | Time (ms) | Result |
+--------------+------------------------------------------------+-------+-----------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 1,792.29  | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 140.43    | OK     |
| metadata     | rg --files (10,000 files)                      | first | 295.45    | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 16.88     | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 6,692.50  | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 851.70    | OK     |
| metadata     | stat missing (256 paths)                       | first | 232.40    | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 1.96      | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 5,839.51  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 219.05    | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 5,832.38  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 202.12    | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 815.41    | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 35.50     | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 133.59    | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 7.42      | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 14,229.07 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 1,257.12  | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 425.32    | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 16.49     | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 58.24     | OK     |
| file sync    | fsync (32 files)                               | once  | 32.69     | OK     |
| write        | close (32 files)                               | once  | 1.14      | OK     |
| write        | unlink (32 files)                              | once  | 38.84     | OK     |
+--------------+------------------------------------------------+-------+-----------+--------+
```

Untar: **43.066 s**. Remaining client `syncfs`: **0.000067 s**
after untar and **0.000051 s** after the suite. Shutdown: **0.069 s**.
These drain timings exclude writeback already completed during the workload; there is no remaining
FDB persistence drain after acknowledgment. Backend/OS caches remain warm; these are single runs.

A separate run through **two server processes in the same workspace** completed and verified
100 writes (50 × 1 KiB per writer) in **44.08 ms**. It also checked search/workspace
isolation and shared discovery with 1/2/512 grants. This writer setup differs from the historical
single-server, different-workspace sample; debug commit logging was enabled only for this separate run.

[Run metadata](commit-version/filesystem.json), [DFS rows](commit-version/dfs.json),
[local rows](commit-version/local.json), [two-server results](commit-version/workspaces.json),
[configuration](commit-version/configuration.json), and [per-case RPC counters](commit-version/).

### dfs v2 [FDB latency tuning]

Read-version/commit batching and short timer waits are tuned as documented in [README](../README.md).
Untar improved **197.439 → 44.301 s** (**4.46× faster**); full read/SHA-256 improved
**55.918 → 14.337 s**. These settings trade CPU for latency without weakening log synchronization.
Measured server revision `a04d793490`; all 24 checks passed with the unchanged client/workload,
normal durable FDB commits, and ten server/session/mount resets. Phase profiling was disabled.

```text
+--------------+------------------------------------------------+-------+-----------+--------+
| Feature      | Workload                                       | Phase | Time (ms) | Result |
+--------------+------------------------------------------------+-------+-----------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 1,861.14  | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 145.85    | OK     |
| metadata     | rg --files (10,000 files)                      | first | 268.68    | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 7.02      | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 6,739.95  | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 887.12    | OK     |
| metadata     | stat missing (256 paths)                       | first | 259.13    | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 2.03      | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 5,906.15  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 215.70    | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 5,795.76  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 192.71    | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 809.16    | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 30.86     | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 128.74    | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 8.45      | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 14,336.61 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 1,283.55  | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 428.14    | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 16.43     | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 61.69     | OK     |
| file sync    | fsync (32 files)                               | once  | 23.61     | OK     |
| write        | close (32 files)                               | once  | 0.95      | OK     |
| write        | unlink (32 files)                              | once  | 47.46     | OK     |
+--------------+------------------------------------------------+-------+-----------+--------+
```

Untar: **44.301 s**. Remaining client `syncfs`: **0.000110 s**
after untar and **0.000054 s** after the suite. Shutdown: **0.070 s**.
These drain timings exclude writeback already completed during the workload; there is no remaining
FDB persistence drain after acknowledgment. Backend/OS caches remain warm; these are single runs.

A separate run through **two server processes in the same workspace** completed and verified
100 writes (50 × 1 KiB per writer) in **42.75 ms**. It also checked search/workspace
isolation and shared discovery with 1/2/512 grants. This writer setup differs from the historical
single-server, different-workspace sample; debug commit logging was enabled only for this separate run.

[Run metadata](latency-tuning/filesystem.json), [DFS rows](latency-tuning/dfs.json),
[local rows](latency-tuning/local.json), [two-server results](latency-tuning/workspaces.json),
[configuration](latency-tuning/configuration.json), and [per-case RPC counters](latency-tuning/).

### dfs v2 [transaction read optimization]

Same 10,000-file corpus, unchanged client/API, and durable FDB acknowledgment. Server revision
`9caf79ade4`; phase profiling is **off** for this full run. Independent reads share the same
conflict-tracked transaction; block patches skip old data only when live metadata proves it unnecessary.
All 24 result checks passed, with ten server/session/mount resets.

```text
+--------------+------------------------------------------------+-------+-----------+--------+
| Feature      | Workload                                       | Phase | Time (ms) | Result |
+--------------+------------------------------------------------+-------+-----------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 7,302.77  | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 159.76    | OK     |
| metadata     | rg --files (10,000 files)                      | first | 322.09    | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 7.61      | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 24,501.63 | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 916.50    | OK     |
| metadata     | stat missing (256 paths)                       | first | 954.62    | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 4.88      | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 5,956.67  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 195.61    | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 6,680.60  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 211.93    | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 860.02    | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 29.62     | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 203.42    | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 5.94      | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 55,918.01 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 1,274.29  | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 1,475.89  | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 28.74     | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 304.44    | OK     |
| file sync    | fsync (32 files)                               | once  | 226.59    | OK     |
| write        | close (32 files)                               | once  | 2.96      | OK     |
| write        | unlink (32 files)                              | once  | 220.83    | OK     |
+--------------+------------------------------------------------+-------+-----------+--------+
```

Untar: **197.439 s**, down from **244.149 s** (**19.1% less time**, **1.24× faster**).
Final client `syncfs`: **0.000331 s** after untar and **0.000093 s** after the suite; only remaining
writeback is measured. Shutdown: **0.035 s**. Every accepted mutation already awaited FDB;
there is no authoritative persistence drain after acknowledgment.

First open/stat/close improved **35.190 → 24.502 s** (**30.4% less time**); full read/SHA-256 improved
**67.302 → 55.918 s** (**16.9%**). Create/write improved **380.93 → 304.44 ms** and unlink
**295.66 → 220.83 ms**. Scandir/stat and fsync changed little. Kernel-warm results remain similar;
rare-literal ripgrep was slower (**6.346 → 6.681 s**). These are single runs with retained backend/OS
caches, so small differences do not establish a regression or gain.

Untar remains far slower than [v1 with client optimization](../../v1/bench/RESULTS.md): **17.084 s**
plus **5.570 s** remaining SlateDB persistence. v1 acknowledges in RAM; v2 requires durable FDB commits.
The measurements use different backend topology and do not isolate durability's contribution.

[Run metadata](transaction-reads/filesystem.json), [DFS rows](transaction-reads/dfs.json),
[local rows](transaction-reads/local.json), and [per-case RPC counters](transaction-reads/).
The measured revision precedes a follow-up error-ordering guard: a definitive application rejection
wins over a failed speculative read instead of retrying it. That guard changes only failure handling.
Previous filesystem tables and search results are retained below.

#### Deep-path untar diagnostics

Separate, profiled 1,000-file samples use a grant below six outer directories, six more directories
below that grant, then the corpus tree. The mount has only that selective grant. These diagnose the
same general path; there is no root-specific optimization. Every file's SHA-256 was verified.
The before binary is the ancestry-hints implementation plus the same phase instrumentation; raw
reports retain all binary hashes. These smaller instrumented timings are separate from the full run.

| Measurement | Before | After |
| --- | ---: | ---: |
| Untar wall time | 27.053 s | 22.439 s |
| Create preparation, mean | 2.953 ms | 1.057 ms |
| Metadata update preparation, mean | 1.773 ms | 1.134 ms |
| Write preparation, mean | 2.188 ms | 1.138 ms |
| Old block reads | 1,039 | 35 |
| Mutation preparation, summed | 8.851 s | 4.544 s |
| Mutation read-version acquisition, summed | 4.804 s | 5.549 s |
| Mutation commit waits, summed | 7.919 s | 7.523 s |

Read-version acquisition and durable commit waits now dominate the measured mutation phases.
Local lock waits totaled **15 ms** after optimization. Preparation excludes read-version acquisition
in these diagnostic runs; its nested phases overlap and must not be added together. Sums across calls
are not elapsed wall time. FUSE still issues separate create, metadata update, and content RPCs.

With ES deliberately unreachable, the before run took **27.694 s**, versus **27.053 s** with indexing
running. Pending jobs were still written to FDB. Indexing did not explain the foreground cost in this
small sample; this does not establish its impact under heavier concurrent load.

[Before profile](transaction-reads/profile-before.json),
[before with ES unavailable](transaction-reads/profile-before-no-indexer.json),
[after profile](transaction-reads/profile-after.json). Reproduce with [bench/untar.py](untar.py);
see [README](../README.md) for commands and profiling caveats.

### dfs v2 [ancestry hints]

Same 10,000-file corpus and setup, server revision `2e71c2b6e7`. Directory-to-parent ID hints
parallelize live ancestor/grant reads; every first row starts with an empty hints cache. The unchanged
FUSE client, API, FDB commit guarantees, and ES indexer are retained. All 24 result checks passed.

```text
+--------------+------------------------------------------------+-------+-----------+--------+
| Feature      | Workload                                       | Phase | Time (ms) | Result |
+--------------+------------------------------------------------+-------+-----------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 7,315.20  | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 145.22    | OK     |
| metadata     | rg --files (10,000 files)                      | first | 401.22    | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 6.52      | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 35,190.00 | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 879.23    | OK     |
| metadata     | stat missing (256 paths)                       | first | 1,035.86  | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 4.35      | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 6,438.43  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 191.78    | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 6,346.39  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 190.83    | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 881.53    | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 33.51     | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 211.74    | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 9.63      | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 67,302.16 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 1,241.85  | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 1,871.66  | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 28.26     | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 380.93    | OK     |
| file sync    | fsync (32 files)                               | once  | 234.62    | OK     |
| write        | close (32 files)                               | once  | 1.65      | OK     |
| write        | unlink (32 files)                              | once  | 295.66    | OK     |
+--------------+------------------------------------------------+-------+-----------+--------+
```

Untar: **244.149 s**, down from **735.751 s** (**3.01× faster**). Final client `syncfs` took
**0.000144 s** after untar and **0.000114 s** after the suite; these measure only remaining writeback.
Shutdown: **0.036 s**. Every accepted mutation already awaited FDB; no authoritative persistence drain.

First open/stat/close improved **105.896 → 35.190 s** and full read/SHA-256 improved
**202.412 → 67.302 s**, both about **3×**. Missing-path checks improved **3.659 → 1.036 s**;
no-match ripgrep improved **11.291 → 6.438 s**. Scandir/stat improved less (**8.641 → 7.315 s**):
its per-child reads remain sequential. Kernel-warm times are broadly unchanged. These are single runs,
with backend/OS caches retained, rather than repeated statistical measurements.

Untar RPC averages fell from **11.58 → 3.10 ms** for lookup, **12.56 → 5.62 ms** for create,
**14.60 → 4.80 ms** for update, and **15.37 → 5.12 ms** for write. Lookup/create counts are identical;
writeback produced fewer write/update calls (51,113 total RPCs versus 52,862), despite unchanged client
settings. The remaining foreground cost still includes per-file RPCs, live FDB reads, and durable
commits. In the sequential full-read case, cumulative lookup RPC time is **33.295 s** and read RPC
time **29.991 s** out of **67.302 s** elapsed.

[Run metadata](ancestry-hints/filesystem.json), [DFS rows](ancestry-hints/dfs.json),
[local rows](ancestry-hints/local.json), and [per-case RPC counters](ancestry-hints/).
The original filesystem and search results below are retained. Deep-path tests also verify grants
below the workspace root and moves/revocations from another server, including FDB write conflicts;
this algorithm has no root-specific shortcut.

### dfs v2 [FoundationDB + Elasticsearch]

```text
+--------------+------------------------------------------------+-------+------------+--------+
| Feature      | Workload                                       | Phase | Time (ms)  | Result |
+--------------+------------------------------------------------+-------+------------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 8,640.62   | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 154.48     | OK     |
| metadata     | rg --files (10,000 files)                      | first | 387.65     | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 9.04       | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 105,895.74 | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 864.01     | OK     |
| metadata     | stat missing (256 paths)                       | first | 3,659.38   | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 4.37       | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 11,290.74  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 189.75     | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 11,445.11  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 190.92     | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 1,445.76   | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 29.79      | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 336.99     | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 6.96       | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 202,411.60 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 1,297.34   | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 5,901.04   | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 17.06      | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 681.54     | OK     |
| file sync    | fsync (32 files)                               | once  | 448.49     | OK     |
| write        | close (32 files)                               | once  | 1.41       | OK     |
| write        | unlink (32 files)                              | once  | 463.53     | OK     |
+--------------+------------------------------------------------+-------+------------+--------+
```

Untar: **735.751 s**. The final client `syncfs` took **0.000145 s** after untar and **0.000131 s**
after the suite: these measure only remaining writeback, because file closes already published data
during the timed workload. They are not total client writeback time. Server shutdown: **0.069 s**.
There is no remaining authoritative persistence drain: each accepted mutation already awaited FDB.

The client uses eight FUSE workers, `max_background=32`, 1 MiB requested readahead, kernel writeback,
and effectively unbounded metadata TTL (4,294,967,295 s). See [run metadata](latest/filesystem.json),
[DFS rows](latest/dfs.json), [local rows](latest/local.json), and per-case client RPC counters in
[latest/](latest/). The measured server revision is `ab61baf616`; raw reports include its binary hash.

These measurements expose substantial latency in first-touch per-file operations. Kernel-warm
reads benefit strongly from the unchanged v1 cache behavior. The ripgrep workloads parallelize reads;
the sequential open/read loop pays RPC and authoritative FDB lookup costs repeatedly. No application
metadata/authorization cache or batched filesystem RPCs were added for this comparison.

### Local Linux baseline

```text
+--------------+------------------------------------------------+-------+------------+--------+
| Feature      | Workload                                       | Phase | Time (ms)  | Result |
+--------------+------------------------------------------------+-------+------------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 129.49     | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 133.50     | OK     |
| metadata     | rg --files (10,000 files)                      | first | 7.18       | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 7.30       | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 43.13      | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 42.31      | OK     |
| metadata     | stat missing (256 paths)                       | first | 2.38       | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 1.65       | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 18.94      | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 17.88      | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 17.90      | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 17.99      | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 13.74      | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 10.78      | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 5.48       | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 4.39       | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 147.20     | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 142.11     | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 1.78       | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 1.35       | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 0.60       | OK     |
| file sync    | fsync (32 files)                               | once  | 21.89      | OK     |
| write        | close (32 files)                               | once  | 0.02       | OK     |
| write        | unlink (32 files)                              | once  | 0.22       | OK     |
+--------------+------------------------------------------------+-------+------------+--------+
```

## Keyword search

Same validated jd corpus and v1 query matrix: **10,000 files, 177.5 MB**, ten warm repeats.
All eight cases returned their exact expected results without partial responses. Warm p95 is the
maximum of ten samples. Authorization caching is per request only.

| Search | Hits | Server cold (ms) | Warm p50 (ms) | Warm p95 (ms) |
| --- | ---: | ---: | ---: | ---: |
| Rare keyword | 4 | 34.30 | 31.34 | 40.86 |
| Case-insensitive keyword | 100 | 168.94 | 155.27 | 202.13 |
| Broad keyword, top 20 | 20 | 117.88 | 95.53 | 134.07 |
| Metadata + MIME + size | 100 | 78.72 | 80.08 | 97.72 |
| Keyword + xattr equality | 2 | 13.71 | 10.96 | 13.44 |
| Binary xattr equality | 1 | 10.68 | 8.84 | 9.88 |
| Rare keyword, selective grant | 1 | 21.21 | 27.78 | 35.09 |
| Rare keyword, 512 grants | 1 | 116.44 | 101.63 | 106.29 |

gRPC population: **260.474 s**; remaining indexing drain:
**1.448 s**. Indexing overlaps population, so this drain is not
standalone indexing throughput. The worker processed **10,117 file versions** in
**250 batches**; coalescing can still index intermediate versions during a slow import.
Shutdown took **0.034 s**. All acknowledged mutations already committed to FDB;
there is no SlateDB-style persistence drain after acknowledgement.

The recurring Linux socket delay was removed by enabling `TCP_NODELAY` on accepted connections.
For example, rare-keyword warm p50 fell from 67.56 to 31.34 ms. The remaining query cost
is mostly live metadata/authorization reads in FDB, rather than ES query execution. Inspect the
per-request phase timings in [raw results](latest/search.json); the earlier run is retained in
[initial results](initial/search.json). Backend topology and write durability differ substantially
from [v1](../../v1/bench/SEARCH-RESULTS.md), so these are not an isolated ES-versus-LanceDB comparison.

## Multiple workspaces and grants

Two active workspaces (32 files each) and 16 idle workspaces share the same server, FDB prefix,
and ES index. This is a small correctness/performance sample, not a tenant-scale capacity test.
Each directly granted file remains in `/shared` alongside its granted folder, even though all are
also reachable through the main tree. Duplicate grants do not duplicate entries.

| Workload | Result | Time (ms) |
| --- | --- | ---: |
| `/shared`, 1 grant, pages of 7 | 33 distinct entries | 39.17 |
| `/shared`, 2 grants, pages of 7 | 33 distinct entries | 32.67 |
| `/shared`, 512 grants, pages of 7 | 33 distinct entries | 1,554.63 |
| Search workspace 1 | 32 own-workspace hits | 71.45 |
| Search workspace 2 | 32 own-workspace hits | 66.53 |
| Two concurrent writers, 50 × 1 KiB writes each | 100 writes, verified final bytes | 298.42 |

Debug commit logging was enabled only for this run. Across **376** successful transactions,
commit wait was **1.718 ms p50**, **3.096 ms p95**, and **8.334 ms maximum**;
there were **11** aborted attempts retried before successful commits. This includes filesystem,
indexer, and empty commits; it excludes transaction preparation/read time and is not per-RPC latency.
Both writers completed in approximately 0.296 s. Grant scans still grow with session grant count.
See [raw multi-workspace results](latest/workspaces.json).

## Validation and limits

Rust filesystem/storage/search/transport tests, the unchanged v1 two-mount FUSE workload, and the
ES failure-injection suite pass. Coverage includes partial/ambiguous indexing publication, restart
before queue completion, grant revocation during an expired search read view, and ES downtime.
A live FDB/ES restart preserved all 100 acknowledged multi-block writes, kept metadata/content
coherent, and resumed indexing without restarting dfs-server. That run returned no interrupted RPC
errors; it is not proof that an ambiguous FDB commit can never occur. Such errors are surfaced
without automatic replay.

These are single runs on single-node development databases, without machine-failure redundancy.
No backend/OS cache flush, large-tenant load, replicated cluster, or cloud benchmark was performed.

[Reproduction](../README.md). Successful benchmark runs clean only their generated FDB prefix/ES index.

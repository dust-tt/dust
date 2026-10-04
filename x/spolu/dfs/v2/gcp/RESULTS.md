# Benchmark results — dfs v2 on dust-dev

2026-10-04. Live GCP nodes; unchanged v2 server/API and v1 FUSE/client, built from `34ef74fc263a`.
See [setup and reproduction](README.md) and the [localhost results](../bench/RESULTS.md).

## Setup findings

- Three FDB 7.3.69 hosts in `us-central1-a`, `b`, and `f`; workload host in `a`. All are
  `n2-standard-8`, 8 vCPU / 32 GiB, Ubuntu 24.04. Workload CPU: Intel Xeon 2.80 GHz, x86_64.
- The original `us-central1-c` request failed because N2 + local SSD capacity was unavailable.
  User-created replacement `f` retains `10.84.0.13`; no autonomous cloud resource creation/deletion.
- FDB uses one 375 GiB local NVMe per host. Ubuntu automatically expanded boot filesystems to
  approximately 48 GiB usable on FDB hosts and 193 GiB on the workload host; no manual resize needed.
- Twelve FDB processes: storage, transaction, and two stateless per host. Double replication,
  three coordinators, GCP zone failure domains. Healthy status reports one-zone fault tolerance.
- FDB process memory limit 8 GiB, storage cache 2 GiB. Workload ES 8.15.3: single node,
  2 GiB heap / 4 GiB limit, SSD persistent disk. FUSE and dfs-server run together on the workload VM;
  FDB traffic crosses the private VPC. ES replication is outside this experiment.
- Native durable FDB commits, default 5 ms GRV batching, 100 µs client/server busy waits, and
  10 µs minimum/idle commit batching. No commit-version reuse or deferred FDB publication.
- Rust 1.98.1 release builds. Server SHA256:
  `164ac590378e30f1bb3b7ba8309f6d78d30be69aceb4fbe392caab0703cfa2e0`.
  FUSE SHA256: `7d4647047b5c03f801b87ac84c45563ce5bfd2bc0135d415257a4084b322f89c`.

Workload-host ICMP round trips (10 probes per host, no loss; includes the first probe):

| FDB host | Minimum (ms) | Average (ms) | Maximum (ms) |
| --- | ---: | ---: | ---: |
| `a` — same zone | 0.128 | 0.213 | 0.761 |
| `b` | 0.623 | 0.711 | 1.321 |
| `f` | 0.735 | 0.817 | 1.362 |

These are network probes, not FDB transaction latency measurements.

With the first 10k corpus loaded, FDB reported **7 partitions / 184.6 MB logical key-value data**,
healthy double replication, and stored data on all three storage processes (approximately
136.7 / 103.9 / 134.3 MB on `a` / `b` / `f`, including replicas). The dataset is physically distributed;
these counters do not identify which individual DFS transactions crossed partition boundaries.

## Validation

- `cargo test --workspace`: passed against live FDB and ES, including storage atomicity/recovery,
  independent writers, authorization/ancestry changes, filesystem behavior, search, and transport.
- Release server, workspace benchmark, unchanged CLI/FUSE, and search helper: built successfully.
- Single-host FDB failure tests: **all three passed**. With each host's four FDB processes stopped,
  earlier acknowledged values remained readable and new writes committed. After restarting each
  service, all values remained correct and full replication/one-zone fault tolerance returned before
  testing the next host. This uses a small fixture and service stops, not VM/disk loss or load testing.
- Linux two-mount tests: passed kernel caching/writeback, deferred conflict/unlink errors, partial
  writes, append/truncate, paging, cached revocation, duplicate aliases, and server restart recovery.
- Search failure injection: passed ES outage, per-item ambiguity, crash replay, and expired grant
  snapshots against the real ES node.
- Two independent dfs-server processes: **100 verified writes to one workspace in 0.420 s**;
  each writer completed 50 writes in 0.382 / 0.415 s. The fixture also checked two active workspaces,
  16 idle workspaces, and search isolation. Debug commit logging was enabled for this diagnostic.

The first failure probe preserved acknowledged data and accepted new commits with node `a` stopped.
Its controller then rejected a transitional FDB status response: `data.state.healthy` is absent
while data distribution initializes. The controller now treats that state as pending recovery;
the stopped service was restored before the error propagated.

Small workspace diagnostic (single run; not a large-corpus search benchmark):

| Operation | Result | Time (ms) |
| --- | --- | ---: |
| `/shared`, 1 grant | 33 entries | 33.70 |
| `/shared`, 2 grants | 33 entries | 47.55 |
| `/shared`, 512 grants | 33 entries | 782.97 |
| Search, workspace 0 | 32 authorized hits | 34.82 |
| Search, workspace 1 | 32 authorized hits | 33.40 |

Across the diagnostic's 386 logged FDB commit calls (setup, writers, and indexing mixed), median
commit-call time was 3.876 ms, p95 4.398 ms, and maximum 5.378 ms; 14 retries were reported in total.
This excludes transaction preparation/reads and is not an end-to-end RPC latency distribution.

## Measurement interruption and recovery

The first import finished, then the original read suite passed four rows before remounting failed
with `EBUSY` during interactive inspection. The specific holder was not established. Its stopped
FUSE mount was unmounted and the orphan server stopped; the corpus and original reports were kept.
The original harness had not saved the workspace credential, so recovery rotated only that fixture's
workspace key and saved it privately. File contents, object IDs, grants, and versions were unchanged.
The read suite is rerun from the retained corpus; its import timing remains the original measurement.
The harness now saves private fixture credentials and supports explicit retention/resumption.


## Filesystem benchmarks

**100k is deferred at the user's request.** The comparison is two sequential 10,000-file imports:
first into an initially empty application subspace, then into a new workspace in the **same FDB
prefix and ES index**, retaining the first corpus. One foreground writer at a time; indexing stays
enabled. This measures the effect of existing data, not simultaneous writers. Both corpora remain.

Same jd timed actions and result checks, including full-corpus SHA-256 verification. Each completed
run passed all 24 local-disk and 24 DFS checks. Each corpus has 10,000 files / 177.5 MB in 100
directories with ten-level structure and seed 42. Kernel caching/writeback and the 1,000,000 live-inode
limit are unchanged. Server/API/client binaries are identical between the runs.

Every first read case restarts dfs-server and creates a new session/mount (ten resets per run).
**FDB, ES, and host OS caches remain warm**; warm rows repeat on the same mount. Native FDB durability
is included in foreground writes. Remaining client writeback is measured separately; there is no
post-acknowledgment FDB durability drain to add. Tests/builds/failure injection do not overlap timed
benchmarks. JSON reports and logs stay under `/var/log/dfs-bench`, outside Git.

The live setup differs from localhost in CPU architecture, RAM/cache capacity, SSDs, replication,
and network topology. Ratios are whole-setup comparisons, not isolated replication overhead.
These are single runs, not statistical estimates.

| Run | Untar (s) | Untar (ms/file) | Remaining client writeback after untar (s) | After suite (s) | Server shutdown (s) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Initially empty | 513.701 | 51.3701 | 0.000258 | 0.000162 | 0.032 |

Writeback values exclude work already completed during untar/the workload; do not add it twice.

### dfs v2 [dust-dev, 10,000 files — initially empty]

Validated report: `/var/log/dfs-bench/vfs-10k-1`.

Untar is the original import; all read/write rows below were remeasured after the mount
interruption described above. The corpus was not re-imported.

```text
+--------------+------------------------------------------------+-------+------------+--------+
| Feature      | Workload                                       | Phase | Time (ms)  | Result |
+--------------+------------------------------------------------+-------+------------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 10,866.22  | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 368.00     | OK     |
| metadata     | rg --files (10,000 files)                      | first | 2,141.35   | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 8.28       | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 68,390.94  | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 951.00     | OK     |
| metadata     | stat missing (256 paths)                       | first | 1,859.26   | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 4.71       | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 17,219.99  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 120.54     | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 17,033.31  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 120.70     | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 3,175.18   | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 23.91      | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 468.33     | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 7.04       | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 123,027.47 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 1,586.20   | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 3,211.33   | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 18.43      | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 582.41     | OK     |
| file sync    | fsync (32 files)                               | once  | 683.10     | OK     |
| write        | close (32 files)                               | once  | 0.97       | OK     |
| write        | unlink (32 files)                              | once  | 463.86     | OK     |
+--------------+------------------------------------------------+-------+------------+--------+
```

Corpus manifest SHA256: `67fdf87da1a1b94bc1f6482f00b912c1010d512a907846e5747ba9c893d8a3c1`.

### dfs v2 [dust-dev, another 10,000 files with the first corpus retained]

Run in progress; results will be added after validation.

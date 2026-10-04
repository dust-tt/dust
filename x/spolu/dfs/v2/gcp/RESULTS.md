# Benchmark results — dfs v2 on dust-dev

2026-10-04. Live GCP nodes; unchanged v2 server/API and v1 FUSE/client, built from `34ef74fc263a`.
See [setup and reproduction](README.md) and the [localhost results](../bench/RESULTS.md).

Latest: [FDB latency defaults](#fdb-latency-tuning-disabled) completed 10k untar in **505.715 s**,
versus **529.947 s** tuned. All checks passed; original tuning is restored and all three corpora
remain. The restart changed proxy placement, so the comparison does not isolate tuning alone.

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
- All runs use native durable FDB commits. The first two used default 5 ms GRV batching,
  100 µs client/server busy waits, and 10 µs minimum/idle commit batching.
  No commit-version reuse or deferred FDB publication.
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
The read suite was rerun from the retained corpus; its import timing remains the original measurement.
The harness now saves private fixture credentials and supports explicit retention/resumption.

## Initial latency observations

The first untar's **513.701 s** includes all current v2 tuning; it is **13.81×** the current localhost
10k result of **37.201 s**. The resumed cold read/hash row took **123.027 s**. Client counters for
that mount recorded 10,102 lookup RPCs totaling **61.005 s** and 10,000 read RPCs totaling **56.222 s**
(about **6.04 / 5.62 ms per call**). The open/stat mount recorded 10,102 lookups totaling **65.343 s**
within a **68.391 s** first pass. Counters cover both first/warm rows and setup on each mount;
they measure complete RPC latency, not FDB-only time. These sequential per-file round trips account
for most of those read workloads. Separating GRV, authorization, data reads, and commit costs needs
a further profile; these results do not isolate that breakdown.

The original population mount recorded **77,862 RPCs**, approximately **7.8 per corpus file**,
including directory/manifest/setup work. The main calls were:

| RPC | Calls | Cumulative client RPC time (s) | Mean (ms/call) |
| --- | ---: | ---: | ---: |
| Create | 10,102 | 89.781 | 8.89 |
| Lookup | 10,205 | 43.791 | 4.29 |
| Stat | 27,324 | 116.710 | 4.27 |
| Metadata update | 20,204 | 167.904 | 8.31 |
| Write | 10,003 | 85.919 | 8.59 |

The remaining 24 reads fetched the manifest. The 10,102 failed lookups are expected missing-name
checks before creates; mutations reported no RPC errors. Metadata calls materially outweigh content
writes in this untar. Cumulative RPC times can overlap and are not a partition of wall time.



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
| Existing 10k retained | 529.947 | 52.9947 | 0.000213 | 0.000131 | 0.032 |

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

### dfs v2 [dust-dev, 10,000 files — existing 10k retained]

Validated report: `/var/log/dfs-bench/vfs-10k-2`.

```text
+--------------+------------------------------------------------+-------+------------+--------+
| Feature      | Workload                                       | Phase | Time (ms)  | Result |
+--------------+------------------------------------------------+-------+------------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 6,255.35   | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 368.07     | OK     |
| metadata     | rg --files (10,000 files)                      | first | 1,270.30   | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 9.39       | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 49,955.25  | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 782.08     | OK     |
| metadata     | stat missing (256 paths)                       | first | 1,848.95   | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 4.83       | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 17,954.03  | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 117.99     | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 18,124.35  | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 118.73     | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 2,548.10   | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 26.15      | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 390.83     | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 7.01       | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 117,896.11 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 1,719.31   | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 3,472.12   | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 15.91      | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 610.58     | OK     |
| file sync    | fsync (32 files)                               | once  | 715.93     | OK     |
| write        | close (32 files)                               | once  | 1.02       | OK     |
| write        | unlink (32 files)                              | once  | 456.81     | OK     |
+--------------+------------------------------------------------+-------+------------+--------+
```

Corpus manifest SHA256: `67fdf87da1a1b94bc1f6482f00b912c1010d512a907846e5747ba9c893d8a3c1`.

### Per-file comparison

Wall time divided by files touched, in **ms/file**. Both workloads touch 10k files;
the second leaves the first 10k present in the same backend.

| Workload | Initially empty | Existing 10k retained |
| --- | ---: | ---: |
| **Untar** | **51.3701** | **52.9947** |
| scandir + stat — first | 1.08662 | 0.62554 |
| scandir + stat — warm | 0.03680 | 0.03681 |
| rg --files — first | 0.21413 | 0.12703 |
| rg --files — warm | 0.00083 | 0.00094 |
| open + fstat + close — first | 6.83909 | 4.99552 |
| open + fstat + close — warm | 0.09510 | 0.07821 |
| stat missing — first | 7.26273 | 7.22246 |
| stat missing — warm | 0.01840 | 0.01887 |
| rg no-match scan — first | 1.72200 | 1.79540 |
| rg no-match scan — warm | 0.01205 | 0.01180 |
| rg rare literal — first | 1.70333 | 1.81243 |
| rg rare literal — warm | 0.01207 | 0.01187 |
| rg branch glob — first | 3.23668 | 2.59745 |
| rg branch glob — warm | 0.02437 | 0.02666 |
| rg depth-10 subtree — first | 3.44360 | 2.87375 |
| rg depth-10 subtree — warm | 0.05176 | 0.05154 |
| open + read + SHA-256 — first | 12.30275 | 11.78961 |
| open + read + SHA-256 — warm | 0.15862 | 0.17193 |
| open + pread tail — first | 12.54426 | 13.56297 |
| open + pread tail — warm | 0.07199 | 0.06215 |
| create + write | 18.20031 | 19.08063 |
| fsync | 21.34688 | 22.37281 |
| close | 0.03031 | 0.03188 |
| unlink | 14.49563 | 14.27531 |

Subset denominators: 256 missing paths/tails, 32 writes/fsyncs/closes/unlinks, 981 branch files,
and 136 deep-subtree files. Other rows use 10,000 files. Untar includes directory/manifest overhead
normalized by the document count.

Untar changed by **+3.16%** with the first corpus retained.
This single comparison does not establish statistical significance.

## FDB latency tuning disabled

A third 10,000-file run removed the three FDB server latency overrides and restarted all twelve
FDB processes across the three hosts. The benchmark client used native latency defaults too.
The API, application optimizations, binaries, workload, memory/cache limits, replication, and durable
commit boundary were unchanged. Full replication health was checked before timing.

| Setting | Current v2 tuning | Defaults run |
| --- | ---: | ---: |
| Client GRV batch timeout | 5 ms | 5 ms |
| Client busy-wait threshold | 100 µs | 0 |
| Server minimum commit batch interval | 10 µs | 1 ms |
| Server idle commit batch interval | 10 µs | 500 µs |
| Server busy-wait threshold | 100 µs | 0 |

The table compares the most recent tuned run with defaults. The tuned run started with **10k**
existing corpus files; the defaults run retained **both corpora (20k)**. Defaults started with
fresh FDB process caches; **VMs, host OS caches, and ES were not restarted**. Subsequent first-read
rows restart only dfs-server/session/mount, as before. This is a single sequential comparison with
those cache/data differences, not an isolated repeated ablation. Automatic role placement also
changed: the GRV proxy moved from zone `b` to `a`; commit proxies moved from `a`/`f` to `b`/`f`.
Storage and log processes remained on all three hosts. The comparison therefore also changes
network paths and cannot assign the complete timing difference to the knobs alone.

| Workload | Tuned (s) | Defaults (s) | Defaults / tuned |
| --- | ---: | ---: | ---: |
| **Untar, 10k files** | **529.947** | **505.715** | **0.95×** |
| scandir + stat — first | 6.255 | 5.491 | 0.88× |
| rg --files — first | 1.270 | 1.155 | 0.91× |
| open + fstat + close — first | 49.955 | 37.803 | 0.76× |
| rg no-match scan — first | 17.954 | 14.708 | 0.82× |
| open + read + SHA-256 — first | 117.896 | 84.903 | 0.72× |
| create + write | 0.611 | 0.545 | 0.89× |
| fsync | 0.716 | 0.709 | 0.99× |
| unlink | 0.457 | 0.420 | 0.92× |

Defaults untar: **50.5715 ms/file**. Remaining client writeback was
0.000175 s after untar and 0.000140 s after
the suite; server shutdown took 0.031 s. There is no extra FDB durability drain.

The defaults run passed all 24 DFS and local-disk checks, including full-corpus hashes. An
independent two-server writer check also passed: 100 writes to one workspace in
0.411 s. Exact original server configs were restored afterward;
all twelve tuned processes recovered healthy replication and one-zone fault tolerance.

After restoration, all three retained workspaces were mounted again: each contained 10,000 corpus
files and matched the first/middle/last expected hashes. Configs, process arguments, cluster status,
comparison context, and controller logs are retained under
`/var/log/dfs-bench/dfs-v2-defaults-20261004`, outside Git. The third run's `existing_files` field
describes its `--backend-from` source (10k); the context records the actual 20k preexisting total.

Untar's population mounts made the same **77,862 RPCs**. Mean complete client RPC latency:

| RPC | Calls | Tuned (ms/call) | Defaults (ms/call) | Change |
| --- | ---: | ---: | ---: | ---: |
| create | 10,102 | 8.942 | 9.512 | +6.38% |
| lookup | 10,205 | 4.598 | 3.304 | -28.13% |
| stat | 27,324 | 4.573 | 3.250 | -28.94% |
| update | 20,204 | 8.473 | 9.095 | +7.34% |
| write | 10,003 | 8.683 | 9.402 | +8.28% |

**Interpretation:** untar was 4.57% faster with defaults (1.55% faster than the first tuned
run), so this comparison does not reproduce the large localhost tuning benefit. It also does not
prove that tuning has no benefit: mutation RPCs were 6–8% slower with defaults, while lookup/stat
RPCs were 28–29% faster. The closer GRV proxy is consistent with faster reads, but was not isolated
experimentally. Read improvements offset slower mutations in the mixed untar workload. A causal
tuning comparison would need repeated runs controlling proxy placement and restart/cache state.
RPC counters include directory/manifest/setup work and can overlap; they are not exclusive FDB
phase timings. The only population RPC errors were the same 10,102 expected missing-name lookups.

### dfs v2 [dust-dev, 10,000 files — FDB latency defaults]

Validated report: `/var/log/dfs-bench/vfs-10k-defaults-1`.

```text
+--------------+------------------------------------------------+-------+-----------+--------+
| Feature      | Workload                                       | Phase | Time (ms) | Result |
+--------------+------------------------------------------------+-------+-----------+--------+
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 5,490.57  | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 355.29    | OK     |
| metadata     | rg --files (10,000 files)                      | first | 1,155.29  | OK     |
| metadata     | rg --files (10,000 files)                      | warm  | 8.59      | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 37,803.01 | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 842.46    | OK     |
| metadata     | stat missing (256 paths)                       | first | 1,254.21  | OK     |
| metadata     | stat missing (256 paths)                       | warm  | 4.90      | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first | 14,707.89 | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  | 119.31    | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first | 12,702.54 | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  | 117.01    | OK     |
| path pruning | rg branch glob (981 candidate files)           | first | 2,039.56  | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  | 24.51     | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first | 345.35    | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  | 7.95      | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 84,902.88 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 1,521.73  | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first | 2,746.36  | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  | 13.93     | OK     |
| write        | create + write (32 x 32 KiB files)             | once  | 545.24    | OK     |
| file sync    | fsync (32 files)                               | once  | 709.15    | OK     |
| write        | close (32 files)                               | once  | 0.99      | OK     |
| write        | unlink (32 files)                              | once  | 420.49    | OK     |
+--------------+------------------------------------------------+-------+-----------+--------+
```

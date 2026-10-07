# Benchmark results — dfs v3 dust-dev

2026-10-06. Networked evaluation of source `0cadffb669` (same runtime code as `f858a9ebb5`).
Both bounds use the unchanged full v3 benchmark and the same 10,000-file corpus as
[localhost](../bench/RESULTS.md#latest-full-suites). Raw reports stay on the workload VM.

## Fixture and method

- Reuse the five existing `dfs-v2-spolu-*` VMs in **dust-dev**. Each is `n2-standard-8`
  (8 vCPU, 32 GiB); no cloud resources are created or deleted.
- FDB 7.3.69: 18 processes across four hosts and three zones (`us-central1-a`, `b`, `f`),
  double replication, three coordinators, native latency settings. Storage/log hosts use local
  NVMe. GRV/commit proxies, master, and resolver are on the preferred `10.84.0.21` node in zone `a`.
- FUSE and dfs-server share the workload VM in zone `a`: their RPC traffic is loopback;
  FDB traffic crosses the VPC. This measures a replicated backend, not a remote FUSE-to-server hop
  or a multi-client load test. Existing Elasticsearch stays idle; v3 does not use it.
- Native x86-64 release build, Rust 1.98.1; Python 3.13.5, ripgrep 14.1.1,
  Linux `7.0.0-1011-gcp`. The local reference uses ARM64 on an M4 Max, so local/GCP ratios
  include CPU, kernel, and host differences as well as network/replication.
- Corpus: 10,000 files, 100 directories, **177,499,149 bytes**, seed 42. Uncompressed untar
  runs 13 directory levels down through `/shared`, with an inherited grant.
- Server: 1 GiB cache, 256 MiB dirty budget, 16 publication workers, 25 ms coalescing.
  Publication and read/authorization age each get half of `D`: 500 ms or 4,000 ms.
  FUSE: eight workers, direct I/O, zero metadata/name TTL, no client cache or kernel writeback.
- Writes and fsync acknowledge server RAM. Untar wall time and remaining FDB publication drain
  are separate. Every first read restarts the server/session/mount; FDB/OS caches remain.
  Warm is one repeat. Profiling is enabled; elapsed counters overlap and must not be added.
- Runs are sequential (1s, then 8s), with isolated fresh prefixes, no overlapping builds/tests,
  and the interactive v2 mount/server paused during timing. Prior corpora are retained.

## Validation and provenance

Release workspace tests against replicated FDB and mounted checks at both bounds passed before
timing, including peer-server visibility. The corpus generator and jd benchmark match localhost
byte-for-byte. No runtime source or FDB tuning changes were made for the GCP run.

Server SHA-256: `c9d7f47d4d2b890478765ec291e293d8a3b6c0fa383a97707576a003f67b098e`.
FUSE SHA-256: `db4990c03bcac756ad5f899161865a45f92dc91392f963c4c5a70a3c171c319c`.
Reports: `/var/log/dfs-bench/v3/full-0cadffb669-20261006/{1000,8000}/run.json` on the workload VM,
with cluster snapshots and supervisor outcome alongside them. Credentials, raw JSON, and logs
remain outside Git. See [README.md](README.md) for the setup and reproduction commands.

## dfs v3 [dust-dev, D = 1s]

All 24 checks passed, including both full-content SHA-256 passes; zero publication failures.
Untar: **107.184s**, followed by **30ms** remaining drain.

```text
+--------------+------------------------------------------------+-------+------------+--------+
| Feature      | Workload                                       | Phase |  Time (ms) | Result |
+--------------+------------------------------------------------+-------+------------+--------+
| population   | untar (10,000 files, 177.5 MB)                 | once  | 107,183.93 | OK     |
| persistence  | remaining FDB drain after untar                | once  |      30.00 | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 118,491.03 | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 120,301.11 | OK     |
| metadata     | rg --files (10,000 files)                      | first |     511.05 | OK     |
| metadata     | rg --files (10,000 files)                      | warm  |     418.23 | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 127,188.49 | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 131,230.68 | OK     |
| metadata     | stat missing (256 paths)                       | first |   2,832.33 | OK     |
| metadata     | stat missing (256 paths)                       | warm  |   2,826.30 | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first |  17,444.65 | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  |  16,846.20 | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first |  17,439.90 | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  |  16,808.28 | OK     |
| path pruning | rg branch glob (981 candidate files)           | first |  14,029.69 | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  |  13,993.96 | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first |   3,515.08 | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  |   3,473.00 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 153,914.00 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 143,319.43 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first |   3,563.87 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  |   3,299.57 | OK     |
| write        | create + write (32 x 32 KiB files)             | once  |     376.65 | OK     |
| file sync    | fsync (32 files)                               | once  |      15.17 | OK     |
| write        | close (32 files)                               | once  |       0.89 | OK     |
| write        | unlink (32 files)                              | once  |     296.88 | OK     |
+--------------+------------------------------------------------+-------+------------+--------+
```

## dfs v3 [dust-dev, D = 8s]

All 24 checks passed, including both full-content SHA-256 passes; zero publication failures.
Untar: **105.170s**, followed by **21ms** remaining drain.

```text
+--------------+------------------------------------------------+-------+------------+--------+
| Feature      | Workload                                       | Phase |  Time (ms) | Result |
+--------------+------------------------------------------------+-------+------------+--------+
| population   | untar (10,000 files, 177.5 MB)                 | once  | 105,169.69 | OK     |
| persistence  | remaining FDB drain after untar                | once  |      21.00 | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | first | 114,657.58 | OK     |
| metadata     | scandir + stat (100 dirs, 10,000 files)        | warm  | 123,445.22 | OK     |
| metadata     | rg --files (10,000 files)                      | first |     610.95 | OK     |
| metadata     | rg --files (10,000 files)                      | warm  |     272.95 | OK     |
| metadata     | open + fstat + close (10,000 files)            | first | 142,587.83 | OK     |
| metadata     | open + fstat + close (10,000 files)            | warm  | 142,256.74 | OK     |
| metadata     | stat missing (256 paths)                       | first |   3,027.01 | OK     |
| metadata     | stat missing (256 paths)                       | warm  |   2,734.27 | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | first |  18,143.45 | OK     |
| page cache   | rg no-match scan (10,000 files, 177.5 MB)      | warm  |  17,703.57 | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | first |  17,493.46 | OK     |
| search       | rg rare literal (10,000 files, 4 matches)      | warm  |  17,343.53 | OK     |
| path pruning | rg branch glob (981 candidate files)           | first |  13,813.72 | OK     |
| path pruning | rg branch glob (981 candidate files)           | warm  |  14,024.94 | OK     |
| path pruning | rg depth-10 subtree (136 files)                | first |   3,474.67 | OK     |
| path pruning | rg depth-10 subtree (136 files)                | warm  |   3,456.72 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | first | 160,750.55 | OK     |
| page cache   | open + read + SHA-256 (10,000 files, 177.5 MB) | warm  | 151,702.10 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | first |   4,105.60 | OK     |
| random I/O   | open + pread tail (256 files x 4 KiB)          | warm  |   3,764.15 | OK     |
| write        | create + write (32 x 32 KiB files)             | once  |     430.33 | OK     |
| file sync    | fsync (32 files)                               | once  |      16.96 | OK     |
| write        | close (32 files)                               | once  |       0.88 | OK     |
| write        | unlink (32 files)                              | once  |     275.58 | OK     |
+--------------+------------------------------------------------+-------+------------+--------+
```

## Where workload time is spent

Seconds below are cumulative instrumented counters. Read rows cover **first + warm** together
plus their small untimed setup; untar includes fixture setup. FUSE/DFS CPU excludes benchmark
and FDB server CPU and is sampled before remaining drain. RPC, handler, get, and commit elapsed
times can overlap or nest, especially during parallel reads/publications: **do not add them**
or subtract them to infer uninstrumented wall time.

| Workload | D | FUSE CPU (s) | DFS CPU (s) | Client RPC elapsed (s) | Handler elapsed (s) | FDB get elapsed (s) | FDB commit elapsed (s) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Untar | 1s | 45.980 | 69.120 | 95.960 | 41.540 | 285.371 | 31.378 |
| Untar | 8s | 48.030 | 73.370 | 92.905 | 35.858 | 259.100 | 32.309 |
| Scandir + stat | 1s | 125.550 | 118.000 | 205.776 | 60.621 | 51.329 | 0.000 |
| Scandir + stat | 8s | 126.730 | 115.570 | 203.565 | 56.410 | 47.677 | 0.000 |
| Open + fstat + close | 1s | 135.080 | 126.360 | 222.199 | 66.254 | 42.233 | 0.000 |
| Open + fstat + close | 8s | 131.930 | 123.030 | 249.776 | 98.019 | 68.676 | 0.000 |
| rg no-match | 1s | 65.180 | 91.710 | 256.128 | 100.756 | 76.602 | 0.000 |
| rg no-match | 8s | 65.930 | 90.330 | 269.199 | 123.919 | 106.757 | 0.000 |
| Open + read + SHA-256 | 1s | 148.860 | 142.280 | 253.980 | 82.597 | 55.131 | 0.000 |
| Open + read + SHA-256 | 8s | 147.370 | 140.790 | 270.455 | 99.626 | 65.284 | 0.000 |

## Local reference

Same corpus, runtime source, workload, and cache settings as the
[latest local suites](../bench/RESULTS.md#latest-full-suites). Times are seconds; read rows
use the first pass. These are single runs on different hardware (local ARM64 M4 Max versus
GCP x86-64 N2), so the difference includes CPU/kernel and replication as well as network.

| Workload | Local 1s | GCP 1s | Local 8s | GCP 8s |
| --- | ---: | ---: | ---: | ---: |
| Untar | 50.662 | 107.184 | 47.788 | 105.170 |
| Scandir + stat | 65.832 | 118.491 | 58.790 | 114.658 |
| Open + fstat + close | 77.030 | 127.188 | 75.446 | 142.588 |
| rg no-match | 7.722 | 17.445 | 7.375 | 18.143 |
| Open + read + SHA-256 | 91.711 | 153.914 | 87.187 | 160.751 |

Untar is 2.12× the local 1s result and 2.20× the local 8s result. Increasing the bound from 1s
to 8s does not consistently improve this GCP run: untar changes by only 1.9%, while several
read workloads are slower. Repeated controlled runs would be needed to attribute those differences.

All 48 filesystem checks passed with zero publication failures. FDB was healthy before timing
and after each suite, with two replicas remaining and one-zone fault tolerance. All 18 process
role placements stayed unchanged. The supervisor restored both previously active v2 interactive
services; `/mnt/dfs` was verified mounted afterward. Prior and new benchmark corpora are retained.

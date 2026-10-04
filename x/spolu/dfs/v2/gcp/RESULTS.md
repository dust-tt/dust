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

## Validation

- `cargo test --workspace`: passed against live FDB and ES, including storage atomicity/recovery,
  independent writers, authorization/ancestry changes, filesystem behavior, search, and transport.
- Release server, workspace benchmark, unchanged CLI/FUSE, and search helper: built successfully.
- Single-host FDB failure tests: **all three passed**. With each host's four FDB processes stopped,
  earlier acknowledged values remained readable and new writes committed. After restarting each
  service, all values remained correct and full replication/one-zone fault tolerance returned before
  testing the next host. This uses a small fixture and service stops, not VM/disk loss or load testing.
- Linux two-mount tests, ES failure injection, and the independent two-process writer benchmark:
  in progress.

The first failure probe preserved acknowledged data and accepted new commits with node `a` stopped.
Its controller then rejected a transitional FDB status response: `data.state.healthy` is absent
while data distribution initializes. The controller now treats that state as pending recovery;
the stopped service was restored before the error propagated.

## Filesystem benchmarks

The equivalent 10,000-file and 100,000-file runs are pending. Both use jd's original timed actions
and validation, including full-corpus SHA-256 checks. The larger corpus retains the same 100
directories/depth and multiplies directory allocations by ten. Kernel caching/writeback and the
1,000,000 live-inode limit are unchanged.

Every first read case restarts dfs-server and creates a new session/mount (ten resets per corpus).
FDB, ES, and host OS caches remain warm; warm rows repeat on the same mount. Native FDB durability is
included in foreground writes, with remaining client writeback measured separately. There is no
post-acknowledgment FDB persistence drain to add. Tests/builds/failure injection do not overlap timed
benchmarks. JSON reports and logs stay on the workload VM under `/var/log/dfs-bench`, outside Git.

This differs from localhost in hardware, CPU architecture, RAM/cache capacity, SSDs, replication,
and network topology. It is not an isolated measurement of network or replication overhead.

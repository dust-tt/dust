# dust-dev FoundationDB experiment

The VMs and network are created manually in `dust-dev`. Setup scripts only install software on the
allowlisted fixture; resource creation scripts are explicitly user-run. Run commands from `x/spolu/dfs`.
Setup findings, validation, and retained-corpus benchmarks are recorded in [RESULTS.md](RESULTS.md).

## Topology

| VM (`dfs-v2-spolu-…`) | Zone | Private IP | Storage |
| --- | --- | --- | --- |
| `fdb-a` | `us-central1-a` | `10.84.0.11` | 50 GB boot + 375 GiB local NVMe |
| `fdb-b` | `us-central1-b` | `10.84.0.12` | 50 GB boot + 375 GiB local NVMe |
| `fdb-f` | `us-central1-f` | `10.84.0.13` | 50 GB boot + 375 GiB local NVMe |
| `workload` | `us-central1-a` | `10.84.0.20` | 200 GB SSD persistent boot disk |

All four use Ubuntu 24.04, `n2-standard-8` (8 vCPU / 32 GiB), no external IP, and no service account.
Zone `f` replaces the original `c`, which lacked capacity. Ubuntu expanded the root filesystems
automatically: about 48 GiB usable on FDB hosts and 193 GiB on the workload host.

The custom `dfs-v2-spolu` VPC has subnet `10.84.0.0/24`, Cloud NAT for package downloads, IAP SSH,
and TCP 4500–4503 between experiment-tagged VMs. ES binds only to the workload host's loopback.
FDB has no application credentials/TLS in this isolated experiment; its private network is the
access boundary. No production data or credentials belong here.

Each FDB host runs four processes under `dfs-fdb.service`:

| Port | Process class | Role |
| --- | --- | --- |
| 4500 | storage | SSD storage |
| 4501 | transaction | Transaction logs |
| 4502 | stateless | Transaction roles; also coordinator |
| 4503 | stateless | Transaction roles |

FDB 7.3.69 uses **double** redundancy, SSD storage, three coordinators, and GCP zone IDs as replication
failure domains. Healthy configuration reports 12 processes, 3 machines/zones, and tolerance of one
zone failure. Acknowledgment retains normal replicated, synchronized log commits. Each process has an
8 GiB memory limit; storage cache is 2 GiB. Client/server latency settings use native FDB defaults:
5 ms client GRV batching, no busy-waiting, and 1 ms / 500 µs minimum/idle commit batching.
The setup installs no server latency overrides.

The workload host runs Elasticsearch 8.15.3 (one node, 2 GiB heap, 4 GiB container limit) and a Linux
development container, reusing `../local/Dockerfile` and the unchanged v1 FUSE/client. Test dfs-server
processes and FUSE mounts run there; FDB requests cross the real VPC to the replicated cluster.
The two-server writer test starts independent dfs-server processes on that same workload VM.

## Installed paths

`setup-fdb.sh` checks the exact metadata project/host/zone/IP, accepts only the expected blank local
SSD or an existing managed filesystem, verifies release SHA256 checksums, and installs the service.
FDB cannot start without the mounted local SSD. It never initializes the database itself.

- FDB: `/etc/dfs-fdb/{fdb.cluster,foundationdb.conf}`, `/var/lib/dfs-fdb`, `/var/log/dfs-fdb`.
- Workload sources: `/opt/dfs`; unchanged jd benchmark: `/benchmark`.
- Rust output: `/target`; ES data: `/var/lib/dfs-es`; generated reports: `/var/log/dfs-bench`.
- The container sees those reports at `/reports`. JSON reports and logs remain outside Git.

The first initialization was run once after all FDB services started:

```sh
v2/gcp/run ssh a fdbcli -C /etc/dfs-fdb/fdb.cluster --timeout 30 --exec 'configure new double ssd'
```

`new` refuses an already configured database. Do not reformat disks or reset volumes to rerun tests.
Local SSDs are ephemeral; replication is configured, but backups and recovery from multiple lost
nodes are not. Elasticsearch is deliberately not replicated in this FDB-focused fixture.

## Operate and validate

### Interactive host mount

The workload VM has a native FUSE mount at `/mnt/dfs`, owned by its SSH user `spolu`:

```sh
gcloud compute ssh dfs-v2-spolu-workload --project=dust-dev \
  --zone=us-central1-a --tunnel-through-iap
cd /mnt/dfs/work/play
```

The first retained 10k corpus is at `/mnt/dfs/work/docs`. Use `work/play` for scratch files;
the mount's top level is virtual and read-only. No Docker shell is needed. Server and mount run as
`dfs-play-server.service` and `dfs-play-mount.service`; the API listens only on `127.0.0.1:18082`.
They survive SSH disconnects but are not enabled at boot.

Sessions expire after one hour. Close open files and leave the mount, then refresh with:

```sh
cd ~
sudo systemctl restart dfs-play-mount
```

Each mount start creates a fresh private session key. The workspace key remains root-only.
Stop both services before a timed benchmark: `sudo systemctl stop dfs-play-mount dfs-play-server`.

### Commands

The `run` helper always uses explicit `--project=dust-dev`, an allowlisted VM, and IAP SSH. It forwards
arguments literally; use an explicit `bash -c` only when shell syntax is needed.

```sh
v2/gcp/run fdb 'status details'
v2/gcp/run ssh a sudo journalctl -u dfs-fdb -n 30 --no-pager
v2/gcp/run ssh workload sudo docker compose -f /opt/dfs/v2/gcp/compose.yaml ps

v2/gcp/run exec cargo test --workspace
v2/gcp/run exec cargo build --release --bins --example workspace_bench
v2/gcp/run exec cargo build --release --manifest-path /dfs/v1/Cargo.toml -p dfs-client -p dfs-fuse --bins --example search_bench
v2/gcp/run exec python3 /dfs/v2/tests/fuse_e2e.py
v2/gcp/run exec python3 /dfs/v2/tests/search_failures.py
v2/gcp/run exec python3 /dfs/v2/bench/workspaces.py --work /reports/workspaces-1
```

To benchmark a separately built server without replacing the interactive server executable, build
with `CARGO_TARGET_DIR=/target/step2` and set
`DFS_BENCH_SERVER_BINARY=/target/step2/release/dfs-server-v2` for tests/benchmarks. Reports hash the
selected executable; explicit test binary arguments take precedence. Client/workload binaries stay
unchanged. If the interactive service remains active, record that background activity in the results.

With no other workloads running, stop all four FDB processes on each host in turn, verify earlier
commits and new writes with that host absent, restart it, and wait for full replication before the
next case:

```sh
python3 v2/gcp/failover.py
```

This stops services, never VMs. A `finally` block attempts restoration on errors/interruption; after
an interrupted controller or lost SSH connection, check `dfs-fdb.service` on all three hosts before
continuing. Test data uses unique keys/prefixes; successful tests remove only their own fixtures.

Run benchmarks sequentially, outside compilation/tests/failure injection:

```sh
v2/gcp/run exec python3 /dfs/v2/bench/vfs.py --keep-fixture --work /reports/vfs-10k-1
v2/gcp/run exec python3 /dfs/v2/bench/vfs.py --keep-fixture --backend-from /reports/vfs-10k-1 --work /reports/vfs-10k-2
v2/gcp/run exec python3 /dfs/v2/bench/search.py --work /reports/search-1
```

The same harness restarts dfs-server/session/mount before each first read case. **FDB, ES, and OS
caches remain warm**. In the historical synchronous runs, FDB durability is included in writes; post-untar client writeback is
reported separately. Record network topology with results: this is neither localhost FDB nor a
production scaling test. Database-shard distribution, load, backups, and replicated ES remain future
work.

`--keep-fixture` keeps the first corpus in FDB/ES; `--backend-from` makes the second populate a separate
workspace in the same application prefix and ES index. It requires retention to protect both corpora.
Reports, local corpora, and private fixture credentials are retained on the VM.
To repeat checks after an interruption without importing again, use `--resume --keep-fixture` with
the original `--work`; prior reports are archived before rerunning checks. Avoid entering the active
benchmark mount during a run: it is repeatedly unmounted. The 100,000-file run is currently deferred;
it remains available with `--files 100000` and a new report directory.

## Compare FDB latency defaults

Native defaults are now the normal configuration. These steps document the comparison against the
previously tuned setup; no config edit/restart is needed when already using defaults.

With benchmarks stopped, save each host's exact `foundationdb.conf`, stop the three FDB services,
remove only `knob-commit_transaction_batch_interval_min`,
`knob-commit_transaction_batch_interval_from_idle`, and `knob-busy_wait_threshold`, then start all
three services. Verify twelve processes, healthy replication, and one-zone fault tolerance before
timing. Retain disks, datasets, memory/cache limits, and ES. Record proxy placement: restarting FDB
can move transaction roles between zones and change network paths.

```sh
v2/gcp/run exec env \
  DFS_FDB_GRV_BATCH_TIMEOUT_SECONDS=0.005 \
  DFS_FDB_CLIENT_BUSY_WAIT_SECONDS=0 \
  DFS_FDB_COMMIT_BATCH_MIN_SECONDS=0.001 \
  DFS_FDB_COMMIT_BATCH_IDLE_SECONDS=0.0005 \
  DFS_FDB_SERVER_BUSY_WAIT_SECONDS=0 \
  python3 /dfs/v2/bench/vfs.py --keep-fixture \
  --backend-from /reports/vfs-10k-1 --work /reports/vfs-10k-defaults-1
```

The first two variables configure the native FDB client. The last three describe server settings
in benchmark reports; they **do not reconfigure the remote FDB processes**. Verify actual process
arguments after changing server configs. Use a new report directory when repeating a run.
For a temporary tuning experiment, restore the saved native-default configs afterward, restart
services, and verify health, including on failure. This restarts FDB processes, not VMs, ES, or
host OS caches. Retained corpora are preserved.

## Preferred transaction node experiment

First benchmark the overlapping-read implementation on the original topology. Resource creation
remains manual; this command creates an idle VM and expands the private FDB firewall, without
installing or starting FDB:

```sh
bash v2/gcp/create-transaction-node.sh --create
```

The additional `dfs-v2-spolu-tx-a` VM uses `us-central1-a`, `10.84.0.21`, `n2-standard-8`, and a
50 GB balanced persistent boot disk. It has no local SSD, external IP, or service account. After
the first benchmark, copy `setup-transaction-node.sh`, `verify-host.sh`, and `fdb.cluster` together
to that VM and run the setup script with sudo. It verifies identity, installs FDB 7.3.69, and joins
the existing cluster without initialization or coordinator changes.

| Transaction-node port | Preferred process class |
| --- | --- |
| 4500 | `grv_proxy` |
| 4501–4503 | `commit_proxy` |
| 4504 | `master` |
| 4505 | `resolution` |

The three existing durable hosts retain storage, logs, coordinators, and generic stateless fallback
processes. The intended layout has 18 FDB processes across four machines in three zones. Process
classes express preferences: record actual recruitment, including proxy counts, before timing.
These preferred classes cannot acquire storage/log roles. Native latency defaults and double
replication remain unchanged; commits still wait for replicated logs across zones.

Verify the new node and complete zone-a loss, restoring services after each case:

```sh
v2/gcp/run ssh tx sudo systemctl status dfs-fdb --no-pager
python3 v2/gcp/failover.py --transaction-node
```

The failure script tests each durable host, the transaction host, and `fdb-a` plus `tx-a` together.
This exercises FDB recovery using service stops; it does not test workload-VM failure or lost disks.
Wait for healthy replication and verify preferred recruitment again before repeating the same 10k
benchmark with the same binaries and `--backend-from` pointing at the retained first run.

Validated on 2026-10-04: all five service-failure cases passed, including committed reads and new
writes during each failure. All 18 processes recovered, with the six preferred roles on `tx-a`,
healthy double replication, one-zone fault tolerance, and the original three coordinators.
Two independent servers then completed 100 verified same-workspace writes in 0.352 s. This tests
recovery correctness; it does not establish recovery latency under load.

## Xattrs project

The server/API remain unchanged. Build the modified FUSE binary separately, preserving the previous
client and server for comparisons. After syncing the source files to `/opt/dfs`:

```sh
v2/gcp/run exec env CARGO_TARGET_DIR=/target/xattrs cargo build --release \
  --manifest-path /dfs/v1/Cargo.toml -p dfs-fuse --bin dfs-fuse
v2/gcp/run exec env DFS_BENCH_FUSE_BINARY=/target/xattrs/release/dfs-fuse \
  DFS_BENCH_SERVER_BINARY=/target/step2/release/dfs-server-v2 \
  python3 /dfs/v2/tests/xattrs.py
v2/gcp/run exec env DFS_BENCH_FUSE_BINARY=/target/xattrs/release/dfs-fuse \
  DFS_BENCH_SERVER_BINARY=/target/step2/release/dfs-server-v2 DFS_XATTR_CACHE_MIB=0 \
  python3 /dfs/v2/tests/xattrs.py
v2/gcp/run exec env DFS_BENCH_FUSE_BINARY=/target/xattrs/release/dfs-fuse \
  DFS_BENCH_SERVER_BINARY=/target/step2/release/dfs-server-v2 \
  python3 /dfs/v2/tests/fuse_e2e.py
```

`DFS_XATTR_CACHE_MIB=0` keeps early namespace filtering but disables caching. The default cache is
16 MiB / 16,384 objects, with the same TTL constant as inode attributes. Fixed-category counters in
mount metrics distinguish `security.capability`, POSIX ACL probes, `user.*`, and other names.

For caller attribution, run a small diagnostic with `bench/untar.py --files 100 --trace-xattrs`
(`strace` must be installed). Pass `--server /target/step2/release/dfs-server-v2` and the selected
FUSE binary environment variable. The trace records tar's xattr syscalls; compare it with mount
counters to distinguish explicit requests from kernel probes. Do not use traced timing as a benchmark.

With other workloads stopped and the preferred topology verified, run the complete 10k suite twice
in order, with identical server/FUSE binaries and fresh work directories:

```sh
v2/gcp/run exec env DFS_BENCH_FUSE_BINARY=/target/xattrs/release/dfs-fuse \
  DFS_BENCH_SERVER_BINARY=/target/step2/release/dfs-server-v2 DFS_XATTR_CACHE_MIB=0 \
  python3 /dfs/v2/bench/vfs.py --keep-fixture \
  --backend-from /reports/vfs-10k-step2-transaction-node --work /reports/vfs-10k-xattrs-filter
v2/gcp/run exec env DFS_BENCH_FUSE_BINARY=/target/xattrs/release/dfs-fuse \
  DFS_BENCH_SERVER_BINARY=/target/step2/release/dfs-server-v2 DFS_XATTR_CACHE_MIB=16 \
  python3 /dfs/v2/bench/vfs.py --keep-fixture \
  --backend-from /reports/vfs-10k-xattrs-filter --work /reports/vfs-10k-xattrs-cache
```

Preserve the old 416.984 s untar and full tables. Report backend/OS caches and retained-data differences,
all validation results, untar/drain timings, and xattr/Stat RPC counts. These runs are pending.

# dust-dev FoundationDB experiment

The VMs and network were created manually in `dust-dev`. These scripts install software on that
fixed fixture; they never create or delete cloud resources. Run commands below from `x/spolu/dfs`.
Setup findings, validation, and both corpus benchmarks are recorded in [RESULTS.md](RESULTS.md).

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
8 GiB memory limit; storage cache is 2 GiB. The current v2 latency knobs are unchanged: default 5 ms
client GRV batching, 100 µs client/server busy waits, and 10 µs minimum/idle commit batching.

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
v2/gcp/run exec python3 /dfs/v2/bench/vfs.py --work /reports/vfs-10k-1
v2/gcp/run exec python3 /dfs/v2/bench/vfs.py --files 100000 --work /reports/vfs-100k-1
v2/gcp/run exec python3 /dfs/v2/bench/search.py --work /reports/search-1
```

The same harness restarts dfs-server/session/mount before each first read case. **FDB, ES, and OS
caches remain warm**. Native FDB durability is included in writes; post-untar client writeback is
reported separately. Record network topology with results: this is neither localhost FDB nor a
production scaling test. Database-shard distribution, load, backups, and replicated ES remain future
work.

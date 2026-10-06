# v4 on the existing dust-dev fixture

Reuse the manually provisioned [v2 nodes](../../v2/gcp/README.md), without changing FDB or cloud
resources. FUSE and dfs-server run together on the workload VM; durable FDB transactions cross the
VPC to the replicated three-zone cluster. Elasticsearch is unused. Measurements and validation
limitations are in [RESULTS.md](RESULTS.md).

Use `v2/gcp/run ssh workload ...` for allowlisted, explicitly scoped SSH. Before host mutations,
source `/opt/dfs/v2/gcp/verify-host.sh` as root to verify GCE identity. Copy only v4 sources to
`/opt/dfs/v4`; preserve v2/v3, existing corpora and their binaries. Builds use `/target/v4`, reports
use `/var/log/dfs-bench/v4`, and the Cargo download cache is shared.

On the verified workload VM:

```sh
sudo docker compose -f /opt/dfs/v4/gcp/compose.yaml up -d --build
sudo docker compose -f /opt/dfs/v4/gcp/compose.yaml exec -T dev cargo build --locked --workspace --release
sudo docker compose -f /opt/dfs/v4/gcp/compose.yaml exec -T dev cargo test --locked --workspace --release
sudo docker compose -f /opt/dfs/v4/gcp/compose.yaml exec -T dev python3 /dfs/v4/tests/mounted.py
```

Finish validation before timing. Record source revision, binary hashes, FDB `status json` and process
configurations. Pause active `dfs-play-mount`, `dfs-play-server`, `dfs-v3-play-mount` and
`dfs-v3-play-server` services during timing, then restore their prior states, including on failure.

```sh
sudo docker compose -f /opt/dfs/v4/gcp/compose.yaml exec -T dev env DFS_PROFILE=1 DFS_BENCH_REVISION=REVISION python3 /dfs/v4/bench/run.py --work /reports/RUN
```

This runs the same deep-subtree 10k untar and jd workloads as localhost. Untar acknowledges client
RAM; remaining client drain waits for durable FDB responses. Fsync waits for its object's commits.
Each first read starts a new server/session/mount, retaining FDB and OS caches. Defaults are a
512 MiB client cache, one-second read validity, 25ms coalescing, 128 in-flight groups, and no kernel
data cache/writeback. Raw logs, JSON, credentials and generated corpora stay on the VM, outside Git.

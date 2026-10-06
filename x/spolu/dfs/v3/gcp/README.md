# v3 on the existing dust-dev fixture

Reuse the manually provisioned [v2 nodes](../../v2/gcp/README.md). No cloud resource creation,
FDB reconfiguration, or Elasticsearch integration. FUSE and dfs-server run together on the
workload VM; FDB reads and publications cross the VPC to the replicated three-zone cluster.

The dedicated container uses `/opt/dfs/v3` sources, `/target/v3` build output, and
`/var/log/dfs-bench/v3` reports on the host. It shares the existing Cargo download cache.
The benchmark generator and jd workloads remain unchanged. Results live in [RESULTS.md](RESULTS.md).

Use the existing allowlisted SSH helper, which specifies `--project=dust-dev` and IAP.
Before changing the workload host, source `/opt/dfs/v2/gcp/verify-host.sh` as root to verify its
GCE metadata identity. Copy the v3 sources without local build output; preserve the v2 tree.

On that verified host:

```sh
sudo docker compose -f /opt/dfs/v3/gcp/compose.yaml up -d --build
sudo docker compose -f /opt/dfs/v3/gcp/compose.yaml exec -T dev cargo build --locked --workspace --release
sudo docker compose -f /opt/dfs/v3/gcp/compose.yaml exec -T dev cargo test --locked --workspace --release
```

Finish validation before timing. Record FDB `status json`, process configurations, source revision,
and binary hashes. Pause any active `dfs-play-mount` and `dfs-play-server` services during timing,
then restore their prior states. Keep existing database/OS caches and all prior corpora.

Run each bound sequentially, with a fresh report directory and the same source revision:

```sh
sudo docker compose -f /opt/dfs/v3/gcp/compose.yaml exec -T dev env DFS_PROFILE=1 MAX_EVENTUAL_CONSISTENCY_DELAY_MS=1000 DFS_BENCH_REVISION=REVISION python3 /dfs/v3/bench/run.py --work /reports/RUN/1000
sudo docker compose -f /opt/dfs/v3/gcp/compose.yaml exec -T dev env DFS_PROFILE=1 MAX_EVENTUAL_CONSISTENCY_DELAY_MS=8000 DFS_BENCH_REVISION=REVISION python3 /dfs/v3/bench/run.py --work /reports/RUN/8000
```

Each first read restarts only the server/session/mount. FDB and OS caches remain. The client uses
direct I/O and zero metadata TTL; writes and fsync acknowledge server RAM. Untar and remaining FDB
publication drain are separate measurements. Preserve raw logs/JSON on the VM, outside Git.

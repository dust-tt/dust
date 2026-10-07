# v3 on the existing dust-dev fixture

Reuse the manually provisioned [v2 nodes](../../v2/gcp/README.md). No cloud resource creation,
FDB reconfiguration, or Elasticsearch integration. FUSE and dfs-server run together on the
workload VM; FDB reads and publications cross the VPC to the replicated three-zone cluster.

The dedicated container uses `/opt/dfs/v3` sources, `/target/v3` build output, and
`/var/log/dfs-bench/v3` reports on the host. It shares the existing Cargo download cache.
The benchmark generator and jd workloads remain unchanged. Results live in [RESULTS.md](RESULTS.md).

## Interactive host mount

The workload VM exposes v3 at `/mnt/dfs-v3`, owned by SSH user `spolu`. It uses the retained
10k-file tenant from the `D = 1000 ms` benchmark, with `owner` and `bench` session grants.

```sh
gcloud compute ssh spolu@dfs-v2-spolu-workload --project=dust-dev \
  --zone=us-central1-a --tunnel-through-iap
cd /mnt/dfs-v3/play
printf 'hello\n' > test.txt
cat test.txt
ls /mnt/dfs-v3/shared
```

`play/` is writable scratch space; the mount's top level is virtual and read-only.
The retained 10k documents are accessible through `~/dfs-v3-corpus`, a host symlink into the mount.
The same uncompressed benchmark archive is available at `/tmp/dfs-v3-corpus-10000.tar`:

```sh
dfs_untar_dir=$(mktemp -d /mnt/dfs-v3/play/untar-XXXXXX)
cd "$dfs_untar_dir"
time tar --no-same-owner -xf /tmp/dfs-v3-corpus-10000.tar
```

The server listens on host loopback `127.0.0.1:18083`, using the replicated FDB cluster and
the default v3 caches. FUSE has eight workers, direct I/O, zero metadata TTL, and no writeback.
Fsync acknowledges server RAM. This mount is separate from the existing v2 `/mnt/dfs`.

The `dfs-v3-play-server` and `dfs-v3-play-mount` systemd services survive SSH disconnects;
they are not enabled at boot. Sessions expire after one hour. Close files and leave the mount
before creating a fresh session and remounting:

```sh
cd ~
sudo systemctl restart dfs-v3-play-mount
sudo systemctl status dfs-v3-play-server dfs-v3-play-mount --no-pager
```

Pinned binaries are under `/opt/dfs-v3-play/bin`. Server/tenant credentials remain root-only in
`/var/lib/dfs-v3-play`; the FUSE process receives only its private session key under `/run/dfs-v3-play`.

## Benchmark setup

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
and binary hashes. Pause any active `dfs-play-mount`, `dfs-play-server`, `dfs-v3-play-mount`, and
`dfs-v3-play-server` services during timing, then restore their prior states. Keep existing
database/OS caches and all prior corpora.

Run each bound sequentially, with a fresh report directory and the same source revision:

```sh
sudo docker compose -f /opt/dfs/v3/gcp/compose.yaml exec -T dev env DFS_PROFILE=1 MAX_EVENTUAL_CONSISTENCY_DELAY_MS=1000 DFS_BENCH_REVISION=REVISION python3 /dfs/v3/bench/run.py --work /reports/RUN/1000
sudo docker compose -f /opt/dfs/v3/gcp/compose.yaml exec -T dev env DFS_PROFILE=1 MAX_EVENTUAL_CONSISTENCY_DELAY_MS=8000 DFS_BENCH_REVISION=REVISION python3 /dfs/v3/bench/run.py --work /reports/RUN/8000
```

Each first read restarts only the server/session/mount. FDB and OS caches remain. The client uses
direct I/O and zero metadata TTL; writes and fsync acknowledge server RAM. Untar and remaining FDB
publication drain are separate measurements. Preserve raw logs/JSON on the VM, outside Git.

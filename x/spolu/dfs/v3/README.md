# dfs:// v3

[Design](DESIGN.md), [implementation plan](PLAN.md), and [local measurements](bench/RESULTS.md).
Linux FUSE and FoundationDB run in isolated Docker containers, without Elasticsearch.
The [GCP fixture](gcp/README.md) reuses the existing dust-dev nodes for networked measurements.

From the dfs directory:

```sh
v3/local/run up
v3/local/run exec cargo build --workspace --release
v3/local/run exec cargo test --workspace
v3/local/run exec python3 /dfs/v3/tests/mounted.py
v3/local/run exec python3 /dfs/v3/local/mount.py
```

The last command keeps a server and mount running. In another terminal:

```sh
v3/local/run exec bash
mkdir /tmp/dfs-v3-demo/mount/work
echo hello > /tmp/dfs-v3-demo/mount/work/hello.txt
cat /tmp/dfs-v3-demo/mount/work/hello.txt
```

Interrupt the demo to unmount and drain publication. Rerunning it starts a cold server on the same
local fixture; a new session is created automatically. Credentials stay in private files under
`/tmp/dfs-v3-demo` inside the development container. Only session credentials go to FUSE.
`dfs` accepts JSON on stdin; `dfs --help` lists the tenant/session/grant and filesystem commands.

```sh
v3/local/run exec python3 /dfs/v3/bench/run.py
# Optional denser corpus with the same 100-directory topology:
v3/local/run exec python3 /dfs/v3/bench/run.py --files 100000
v3/local/run exec cargo clippy --workspace --all-targets -- -D warnings
v3/local/run stop
```

Benchmarks retain isolated FDB prefixes and reports under `/tmp/dfs-v3-benchmark-*`, outside Git.
Each cold case restarts the server/session/mount; FDB and OS caches remain. Untar runs 13 directory
levels down, through `/shared`, with inherited grants. Remaining FDB publication is timed separately.
Set `DFS_PROFILE=1` on the benchmark command for aggregate server RPC, cache, and FDB timings;
`--untar-only` stops after population and drain. Reports also sample server/client CPU before shutdown.
Nested and concurrent phase timings overlap and must not be summed as elapsed wall time.

Defaults: FDB 7.3.69 with native tuning; `MAX_EVENTUAL_CONSISTENCY_DELAY_MS=1000`, split equally
between publication and read-cache age; 25 ms coalescing; `DFS_CACHE_MIB=1024`, `DFS_DIRTY_MIB=256`,
`DFS_PERSIST_CONCURRENCY=16`. FUSE uses eight workers, direct I/O, zero entry/attribute TTLs, and no
writeback or userspace content/xattr/page cache. `fsync` acknowledges RAM, not durable storage.

The local database has its own persistent Docker volume. Stopping preserves it. The development
container has `/dev/fuse` and exposes port 18083 on host loopback if a server is explicitly bound to
`0.0.0.0:8080`. Build outputs and Cargo downloads stay in Docker volumes. The demo chooses a private
container loopback port; it is not exposed on the host.

# dfs:// v2 development

The local server serves the filesystem and keyword search through shared FoundationDB and
Elasticsearch; see [benchmark results](bench/RESULTS.md) and [PLAN.md](PLAN.md) for future work.
The v1 protocol/client/FUSE sources remain unchanged. Start with local Docker; no GCS credentials.

From `v2/`:

```sh
local/run up
local/run exec cargo test --workspace
python3 local/smoke.py
local/run logs
local/run stop
```

`up` initializes only a new FDB database, preserves existing data, builds the Rust development image,
and waits for readiness. `smoke.py` writes isolated fixtures, **restarts both databases**, verifies
durability/search visibility, and removes its fixtures. Run it without an active filesystem workload.
`stop` keeps all volumes. `local/run exec COMMAND ...` runs commands in the Linux development container.

Pinned versions: Rust 1.98.1, FDB server/native client 7.3.69, Rust binding 0.11.0, ES 8.15.3.
The images support native Linux ARM64 on this Mac. FDB uses single-node SSD storage; ES uses one
primary and no replicas for application/test indexes. Defaults: 3 GiB container memory each, with
1 GiB ES heap. Configure `DFS_V2_FDB_MEMORY`, `DFS_V2_ES_MEMORY`, and `DFS_V2_ES_JAVA_OPTS` before `up`.

The development container reads FDB's cluster file from a shared volume and connects over the private
Compose network, independently of database restarts. ES is reachable as `http://es:9200`.
Host ports are loopback-only:
`18082` for dfs-server and `19202` for ES (`DFS_V2_PORT` / `DFS_V2_ES_PORT`). FDB has no
published host port. FUSE runs in this Linux container with `/dev/fuse`; macFUSE remains out of scope.

FDB data, ES data, Cargo downloads, and Linux build output use separate Compose volumes. Test FDB
prefixes and ES indexes are unique; tests never clear the whole cluster. Resetting database volumes
is a separate destructive action and is not part of normal startup or benchmarks.

Build/run the server inside the development container:

```sh
local/run exec cargo build --release
local/run exec python3 -c 'import os,secrets; f=os.open("/tmp/dfs-server.key",os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600); os.write(f,secrets.token_hex(32).encode()); os.close(f)'
local/run exec /target/release/dfs-server-v2 --listen 0.0.0.0:8080 --allow-insecure --server-key-file /tmp/dfs-server.key
```

The compose environment supplies `DFS_FDB_CLUSTER_FILE`, `DFS_FDB_PREFIX`, `DFS_ES_URL`, and
`DFS_ES_INDEX`. Use the unchanged v1 `dfs` CLI and `dfs-fuse` against this gRPC endpoint.
The server creates its ES index lazily; an ES outage retains indexing work in FDB and leaves
filesystem operations available. All acknowledged writes have already committed to FDB.

Run Linux mount coverage after building the unchanged client:

```sh
local/run exec cargo build --release --manifest-path /dfs/v1/Cargo.toml -p dfs-client -p dfs-fuse --bins --example search_bench
local/run exec python3 /dfs/v2/tests/fuse_e2e.py
```

This runs v1's two-mount workload, checks duplicate main-tree/shared aliases, then kills and restarts
dfs-server to verify durable file recovery and session loss. Successful runs clean their own fixtures.

Inject transport failures around the real ES node (no database mocks):

```sh
local/run exec python3 /dfs/v2/tests/search_failures.py
python3 local/restarts.py
```

`restarts.py` restarts both local databases during writes while keeping dfs-server alive, verifies
acknowledged metadata/content and search recovery, and cleans its own fixture. Run it without any
other workload using these databases.

Run benchmarks sequentially, with no tests or other workloads running:

```sh
local/run exec python3 /dfs/v2/bench/search.py
local/run exec python3 /dfs/v2/bench/vfs.py
local/run exec cargo build --release --example workspace_bench
local/run exec python3 /dfs/v2/bench/workspaces.py
```

All print the report directory. The search runner reuses v1's Rust population/query helper and all
eight query cases. The filesystem runner imports jd's unmodified benchmark and validates its fixed
manifest; it restarts dfs-server and remounts before each `first` read case. FDB, ES, and OS caches
stay warm across these restarts. Native FDB commit durability is included in foreground writes.
The small workspace runner checks shared-list pagination at 1/2/512 grants, search isolation, and
two concurrent writers alongside 16 idle workspaces. It enables debug FDB commit timing logs.

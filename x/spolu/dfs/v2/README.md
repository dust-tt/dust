# dfs:// v2 development

The server is being ported to FoundationDB and Elasticsearch; see [PLAN.md](PLAN.md).
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

The development container shares FDB's network namespace, so the cluster file's `127.0.0.1:4500`
address remains valid. ES is reachable there as `http://es:9200`. Host ports are loopback-only:
`18082` for the upcoming dfs-server and `19202` for ES (`DFS_V2_PORT` / `DFS_V2_ES_PORT`). FDB has no
published host port. FUSE runs in this Linux container with `/dev/fuse`; macFUSE remains out of scope.

FDB data, ES data, Cargo downloads, and Linux build output use separate Compose volumes. Test FDB
prefixes and ES indexes are unique; tests never clear the whole cluster. Resetting database volumes
is a separate destructive action and is not part of normal startup or benchmarks.

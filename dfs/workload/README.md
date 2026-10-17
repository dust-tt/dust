# DFS workload checker

A standalone gRPC client that checks a running server against an independent in-memory model.
Each worker creates two directories, then mixes creates, writes, appends, truncation, metadata
updates, moves, removals, and reads. It checks bytes (including sparse gaps and block boundaries),
versions, metadata, lookups, paginated listings, and ReadFiles results.

Every run also checks partial Apply failures, shared aliases and grant revocation, tenant isolation,
session refresh/revocation, concurrent name collisions, concurrent appends, and conflicting moves
that would create a cycle. Workers use separate directories; the fixed concurrency scenarios share
objects deliberately.

From `dfs/`, start a local FDB-backed server:

```sh
export DFS_MASTER_KEY="$(openssl rand -hex 32)"
export FDB_CLUSTER_FILE=/usr/local/etc/foundationdb/fdb.cluster
export DFS_LISTEN=127.0.0.1:50051
cargo run --manifest-path server/Cargo.toml --locked
```

In another terminal with the same `DFS_MASTER_KEY`:

```sh
cargo run --manifest-path workload/Cargo.toml --locked -- \
  --endpoint http://127.0.0.1:50051 --seed 1 --workers 4 --steps 250
```

`DFS_API_URL` can supply the endpoint. `--steps` is per worker. The seed reproduces operation choices
and payloads; UUIDs, timestamps, and concurrent scheduling still vary. A mismatch exits nonzero with
the tenant, seed, worker, step, and operation. A successful run prints `PASS`, checked steps, RPC count,
and elapsed time. This checks correctness, not throughput or crash recovery.

Use a disposable development server. Each run creates unique tenants and cleans up its files,
directories, and sessions on success. Empty tenant records remain because there is no tenant-delete
RPC. Failures retain fixtures for investigation. The client never retries mutations after a transport
error, since a new RPC would have a new idempotency receipt. Session-revocation checks assume one
server; multi-instance authentication caches may retain a revoked session for 30 seconds.

# Deploy DFS + Tantivy

## Build on GCP

- Run builds, tests and benchmarks on Linux in **GCP project `dust-dev`**. Local work is editing, upload preparation, orchestration and evidence review.
- Install Rust 1.96, a C++ compiler, Clang/libclang, CMake, pkg-config, Python 3, ripgrep and FUSE 3. Mount tests need `/dev/fuse`.
- Upload this prototype, including `proto/dfs.proto` and `lexical/openapi.json`. No separate search service is required.

From the prototype directory on the VM:

```sh
cargo build --locked --release --features lexical-search --bins
cargo test --locked --release --features lexical-search
DFS_BIN=target/release bash scripts/smoke.sh
```

## Start the server

Create credentials once; retain them across restarts:

```sh
umask 077
target/release/dfsctl provision --directory runtime/credentials
target/release/dfsd \
  --db runtime/db \
  --credentials runtime/credentials/credentials.json \
  --search-index runtime/tantivy \
  --search-token-file runtime/credentials/admin.token
```

- RPC: `127.0.0.1:7443`. Search HTTP: `127.0.0.1:7447`.
- Remote RPC: set `--listen`, `--tls-cert` and `--tls-key`; clients use `--endpoint https://HOST:7443 --ca CA_FILE`.
- Search binds to loopback. Put a TLS proxy beside it for remote access and forward the caller's `Authorization: Bearer …` header.
- The indexer needs an unscoped administrator token. Search callers use their own tokens.

## Mount and check

In another terminal on the same VM:

```sh
mkdir -p runtime/mount
target/release/dfs-mount \
  --token-file runtime/credentials/admin.token \
  --mountpoint runtime/mount
```

- Read and write files under `runtime/mount/files`.
- Check RPC with `target/release/dfsctl --token-file runtime/credentials/admin.token metrics`.
- Check authenticated `GET /lexical/status` for source/index progress; [search requests](lexical/README.md) document filename and body queries.
- Unmount with `fusermount3 -u runtime/mount`; stop the server with SIGTERM.

## Storage, restart and Kubernetes

- One `dfsd` owns one RocksDB directory. Keep `--db` on persistent storage; mount credentials from a Secret. The Tantivy directory is derived state, but needs writable disk space.
- On restart, RocksDB recovers first. The server gets a new incarnation; clients reconcile and old handles may fail. Tantivy rebuilds its matching generation before search catches up.
- Default mount `fsync` confirms publication. Use `--durable-sync` when it must wait for server WAL persistence. Abrupt machine loss can discard unsynced publications.
- Kubernetes deployment remains to be implemented: one replica per shard, exclusive volume ownership, fencing before takeover, a same-pod search proxy, resource limits and a measured termination grace period. Do not overlap two owners during rollout.
- FUSE clients need `/dev/fuse` and mount permissions; exposing their mounts to other containers also needs explicit mount propagation. Each mount has its own cache and invalidation state.
- Body caches evict; full namespace metadata still consumes RAM. Size memory limits for it. There is no replicated HA, history GC or automated backup yet.
- Existing [server](deploy/dfsd.service) and [mount](deploy/dfs-mount.service) systemd units are templates; the server template needs the two `--search-*` flags above to enable Tantivy.

See [DESIGN.md](DESIGN.md) for implemented behavior and [RESULTS.md](RESULTS.md) for test drivers and recorded evidence. Historical experiment scripts contain campaign-specific VM names and paths.

# DFS + Tantivy prototype

A standalone Rust filesystem service: RocksDB owns filesystem state, tonic serves authenticated RPC, a Linux FUSE client mounts authorized files, and optional embedded Tantivy indexes names and file bodies.

- [Deployment](DEPLOYMENT.md): build, start, mount and restart.
- [Implementation handover](DESIGN.md): current structures, publication, permissions, caches, recovery and limits.
- [Tantivy API and indexing](lexical/README.md), [HTTP schema](lexical/openapi.json).
- [Concurrent operations](design/CONCURRENT_OPERATIONS.md): move/write/rename/delete outcomes and tests.
- [Design investigations](design/index.md): future implementation and Kubernetes/HA work.
- [Server service template](deploy/dfsd.service), [mount service template](deploy/dfs-mount.service), [historical results](RESULTS.md).
- [Cleanup verification](results/prototype-cleanup-verified/README.md): 93 default / 114 search tests, 14 mounted scenario groups, HTTP search and restart/rebuild passed on GCP.

## Build and test

**Run builds, correctness checks and benchmarks on GCP in project `dust-dev`.** Local work is limited to editing, upload preparation, orchestration and reviewing exported evidence. Linux requires Rust, Clang/libclang, CMake, a C++ compiler and FUSE 3 with `/dev/fuse`.

Run from this directory on the GCP VM:

```sh
cargo build --locked --release --features lexical-search --bins
cargo test --locked --release
cargo test --locked --release --features lexical-search
cargo clippy --locked --release --all-targets --features lexical-search -- -D warnings
cargo fmt --all -- --check
DFS_BIN=target/release bash scripts/smoke.sh
```

- `lexical-search` is the only optional Cargo feature. Omitting it builds the filesystem service without Tantivy.
- `proto/dfs.proto` and `build.rs` generate DFS RPC types; both are required.
- `src/search.rs` implements source authorization used by Tantivy. `src/export.rs` supplies durable indexing snapshots. Keep both modules.
- `lexical/openapi.json` is embedded into the server binary. Keep `lexical/` when uploading source; `scripts/sync-cloud.sh` includes it.
- `scripts/server-implementation-check.py` runs the compiler/test/contract checks with source fingerprints on GCP. `scripts/benchmark-local.sh`, despite its name, also runs on GCP and includes the RPC and two-mount race matrices.

## Start DFS with Tantivy

Provision disposable prototype credentials once:

```sh
target/release/dfsctl provision --directory runtime/credentials
```

Start the server:

```sh
target/release/dfsd \
  --db runtime/db \
  --credentials runtime/credentials/credentials.json \
  --search-index runtime/tantivy \
  --search-token-file runtime/credentials/admin.token
```

- RPC defaults to `127.0.0.1:7443`; lexical HTTP defaults to `127.0.0.1:7447`.
- Non-loopback RPC requires `--tls-cert` and `--tls-key`. Lexical HTTP requires loopback; use a TLS proxy for remote access.
- The indexer token must be an unscoped administrator. Queries authenticate with the caller's own DFS token.
- One server owns one source database. The embedded index serves the tenant selected by its indexer credential.

Create a mountpoint, then run the client in another process:

```sh
mkdir -p runtime/mount
target/release/dfs-mount \
  --token-file runtime/credentials/admin.token \
  --mountpoint runtime/mount
```

The tenant root appears under `runtime/mount/files`. The mount defaults to a complete authorized metadata view, no startup body preload, a 4 MiB daemon body cache and kernel-cached read-only access. Writable handles use direct I/O. See `dfs-mount --help` for limits and the experimental kernel-writeback opt-in.

## Publication and recovery

- Successful writes publish atomically. Concurrent content changes use expected versions; namespace mutations check entry tokens. Conflicts fail instead of silently overwriting another client's replacement.
- **Default `fsync` confirms publication and reports errors; it does not wait for server storage persistence.** `--durable-sync` opts the mount into verified receipt-based WAL persistence. `--publication-only-sync` explicitly selects the default.
- Background WAL sync defaults to 100 ms; that timer is not a guaranteed loss bound. Unsynced publications can be lost after a machine failure.
- Timed-out writes retain their identities for resolution. Unknown outcomes stop dependent writes; synchronization does not issue a replacement mutation with a new identity.
- Server restart recovers RocksDB and creates a new incarnation. Clients reconcile; old handles can fail. Tantivy rebuilds against the new source incarnation before exposing a matching index generation.
- Search visibility is asynchronous. `/lexical/status` reports the source/index boundary; successful publication alone does not imply a searchable result.
- Body caches evict under pressure, but authorized namespace and Tantivy metadata still require memory. Full namespace paging, history GC, replicated HA and Kubernetes lifecycle management remain unimplemented.

The [handover](DESIGN.md) gives the exact code paths and failure boundaries. Historical benchmark artifacts describe their recorded snapshots; they are not fresh validation of subsequent edits.

# DFS on FoundationDB

[FoundationDB findings and decisions](docs/FOUNDATIONDB.md) explains database guarantees, layer design, our assumptions and failures, and the tradeoffs for this implementation. It includes an [design assumptions and gaps](docs/FOUNDATIONDB_ASSUMPTIONS.md) and a [complete source ledger](docs/FOUNDATIONDB_SOURCES.md).

[Current clean benchmark](../dfs-bench/docs/RESULTS.md). Previous benchmark runs and timing reports were removed at the user’s request.

The latest implementation adds [authorized content-hash reuse and bounded read batching](../dfs-tikv/docs/CONTENT_HASH_CACHE.md). Earlier measurements below retain their original source identities.

An independent FoundationDB port of [`../dfs-tikv`](../dfs-tikv), preserving its filesystem engine, RPC protocol, live FUSE client, routing, authorization, retained file generations, receipts and incremental Elasticsearch indexing. [Implementation and design comparison](docs/IMPLEMENTATION.md) describes the storage changes and tradeoffs against both sibling implementations. [Source fingerprints](docs/PORT_SOURCE.json) identify the imported baseline.

## Build and run

Build and run on a Linux GCP host with Rust, clang/libclang and the FoundationDB 7.3 client library. FUSE checks additionally require `/dev/fuse` and `fusermount3`. The crate uses bundled FoundationDB API headers; the native shared library is required at link and runtime.

```sh
export FDB_CLIENT_LIB_PATH=/path/to/foundationdb/lib
export LD_LIBRARY_PATH="$FDB_CLIENT_LIB_PATH"
cargo build --locked --release --bins
./target/release/dfsd-fdb \
  --cluster-file /path/to/fdb.cluster \
  --namespace my-deployment \
  --credentials /protected/credentials.json \
  --listen 127.0.0.1:7543 \
  --cache-bytes 67108864
```

Library users must call the re-exported unsafe `dfs_fdb::boot()` once and retain its guard until all database users and async runtimes are dropped; then drop the guard before exiting. The daemon and integration harness enforce this ordering.

Credentials use the same JSON model as TiKV. Non-loopback listeners require `--tls-cert` and `--tls-key`. Multiple frontends use the same namespace and credentials; none owns the namespace. `dfs-mount-fdb` accepts the same endpoint, token-file, CA, mountpoint, content-cache and metrics options as `dfs-mount-tikv`. `dfs-router` retains the same configuration. Search uses `--elasticsearch`, `--index-tokens`, and optional `--search-listen`; its [OpenAPI schema](search/openapi.json) is included.

## Verification

The real-storage tests are ignored by default. Explicitly include them, with Elasticsearch and Linux FUSE available, to test the full port:

```sh
export DFS_FDB_TEST_CLUSTER_FILE=/path/to/fdb.cluster
export DFS_FDB_TEST_ES=http://elasticsearch:9200
cargo fmt --all --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked --tests -- --include-ignored --nocapture --test-threads=1
```

Storage tests include competing independent clients, disjoint commits, point and range conflicts, fixed-version snapshots, ordered pagination, poisoned batches, one-MiB chunking, oversized-publication rejection, corruption detection and explicit snapshot expiry. Inherited tests cover filesystem authority, request deduplication, live descriptors, demand refresh, independent frontend processes, routing failover and indexing recovery. Passing default unit tests alone does not establish those properties.

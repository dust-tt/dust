# TiKV DFS implementation

TiKV uses TxnKV exclusively; RawKV runtime support and its migration executable have been removed. The default clients use one-second metadata/revision/authority validation, immutable content-hash reuse and optimistic version-fenced publication. Readers use local descriptors without per-open/per-close filesystem publications.

## Documentation

- [Decisions through DDIA](DECISIONS.md), [reading map](READING_GUIDE.md), [root boundaries](ROOT_BOUNDARIES.md).
- [Architecture](ARCHITECTURE.md), [FUSE operation sequences](MOUNT_OPERATIONS.md), [consistency](CONSISTENCY.md).
- [Content-hash cache and batching](CONTENT_HASH_CACHE.md), [shared one-second design](../../dfs/design/ONE_SECOND_VIEW.md).
- [Current TxnKV implementation](TXNKV_IMPLEMENTATION.md), [v2 partitioned design](TXNKV_DESIGN.md), [atomicity](TXNKV_ATOMICITY.md).
- [Indexing](INDEXING.md), [search API](SEARCH_API.md), [protocol](PROTOCOL.md), [retention](RETENTION.md).
- [Clean benchmark results](../../dfs-bench/docs/RESULTS.md), [method](../../dfs-bench/docs/METHOD.md), [actual topology](../../dfs-bench/docs/TOPOLOGY.md).

Old benchmark runs, fleets and timing reports were removed at the user's request. Only the clean benchmark is current evidence. A measured single-client workload does not establish multi-writer scaling or failover.

## Code map

| Component | Implementation | Behavior |
|---|---|---|
| Encoding and digests | [objects.rs](../src/objects.rs) | Bounded serialization, digest helpers and storage counters |
| Store interface | [store.rs](../src/store.rs) | TxnKV snapshot/batch types and limits; no backend selector |
| TxnKV publication | [txn_store.rs](../src/txn_store.rs) | Direct records, fixed MVCC timestamp, optimistic point-read dependencies and atomic commit |
| Cache | [cache.rs](../src/cache.rs) | Bounded LRU with resident bytes attributed to tenants |
| Mount cache | [mount_cache.rs](../src/mount_cache.rs), [block_cache.rs](../src/block_cache.rs) | One-second metadata, revision-keyed manifests, content-hashed bytes and bounded read batches |
| File handles | [mount_files.rs](../src/mount_files.rs) | Local session-bound view pins, live generations and expiring authority |
| Publication tracking | [mount_publication.rs](../src/mount_publication.rs) | Bounded ambiguous requests and durability receipts survive descriptor closure |
| FUSE mount | [mount.rs](../src/mount.rs) | Live-descriptor rework, shared validation deadline, direct data path, namespace mutations and bounded directory continuation |
| Identity and handles | [engine.rs](../src/engine.rs) | Shared sessions, current grants, portable handles, logout |
| Filesystem changes | [mutations.rs](../src/engine/mutations.rs) | Atomic namespace/content publication with request outcome and index event |
| File content | [content.rs](../src/engine/content.rs) | Immutable 64 KiB chunks; copy changed chunks; holes and historical versions |
| Metadata views | [views.rs](../src/engine/views.rs) | Authorized bounded snapshots, shared pins, journal deltas |
| RPC | [rpc.rs](../src/rpc.rs) | Shared wire protocol; per-tenant admission; bounded demand calls and snapshot streams |
| Affinity | [router.rs](../src/router.rs) | Actual cache occupancy, load, health, expiring hints, unchanged-request retries |
| Incremental indexing | [search/mod.rs](../src/search/mod.rs) | Bounded journal batches; external document versions; shared UUID-bound checkpoint |
| Index source | [indexing.rs](../src/engine/indexing.rs) | Stable extraction and shared checkpoint |
| Search authority | [engine/search.rs](../src/engine/search.rs) | Stateless bearer authentication; snapshot-bound current permissions |
| Search HTTP | [query.rs](../src/search/query.rs) and [http.rs](../src/search/http.rs) | Elasticsearch pagination, version checks, TLS, bounded requests |
| Index worker | [worker.rs](../src/search/worker.rs) | Can run inside every frontend; resumes shared progress |

The [client, model, and protobuf fingerprints](../proto/compatibility.json) identify the current wire sources. [Watch removal](PROTOCOL.md) is an intentional protocol change for the new demand-refresh mount. The new server has no dependency on the sibling server engine or RocksDB store.

## Running a frontend

On the GCP build host, build the `dfs-tikv` package with Cargo. Supply a JSON array of `Credential` records matching the shared model. Each record includes a token SHA-256, tenant/principal identity, expiry, administrator flag, and optional scope. Token plaintext belongs in a protected client/indexer token file, not the credentials JSON or logs.

```sh
cargo build --locked --release --bins
./target/release/dfsd-tikv \
  --pd 127.0.0.1:2479 \
  --namespace my-deployment \
  --credentials /protected/credentials.json \
  --listen 127.0.0.1:7543 \
  --cache-bytes 67108864
```

For non-loopback listeners, supply `--tls-cert` and `--tls-key`. Multiple frontends must use the same namespace and credential configuration. Frontend startup does not require copying another frontend's local state.

Enable recoverable indexing on any or all frontends with:

```sh
--elasticsearch http://10.128.0.35:9200,http://10.128.0.36:9200,http://10.128.0.37:9200 \
--index-tokens /protected/tenant-admin.token
```

Add `--search-listen 0.0.0.0:7545` to serve the [search API](SEARCH_API.md) over TLS on each frontend. The deployed search endpoint is `https://10.128.0.51:7545`, separate from the filesystem gateway at `https://10.128.0.50:7544`.

Each token must be an unscoped administrator for its tenant. Indexing uses at most 1024 events per pass with bounded materialization and adaptive smaller batches; files larger than 8 MiB or non-text files retain metadata and an explicit content status. The Elasticsearch endpoints shown are private test-cluster addresses, and must remain inaccessible to untrusted clients. ES is an internal projection, not an authorization boundary.

Index progress is independent of file durability. File publication does not wait for Elasticsearch. Ordinary file edits update affected documents; policy changes need no content rewrite. Recreating an index changes its UUID and triggers retained-journal replay. Missing retained events are an error.


## Remaining limits

The v1 journal/state dependency still creates tenant-wide conflicts. Initial/reset metadata views scan the tenant, and safe history/control-state reclamation is unfinished. Direct I/O still pays FUSE callback and copying costs on resident reads. Search is asynchronous derived state. The specified partitioned v2 design is not implemented by the cache change.

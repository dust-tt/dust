# DFS design investigations

[Current clean benchmark](../../dfs-bench/docs/RESULTS.md). Previous benchmark runs and timing reports were removed at the user’s request.

These documents connect the prototype review, database lessons, production uploads workload, HA proposal, and client kernel-cache design. They describe evidence and proposed improvements; they do not imply that the proposed behavior is implemented.

Deployment direction: the leader publishes locally; a separate sidecar asynchronously replicates to independently stored, readable followers. Follower count remains open. etcd coordinates ownership through its built-in Raft. Every peer serves topology; clients choose peers and send requests directly. [HA_DESIGN.md](HA_DESIGN.md) investigates the RocksDB APIs and replay code, multiple shards/volumes and memory ownership, routing/splits, and a Jepsen-informed failure model.

On machine shutdown, heap bitmaps and kernel caches disappear. The target restores durable source state and a verified search checkpoint, then catches up incrementally; lost or invalid projection artifacts trigger a bounded rebuild. This requires new persistence and lineage handling: the current prototype still rejects its old search incarnation on engine restart. See [projection storage and recovery](POSTGRES_LESSONS.md#persistent-search-projections-and-pod-recovery), [pod lifecycle and readiness](HA_DESIGN.md#kubernetes-deployment-and-operator-scope), and [client mount lifecycle](CLIENT_CACHE_DESIGN.md#kubernetes-client-lifecycle).

## Reading guide

| Order | Document | What it covers |
| --- | --- | --- |
| 0 | [One-second metadata and optimistic publication](ONE_SECOND_VIEW.md) | Selected cache contract, turbopuffer analogy, revision fences, durability and comparison gates |
| 1 | [Uploads workload and sizing](UPLOADS_SIZING.md) | GCS measurements, how `front` stores files and application blobs, growth, request mix, and implications for shard and memory sizing |
| 2 | [Database lessons and server memory](POSTGRES_LESSONS.md) | Large-corpus memory evidence, duplicated metadata and bitmap allocation lifetimes, open inefficiencies, PostgreSQL mechanisms, memory ownership, durability, and the integrated implementation campaign |
| 3 | [Server implementation design](SERVER_IMPLEMENTATION_DESIGN.md) | Selected solutions by subsystem: problems, source edit sites, PostgreSQL principles, short Rust sketches, update/recovery algorithms, and acceptance gates |
| 4 | [HA and Kubernetes deployment](HA_DESIGN.md) | Rolling deployments and pod/node failures, Kvrocks replication recipe, etcd ownership, placement/routing diagrams, shard splits, and open decisions |
| 5 | [Client kernel cache and writeback](CLIENT_CACHE_DESIGN.md) | Kernel content residency, daemon prefetch, scoped metadata, invalidation, write conflicts, and synchronization semantics |
| 6 | [Concurrent operations](CONCURRENT_OPERATIONS.md) | Move/write/rename/delete outcomes, path reuse, open handles, permissions, and RPC/two-mount benchmark oracles |

For server implementation, start with [the selected design and delivery gates](SERVER_IMPLEMENTATION_DESIGN.md#delivery-sequence-and-exit-gates). It chooses a RocksDB-backed projection, chunked exact memberships, and a durable redo protocol pairing that projection with Tantivy. The [integrated investigation campaign](POSTGRES_LESSONS.md#integrated-implementation-campaign) retains the broader server/client rationale; the [client implementation checkpoint](CLIENT_CACHE_DESIGN.md#implementation-checkpoint--2026-10-03) records work already completed. For capacity assumptions and missing measurements, see [the uploads experiments](UPLOADS_SIZING.md#measurements-that-should-decide-the-next-prototype).

## Supporting material

- [Prototype README](../README.md), [Clean benchmark](../../dfs-bench/docs/RESULTS.md), and [current implementation handover](../DESIGN.md).
- [Deployment instructions](../DEPLOYMENT.md).
# Acceptance criteria

Correctness and performance are separate obligations. Source tests encode the conditions below; a benchmark pass does not replace failure, authorization or concurrency tests. Current experiment evidence is limited to what [the clean report](../../dfs-bench/docs/RESULTS.md) explicitly records. Old run artifacts were deleted.

| Obligation | Required behavior | Source |
|---|---|---|
| Shared one-second deadline | Start before validation, never extend on hits, reject late stale replies | [Freshness](../src/freshness.rs), [cache](../src/mount_cache.rs) |
| Existing descriptors | Refresh revision/EOF/bytes after expiry; keep original identity through rename/unlink | [Handles](../src/mount_files.rs), [frontend tests](../tests/frontend.rs) |
| Authority | Retained bytes and pins confer no permission; mutations check current policy | [Engine](../src/engine.rs), [tests](../tests/engine.rs) |
| Optimistic writes | Fence original revision; resolve lost replies with the same request identity | [Mutations](../src/engine/mutations.rs), [storage tests](../tests/txn_storage.rs) |
| Immutable reuse | Validate manifests and hashes, bound bytes/batches, revalidate before installation | [Block cache](../src/block_cache.rs), [frontend tests](../tests/frontend.rs) |
| Kernel boundary | Metadata TTL fits the deadline; direct data reads remain reachable; mmap is not live | [Mount](../src/mount.rs), [consistency](CONSISTENCY.md) |
| Incremental views | Apply contiguous deltas atomically; reset on overflow or policy change | [Views](../src/engine/views.rs), [cache](../src/mount_cache.rs) |
| Derived indexes | Checkpoint after acknowledged index writes; filter stale/unauthorized candidates | [Indexing](INDEXING.md), [search tests](../tests/search.rs) |

The cache implementation does not complete garbage collection, scoped initial metadata loading or the partitioned v2 publication design. Three replicated stores do not by themselves prove application availability under node loss.

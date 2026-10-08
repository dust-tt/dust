# Backend direction and the optimistic read path

[Current clean benchmark](../../dfs-bench/docs/RESULTS.md). Previous benchmark runs and timing reports were removed at the user’s request.

TiKV now uses TxnKV exclusively. RawKV's runtime implementation and selector have been removed. All three mounts implement [authorized manifest selection, content-hash reuse and bounded read batching](CONTENT_HASH_CACHE.md). RocksDB's `dfs-mount` remains the one-second default; `dfs-mount-legacy` names the previous Watch/kernel-cache implementation.

## Why remove RawKV

The previous implementation could publish coherently: immutable objects were prepared first, then one atomic tenant-root CAS made them visible together. RawKV's lack of multi-key transactions did not itself make that protocol inconsistent. The application owned the transaction-like publication, recovery and retention rules. The tradeoff was tree path copying, extra storage operations and a shared conflict point.

TxnKV delegates atomic record publication and dependency validation to the database. The current filesystem still updates shared state/journal records, so this removal does not establish same-tenant write scaling. [TxnKV v2](TXNKV_DESIGN.md) specifies the unfinished partitioned journal, guards, quotas and scoped metadata work. Existing RawKV data requires a separately validated offline import; no automatic conversion is provided.

## Why immutable bytes help

Warm cache hits do not reach TiKV. Their cost is dominated by the mount path, FUSE callbacks, synchronization and copying. Cold misses and committed writes still reach storage. One second is a read-staleness bound, not permission to overwrite conflicting writes or acknowledge unpublished mutations. DDIA chapters 5–7 separate replication, partitioning and transactional validation; chapter 9 frames the reader-observation guarantee.
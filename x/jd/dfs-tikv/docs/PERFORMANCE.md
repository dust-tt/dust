# Performance boundaries

The client shares metadata/revision validation for up to one second and reuses immutable content by hash. A warm read can therefore avoid a remote data request while still paying direct-I/O FUSE callbacks and copying. An expired observation must validate again; cache hits cannot extend authority.

A cold client read still fetches manifests and unknown chunks. Batches amortize server contexts across concurrent misses. TiKV point reads within a shared transaction remain serialized by its adapter; FDB uncached immutable-object reads still open separate native transactions. Faster SSDs do not remove those access patterns.

Writes publish before acknowledgement. TiKV/FDB wait for database commits; RocksDB distinguishes publication from its WAL durability barrier. Explicit fsync resolves or confirms retained outcomes. The cache horizon does not defer publication or weaken write-version fences.

TiKV's shared tenant journal/state and FDB's tenant-root publication remain contention boundaries. Multiple frontends and storage replicas do not establish independent same-tenant write scaling. Search consumes derived events asynchronously and adds real read/write work when enabled.

[Clean benchmark results](../../dfs-bench/docs/RESULTS.md) measure all three complete systems on independent SSD fleets. [Method and interpretation](../../dfs-bench/docs/METHOD.md) distinguish cache state, hardware, replication, search and workload scope. Previous timing tables were removed.

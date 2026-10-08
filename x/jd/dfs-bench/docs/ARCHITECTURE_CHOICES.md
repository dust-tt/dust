# Architecture choices behind the comparison

This describes the implementation measured in buffer-11, rather than the partitioned v2 proposal. [Full measurements](FULL_RESULTS.md), [trial history](RESULTS.md), [physical topology](TOPOLOGY.md), and [resource limits](METHOD.md) define the comparison. The design vocabulary follows the first edition of *Designing Data-Intensive Applications*: storage (chapter 3), encoding (4), replication (5), partitioning (6), transactions (7), failure ambiguity (8), consistency (9), and derived views (11).

## What runs where

| System | Authoritative publication | Replication | Search |
|---|---|---|---|
| RocksDB + Tantivy | One frontend validates and publishes an atomic local database batch | One database host; no replicated database availability | Embedded Tantivy on that host |
| FDB + ES | Native FoundationDB transaction over changed records and their dependencies | Three database hosts, triple redundancy | Three separate Elasticsearch hosts |
| TiKV + ES | Native optimistic TxnKV transaction with explicit read dependencies | Three TiKV stores and three PD members across three hosts | Three separate Elasticsearch hosts |

Each measured system has one dedicated client and one active frontend. Distributed backends support shared durable state across frontends, but these trials do not measure concurrent writers or failover. Replication distributes durable copies; it does not make a shared application write dependency disappear. The resource totals differ deliberately: this is a comparison of the requested architectures, not equal total hardware.

## Transactions, roots and contention

RawKV is removed from the active TiKV implementation. The application still specifies *what* must become visible together: file identity, directory entry, current revision, content references, authorization dependencies, accounting, retry result and indexing event. TxnKV and FDB provide the atomic commit and conflict detection across those records. Optimistic concurrency means preparing from a cached version and validating the original dependencies at publication; it does not mean assuming there can never be a conflict. See [TiKV implementation and proposed v2 distinction](../../dfs-tikv/docs/TXNKV_DESIGN.md) and [native FDB layout](../../dfs-fdb/docs/IMPLEMENTATION.md).

We no longer rebuild an immutable tree representing the whole FDB tenant on every mutation. We write affected records. However, ordinary publication still updates a tenant state/journal head. Unrelated changes in that tenant therefore retain a shared transaction dependency. This is a remaining scalability limit, not evidence that TiKV itself has one global writer. The benchmark has one writer, so it cannot quantify that contention.

A namespace root currently supplies identity, traversal and authorization scope. Its role as a shared journal/accounting boundary is an application decision. A mounted subtree restricts visibility; it does not automatically create an independent transaction or journal partition.

For example, `/tenant/repositories/frontend` and `/tenant/repositories/connectors` could be independent ownership partitions if most operations stay within each repository. A rename inside one repository would remain local; moving a file between them would require a cross-partition transaction or an explicitly weaker move protocol. Alternatively, a collection containing independently edited documents could partition bookkeeping by stable file ID while retaining a hierarchical permission tree. Renaming then does not change file ownership. Choosing one partition per mount is unsuitable when two mounts overlap or mounts come and go. [The v2 proposal](../../dfs-tikv/docs/TXNKV_DESIGN.md) describes partitioned records and bookkeeping; those partitions are not claimed as implemented performance results.

## Client cache and one-second visibility

Metadata, selected revision and cached authority share a 500 ms lifetime measured from validation start. An operation with expired metadata refreshes before using it. A local successful write can update the client's overlay, but cannot renew that lifetime or advance the journal cursor past unseen external changes. Deltas refresh changed nodes; initial or reset views still materialize the tenant.

Content chunks are immutable and addressed by hash. The client can retain bytes across metadata refreshes while the validated revision still selects those chunks. Ordinary readers do not publish an open/close transaction for each file. View pins and handle lifetime rules protect access to unlinked content, and current authority remains part of validation. [Cache and FUSE design](../../dfs/design/ONE_SECOND_VIEW.md), [TiKV read/write walkthrough](../../dfs-tikv/docs/MOUNT_OPERATIONS.md).

The default mount uses direct file-data I/O and a bounded userspace content cache. Linux still handles descriptor and VFS mechanics, but its ordinary page cache has no general one-second expiry for file bytes. Relying on that cache alone would let read/pread bypass the revision refresh. mmap is not promised as a live view. There is no server-to-mount Watch or polling invalidation channel in the default path.

## Buffered acceptance versus durable publication

All three mounts coalesce new files, their data and attributes, new directories, and attributes of existing non-root directories. Buffer-11 admits at most 128 node updates and two MiB of payload. Existing-file data writes, oversized-file continuation, root attributes, rename and unlink retain synchronous publication. A single publication is in flight; publication holds the buffer gate, so local work is not fully pipelined with remote commits.

Ordinary writes and close can acknowledge volatile client memory. The worker becomes eligible at 100 ms and checks every 25 ms; capacity, explicit synchronization and relevant validation/namespace boundaries also drain it. Publication has a separate 500 ms budget. With the reader's 500 ms metadata lifetime, this targets one-second visibility under healthy service. It is not an unconditional partition-time guarantee: bytes still isolated in a writer cannot be observed elsewhere. Reports include actual publication age and budget misses.

fsync and graceful unmount resolve ambiguous outcomes, publish accepted changes and wait for durable receipts. Sealed requests keep the same identity and payload on retry; stale versions fail rather than silently overwriting concurrent work. A client crash before synchronization may lose locally acknowledged bytes. This is the acknowledgement tradeoff explicitly approved for these trials. [Protocol, sequence diagram and correctness evidence](WRITE_PATH_REWORK.md).

## Search is a derived view

Committed journal events drive incremental indexing. Workers coalesce up to 1024 events, fetch at most eight documents concurrently within a 64 MiB materialization bound, submit bounded bulks, refresh, then advance a fenced checkpoint. Routine edits do not require rebuilding the whole Elasticsearch index. A new schema/index identity or recovery bootstrap can still require reconstruction.

Search is asynchronous relative to filesystem publication. fsync does not wait for Elasticsearch or Tantivy visibility. The benchmark waits for indexing separately. Search requests still check current authorization and source revision; stale candidates must not be returned as current authorized documents. Literal queries use indexed candidate selection and exact verification. [Indexing design](../../dfs-tikv/docs/INDEXING.md).

Embedded Tantivy avoids the separate ES request and distributed database validation path. ES queries include network, candidate retrieval, current-source checks and optional document text. The observed latency gap is consistent with these paths, but the end-to-end table is not a component-level latency profile.

## What the measurements imply

The synthetic document corpus fits in the 256 MiB content cache. Warm scans consequently exercise mostly cached bytes and FUSE/metadata work; similar warm timings do not establish equal backend read performance. The first no-match scan on a fresh mount exposes remote fetching much more directly, although server/database caches are already warm from ingestion and indexing. “First” is never labeled globally cold.

Unlink still publishes each operation synchronously, explaining why buffering helps creation more than removal. The 32-file fsync workload drains a coalesced dirty batch, while the post-untar 10,001-file synchronization pass mostly confirms work already published. Neither workload means one fresh distributed commit per fsync call. Ratios alone can exaggerate tiny absolute differences in close and indexed no-hit queries; the report includes milliseconds.

The remaining design work is substantive: reduce validated remote reads and synchronous namespace commits; pipeline bounded publication without losing original fences; partition journal/accounting dependencies; avoid whole-tenant bootstrap where mounts are scoped; and implement safe garbage collection. Transactions alone do not solve those access patterns. Git clone and repository searches are measured separately because pack files, lockfile renames, mmap and a working tree larger than the synthetic cache can expose different limits.

The [decision register](../../dfs-tikv/docs/DECISIONS.md) links individual choices to design documents and source. Failed trials and regressions remain in [the measurement history](RESULTS.md).

## Large-file metadata amplification

The current file manifest is a single map from 64 KiB chunk number to content hash. Each synchronous write loads that manifest, changes affected chunks, and saves the complete manifest under a new file revision. Unchanged file bytes are shared, but the growing chunk map is serialized again. Sequential small writes to a large Git pack therefore add metadata work proportional to the current chunk count on each publication. Across growth of the whole file, this can accumulate quadratically in the number of chunks when write size is fixed. This is a per-file structure problem, separate from the tenant journal and from database replication.

The source supports that diagnosis: [TiKV write and manifest path](../../dfs-tikv/src/engine/content.rs), [FDB equivalent](../../dfs-fdb/src/engine/content.rs), and [RocksDB mutations](../../dfs/src/engine.rs). Native record-size/read-dependency limits also bound the representation; support for an `i64` file offset is not proof that arbitrarily large manifests fit. A paged or persistent chunk map and bounded coalescing of writes to already published files are possible follow-ups. They are not implemented or claimed as measured improvements here.

The first full-FUSE Git trial demonstrates this limit concretely: RocksDB reached its 8 GiB retained quota after 64,453 synchronous write RPCs and failed before checkout, despite ample SSD space. [Git results and evidence](GIT_WORKLOAD.md). Buffering many small new files successfully does not establish support for sustained large-file append workloads.

## What repository search adds to the diagnosis

The validated repository contains 15,461 regular files and 316,183,460 bytes, larger than the mount's 256 MiB content cache. Its warm `rg useEffect` scan took 1.250 / 7.606 / 5.598 seconds for RocksDB / FDB / TiKV, versus 2.437 / 175.792 / 168.818 milliseconds for indexed top-ten queries. Ripgrep returns all 509 matching paths; the indexed query returns ten documents and their text. These timings compare different result scopes and must not be presented as equivalent-query speedups. [Complete repository tables](GIT_WORKLOAD.md).

The current distributed search path still performs multiple serial requests. Even a no-hit query reads an authenticated source snapshot, fetches the ES index UUID, opens a point-in-time view, searches, rechecks the UUID and source snapshot, and closes the point-in-time view. That is five ES requests in the healthy no-hit path, plus database reads. A positive query fetches pages of 100 candidates regardless of requested `k`, validates their nodes sequentially, and fetches text with a separate ES query per accepted document. This is an N+1 access pattern, not an inherent transaction requirement. [Query path](../../dfs-tikv/src/search/query.rs), [source validation](../../dfs-tikv/src/engine/search.rs); FDB uses the equivalent path.

Batching candidate metadata reads, sizing the initial page to the requested result count with bounded refill, and retrieving text in a bounded bulk are concrete follow-ups. UUID, policy and revision fences must remain intact. These are source-backed optimization opportunities, not a measured decomposition: the 104–115 ms warm no-hit results show that candidate/text fetches are not the only cost. Component-level profiling is still needed to apportion database, ES, transport and background-index work. These search changes have not been implemented in the published trials.

The repository read counters confirm that remote fetching persists beyond the first scan: across the search phase and final hash audit, mounts received 3.091 / 3.283 / 3.293 GB of chunk data through 164,026 / 158,747 / 172,367 data RPCs. Mean data RPC durations were 0.375 / 3.595 / 2.459 ms. Concurrent-call sums are not wall time. Meanwhile, each mount served 240,557 opens/closes with **zero mutation RPCs**, and only 50 / 263 / 167 metadata delta calls. Reader publication removal and shared metadata validation are working; repeated content fetching remains expensive. [Read counters](GIT_WORKLOAD.md#read-path-evidence).

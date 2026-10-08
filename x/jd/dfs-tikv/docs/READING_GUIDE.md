# DDIA reading map and additional design material

[Current clean benchmark](../../dfs-bench/docs/RESULTS.md). Previous benchmark runs and timing reports were removed at the user’s request.

## Whole-filesystem freshness rework

Read the cache design as bounded staleness and materialized-view maintenance (DDIA chapters 5, 9 and 11), with coherent individual reads (chapter 7). Do not equate a retained immutable byte buffer with permission to keep serving an old file generation. The current implementation rework supersedes indefinite descriptor snapshots. See [the active contract](CONSISTENCY.md) and [acceptance gates](ACCEPTANCE.md).

All chapter numbers refer to Martin Kleppmann's *Designing Data-Intensive Applications*, first edition (2017). See the [publisher's contents](https://www.oreilly.com/library/view/designing-data-intensive/9781491903063/) and [author's site](https://dataintensive.net/). The mappings below are our analysis of this implementation, not an endorsement by the book or a claim that it prescribes these choices.

| DDIA topic | Question in this filesystem | Detailed document |
|---|---|---|
| Ch. 3: storage and retrieval | How do immutable trees, content versions and caches affect read/write work? | [Architecture](ARCHITECTURE.md), [retention](RETENTION.md) |
| Ch. 4: encoding and evolution | Which wire changes require coordinated client/server deployment? | [Protocol](PROTOCOL.md) |
| Ch. 5: replication | Which replicas and failures does the deployed topology cover? | [Host topology](TEST_TOPOLOGY.md) |
| Ch. 6: partitioning | Which unrelated writes share a publication key or hot counter? | [Root boundaries](ROOT_BOUNDARIES.md) |
| Ch. 7: transactions | Which multi-record invariant must an operation preserve? | [TxnKV specification](TXNKV_DESIGN.md), [FUSE operations](MOUNT_OPERATIONS.md) |
| Ch. 8: distributed failure | How is a lost reply distinguished from an aborted mutation? | [Architecture](ARCHITECTURE.md), [operation retries](MOUNT_OPERATIONS.md) |
| Ch. 9: consistency and consensus | What does atomic publication guarantee, and what do cached readers observe? | [Consistency](CONSISTENCY.md), [historical multi-mount checks](MULTI_MOUNT.md) |
| Ch. 11–12: streams and derived data | How do source commits, index lag and replay remain separate? | [Indexing](INDEXING.md), [search API](SEARCH_API.md) |

## Primary design material

| Material | Why read it here | Applicable decisions |
|---|---|---|
| [Turbopuffer architecture](https://turbopuffer.com/docs/architecture) and [guarantees](https://turbopuffer.com/docs/guarantees) | Disposable caches and storage-enforced conditional publication; distinguish its batching interval from our bounded metadata staleness. [Concrete DFS mapping](../../dfs/design/ONE_SECOND_VIEW.md#turbopuffer-as-the-architectural-reference). | D25, D26 |
| [TiKV Multi-Raft architecture](https://tikv.org/deep-dive/scalability/multi-raft/) | Understand Region replication and why a distributed cluster does not eliminate a single application hot key. | D02, D04 |
| [TiKV RawKV CAS](https://tikv.org/docs/5.1/develop/rawkv/cas/) | Historical background for the removed root-CAS design; current TiKV uses transactions. | D01, D05 |
| [TiKV transaction design](https://tikv.github.io/sig-transaction/doc/tikv/index.html) and [pinned Rust transaction client](https://docs.rs/tikv-client/0.4.0/tikv_client/struct.TransactionClient.html) | Examine database-owned commit machinery and the APIs used by the current transactional backend. | D01, D02, D05 |
| [TiKV isolation](https://tikv.org/deep-dive/distributed-transaction/isolation-level/) | Understand write skew under snapshot isolation before designing rename, emptiness and authority guards. | D05, D11, D15 |
| [FoundationDB Record Layer paper](https://www.foundationdb.org/files/record-layer-paper.pdf) | A concrete design for structured, multi-tenant records above a transactional ordered key/value store. Useful comparison for metadata and indexes; its guarantees must not be attributed to TiKV. | D01, D13, D17 |
| [Git objects](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects) and [references](https://git-scm.com/book/en/v2/Git-Internals-Git-References.html) | A concrete example of immutable graphs selected by mutable references. Useful for distinguishing snapshot structure from publication granularity. | D02, D03, D16 |
| [Linux FUSE file operations](https://github.com/torvalds/linux/blob/v7.0/fs/fuse/file.c) and [directory operations](https://github.com/torvalds/linux/blob/v7.0/fs/fuse/readdir.c) | Actual kernel implementation behind buffered reads, direct I/O and directory caching. The tests record the deployed kernel separately. | D07–D10 |

These references explain mechanisms and alternatives. Passing project tests, current source and measured results remain the evidence for what this implementation actually does. Start with [DECISIONS.md](DECISIONS.md) for status and follow each decision's design link before its code/evidence links.

# FUSE operations with TiKV transactions

[Current clean benchmark](../../dfs-bench/docs/RESULTS.md). Previous benchmark runs and timing reports were removed at the user’s request.

The default mount uses a bounded new-file write buffer, local revision overlays, asynchronous content reads and mount-owned receipt tracking. The [cross-backend design](../../dfs/design/ONE_SECOND_VIEW.md) records the turbopuffer reference and the one-second metadata/revision rule. The [clean benchmark](../../dfs-bench/docs/RESULTS.md) records the exact current binaries.

## Buffered create/write/close path

The new default path coalesces newly created files, writes, truncations and attributes into one atomic `PutFiles` publication, bounded to 64 files and one MiB. Ordinary close preserves pending data; fsync and graceful unmount drain and confirm durability. Existing-file edits and namespace operations retain the synchronous sequences below after draining accepted buffered changes. The metadata TTL is 500 ms, and publication age is measured against a separate 500 ms budget.

The [cross-backend sequence diagram and failure boundaries](../../dfs-bench/docs/WRITE_PATH_REWORK.md#bounded-client-publication-buffer) describe this outer client path. For example, extracting 32 small files can perform 32 creates plus writes and attributes locally, then one transaction. If another client creates one of those names first, the batch publishes none of its files and retains the conflict for fsync; it does not overwrite that client's file. Losing the commit reply resends the same sealed request, so the 32-file group cannot be published twice.

The transaction sequences below remain the authoritative publication step; a local buffered acknowledgement precedes that step and is volatile until synchronization succeeds.

## Whole-filesystem freshness rework

The operation sequences describe live descriptors and shared validation. Read and write opens/closes reuse local state within the window; reads and fstat after expiry adopt the current file generation. Rename-over still preserves the original open file identity. Old snapshot behavior is not the active contract. See [the active contract](CONSISTENCY.md) and [acceptance gates](ACCEPTANCE.md).

## Reading these sequences through DDIA

Each mutation sequence has an invariant, a publication point and a retry outcome (ch. 7–9). Content preparation can happen concurrently; TiKV commits related records atomically, while shared tenant state/journal dependencies still make unrelated writes compete. A timeout after that point is an ambiguous result, not proof of abort. Reads use immutable generations plus the separate cache contract; transaction atomicity does not make cached observations globally linearizable.

For create and rename, track directory entries, inode state, authority and request outcomes together. For open/read/close, track the lifetime of an immutable version and the current authority to use it. For fsync, distinguish acknowledged source publication from eventual search indexing (ch. 11). The mutation sequences describe current TxnKV v1 publication. [Smaller roots](ROOT_BOUNDARIES.md) explain alternative conflict boundaries; [partitioned TxnKV transaction sets](TXNKV_DESIGN.md) remain v2 design work.

This describes the current standalone [mount](../src/mount.rs), [file handles](../src/mount_files.rs), and [cache](../src/mount_cache.rs). [Consistency](CONSISTENCY.md) defines the one-second deadline for the whole filesystem view. [Topology](TEST_TOPOLOGY.md) shows the actual GCP hosts.

## Distributed writers and atomic publication

Any frontend can handle any configured tenant. There is no designated writer or frontend owner. TiKV distributes and replicates records, but current filesystem mutations share tenant state/journal dependencies and can conflict even for unrelated files.

[PublicationBatch](../src/store.rs) uses [optimistic TxnKV transactions](../src/txn_store.rs). Metadata, directory entries, immutable manifests/chunks, request outcomes and indexing events commit coherently. Reads within an operation use one MVCC timestamp. The removed RawKV tree and root CAS are no longer the publication mechanism.

```mermaid
sequenceDiagram
    participant M as Mount
    participant F as Any frontend
    participant T as TiKV TxnKV
    M->>F: Mutation with stable request ID and original preconditions
    F->>T: Read records at one transaction timestamp
    F->>F: Validate current authority and preconditions
    F->>T: Register checked dependencies and stage changed records
    F->>T: Commit optimistic transaction
    alt Commit succeeds
        T-->>F: Published
        F-->>M: Outcome and publication receipt
    else Dependency conflict
        F->>T: Obtain fresh snapshot
        F->>F: Revalidate original request
        F-->>M: Retry internally or reject stale preconditions
    else Reply is lost
        M->>F: Retry identical request ID and payload
        F->>T: Resolve recorded outcome
        F-->>M: Original outcome, or explicit ambiguity
    end
```

The earlier “one frontend per namespace” and “full Elasticsearch rebuild” limitations do not describe this implementation. Sessions, view pins, request outcomes and indexing checkpoints are shared in TiKV; ordinary mount descriptors are local. Ordinary edits generate incremental indexing work; an index replacement may require retained-journal replay. See [indexing](INDEXING.md). File publication does not wait for Elasticsearch.

## Lookup, getattr, access and forget

Scenario: client B repeatedly checks for a file that client A is uploading.

Kernel positive/negative entries and attributes share the daemon's validation deadline. A daemon snapshot validated 700 ms ago can grant at most 300 ms more cache lifetime, with a small conservative deduction for kernel timer rounding. Expired validation failure returns an error. A path stat observes current metadata after refresh; `fstat` on an existing descriptor refreshes its current generation, attributes and size after expiry.

```mermaid
sequenceDiagram
    participant A as Application
    participant K as Kernel
    participant M as Mount cache
    participant F as Frontend
    A->>K: lookup / stat / access
    alt Unexpired kernel cache
        K-->>A: Cached result
    else Callback required
        K->>M: lookup / getattr / access
        alt Daemon deadline expired
            M->>F: Changes since shared validation cursor, snapshot on reset
            F-->>M: Authorized coherent metadata
        end
        M-->>K: Result with remaining lifetime only
        K-->>A: Result or refresh error
    end
    K->>M: forget(inode, lookup count)
    M->>M: Release references, reclaim when unreferenced
```

`access` checks effective server policy verbs. Unix mode bits do not replace the policy model. Names must be UTF-8. `forget` is local reference accounting, not a remote delete.

The [fast-path follow-up](../../dfs/design/CACHE_FAST_PATH.md) populates kernel metadata through readdirplus and completes valid resident-data hits synchronously; cache misses and expired validation retain bounded asynchronous handling.

## Open and read

Scenario: B keeps a report open while A rewrites it. B may reuse its validated version within the window; after expiry, another read or fstat on the same descriptor observes the current generation. An append becomes readable without reopening.

```mermaid
sequenceDiagram
    participant A as Application
    participant K as Kernel
    participant M as Mount cache
    participant F as Any frontend
    A->>K: Open file
    K->>M: open
    M->>M: Validate cached authority, create local descriptor using view pin
    M-->>K: Handle, direct FUSE data I/O
    A->>K: read / pread
    K->>M: read(handle, offset, size)
    opt Shared validation expired
        M->>F: Changes since last cursor
        F-->>M: Authorized delta or reset boundary
        M->>M: Install current generation and deadline
    end
    alt Current immutable chunks cached
        M->>M: Reuse bytes with matching generation and EOF
    else Chunks missing
        M->>F: Read selected version using session view pin
        F-->>M: Immutable bytes
    end
    M->>M: Recheck after delayed fetch, reject obsolete generation
    M-->>A: Coherent bytes or error
```

The inode identity remains stable across edits. Version fences belong to selected content and write preconditions, not a permanently frozen read inode. The initial data path uses direct I/O with daemon caching to avoid indefinite kernel-page retention; kernel buffered caching and mapping modes require explicit proof before acceptance. See [the kernel boundary](CONSISTENCY.md).

## Create, write, append and truncate

Scenario: A uploads a report, performs a sparse write, then truncates it. Writers use direct I/O, so there is no deferred kernel writeback buffer. Each acknowledged publication binds its matching size and blocks. A large application write may become several FUSE requests and publications; whole-upload atomicity is not promised. Publish to a temporary name and rename when whole-file visibility matters.

```mermaid
sequenceDiagram
    participant A as Application
    participant K as Kernel
    participant M as Mount writer handle
    participant F as Any frontend
    A->>K: create / open for writing
    K->>M: create or open
    opt Create a new file
        M->>F: Publish Create mutation
        F-->>M: New node
    end
    M->>M: Open local writable handle using session view pin
    opt O_TRUNC
        M->>F: Publish truncate to zero against expected generation
    end
    M-->>K: Stable file inode and DIRECT_IO
    A->>K: write / append / ftruncate
    K->>M: write or setattr(size)
    M->>F: Conditional mutation with stable publication identity
    F-->>M: New coherent generation and receipt
    M->>M: Overlay acknowledged revision if cached base still matches
    Note over M: Keep prior deadline and contiguous journal cursor
    M-->>A: Acknowledged bytes or error
```

Readers and writers refer to the same stable file identity. Writers publish against their selected expected generation; concurrent modification can return ESTALE even inside one second. Refreshing the view supplies a new base, but must not silently replay an ambiguous mutation with a new identity or payload. No writer has priority.

## Setattr

`setattr(size)` publishes truncate, including sparse extension. Mode and mtime changes publish metadata updates. Acknowledged changes advance the writer immediately; other descriptors refresh within the shared bound. Inode identity does not change merely because file content changes.

```mermaid
sequenceDiagram
    participant A as Application
    participant M as Mount
    participant F as Frontend
    A->>M: truncate / chmod / utimens
    M->>M: Resolve writable handle or current path object
    M->>F: Conditional truncate and/or attribute mutation
    F-->>M: Published node and matching metadata
    M->>M: Retire stale path projection, advance own writer if present
    M-->>A: Attributes or explicit error
```

Arbitrary ownership changes, independent atime changes, and attribute flags are unsupported. Noatime is the normal mount setting.

## Mkdir, unlink, rmdir and rename

Scenario: publish a completed temporary report by renaming over the old report. Existing readers of the old target keep its contents; subsequent path opens see the replacement after metadata refresh.

```mermaid
sequenceDiagram
    participant A as Application
    participant M as Mount
    participant F as Frontend
    participant T as TiKV
    A->>M: mkdir / unlink / rmdir / rename
    M->>M: Resolve parent and observed entry tokens
    M->>F: Namespace mutation with source/destination preconditions
    F->>F: Check current policy, kinds, cycles and directory emptiness
    F->>T: Commit namespace records, checked dependencies and events atomically
    T-->>F: Atomic outcome
    F-->>M: Acknowledgement or conflict
    M->>M: Expire local metadata projection
    M-->>A: Result
    Note over M,F: Other mounts refresh on demand, no invalidation stream
```

Ordinary rename and `RENAME_NOREPLACE` are supported. Exchange/whiteout flags are not. An open unlinked file remains readable through its retained shared handle; its link count must refresh after expiry.

## Opendir, readdir and releasedir

Scenario: `ls` spans multiple kernel reads while another client moves the directory or changes its entries.

```mermaid
sequenceDiagram
    participant A as Application
    participant M as Mount
    participant F as Frontend
    A->>M: opendir
    M->>F: Refresh directory projection if required
    F-->>M: Coherent entries, parent and deadline
    M-->>A: Bounded directory handle
    A->>M: readdir(offset)
    alt Snapshot still fresh
        M-->>A: Entries and stable continuation
    else Deadline expired
        M->>F: Validate current directory snapshot
        alt Entries and parent unchanged
            M-->>A: Continue with renewed validation
        else Changed during continuation
            M-->>A: ESTALE, caller must rewind
        end
    end
    A->>M: releasedir
    M->>M: Release retained entries and inode references
```

The mount omits kernel directory-page caching so continuation reaches the daemon. Kernel name/attribute caching remains enabled with bounded TTLs. Directory handles and aggregate snapshot memory have explicit limits.

## Flush, fsync, fsyncdir, release and shutdown

The mount separates deferred-error handling from explicit persistence confirmation:

```mermaid
sequenceDiagram
    participant A as Application
    participant M as Mount
    participant F as Any frontend
    A->>M: flush or fsync(file)
    opt Relevant publication outcome ambiguous
        M->>F: Replay exact original identity and payload
        F-->>M: Recorded outcome and receipt
    end
    M->>M: Validate metadata and authority if expired
    opt Explicit fsync with unconfirmed receipt
        M->>F: PersistThrough(receipt)
        F-->>M: Confirmation or error
        M->>M: Remember confirmed durability separately
    end
    M-->>A: Result
    A->>M: release(file)
    M->>M: Close local descriptor and release inode reference
    Note over M: Mount retains receipts and uncertain outcomes
    A->>M: fsyncdir
    M->>M: Validate directory and resolve relevant uncertain operations
    opt Directory has unconfirmed publication
        M->>F: PersistThrough(receipt)
        F-->>M: Confirmation or error
    end
    M-->>A: Result
```

TxnKV publication acknowledgements precede successful namespace replies. The mount keeps bounded receipt and ambiguous-request tracking at mount scope so close/reopen does not lose an obligation. Flush resolves deferred publication errors; explicit fsync confirms outstanding durability and remembers success. Confirmed receipt state never renews metadata or permission validity. Directory fsync can resolve tracked uncertain mutations affecting that directory; it cannot reconstruct an unrecorded request from another mount.

TiKV confirms already committed transactional receipts; RocksDB additionally needs its local WAL persistence barrier. See [the RocksDB-specific persistence distinction](../../dfs/design/ONE_SECOND_VIEW.md#durability-is-separate).

SIGINT/SIGTERM detaches the mount and joins its request thread and drains admitted asynchronous read replies before shutting down the async runtime. Lazy unmount can wait for open descriptors to close. The benchmark gives the mount 60 seconds to exit before forced termination and records its exit status; close application descriptors before stopping it for graceful teardown.

## Unsupported operations and evidence

`statfs` returns `EOPNOTSUPP`. Hardlinks, symlinks/readlink, xattrs, explicit locking, fallocate, copy-file-range and other optional callbacks are not implemented. This is not a full POSIX compatibility claim.

[Acceptance](ACCEPTANCE.md) links real GCP kernel tests, standalone process tests and rollout/failure evidence. The new daemon cache can avoid network work on repeated reads; the current direct data path still uses FUSE callbacks; [current measurements](../../dfs-bench/docs/RESULTS.md) must retain their stated cache, topology and workload boundaries.

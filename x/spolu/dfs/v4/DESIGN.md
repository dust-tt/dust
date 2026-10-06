# dfs:// v4

**Proposal.** Rust/Linux FUSE with a large userspace cache → batched gRPC → independently writable
Rust servers → shared FoundationDB. Move write coalescing and read caching from the v3 server to
the client. Ordinary mutations acknowledge client RAM; the server acknowledges FDB commits.
No application WAL, server writeback, search, or subscriptions initially.

Preserve [v3's object, tenant, grant, and `/shared` semantics](../v3/DESIGN.md#objects-grants-and-layout),
including stable UUIDs/URIs, 64 KiB sparse blocks, MIME types and binary xattrs on files/directories,
inherited grants, at most 512 session grants, and both grant indexes. `/shared` uses `<name>--<id>`
without suppressing entries accessible through the main tree. No exclusive tenant writer.

## Contracts

- **Object consistency:** metadata, size, blocks, and affected indexes MUST represent one complete
  state in the client overlay and each FDB transaction. Reads MUST NOT mix block revisions or expose
  old tails after truncate/re-extension. Separate calls need not observe the same state.
- **Bounded freshness:** client write buffering and read/authorization caching MUST share one
  `MAX_EVENTUAL_CONSISTENCY_DELAY_MS = 2000` budget. Server processing and network delays are
  excluded. Hits and subsequent writes MUST NOT renew the client budget.
- **Minimal transactions:** independent objects MUST NOT share a write transaction merely because
  they share a tenant, parent, or network request. Namespace operations coordinate their explicit
  participants atomically.
- **Object fsync:** `fsync(objectId)` MUST flush and await a finite prefix of that object's edits,
  across its local handles. It MUST NOT drain unrelated files, a parent queue, or the whole mount.
- **Independent writers:** FDB conflict detection and current transactional authorization remain
  authoritative. No process-local lock, client lease, or tenant affinity provides correctness.
- **Failure:** uncommitted client edits MAY be lost. Deferred errors MUST reach fsync and subsequent
  mutations; failed overlays and expired clean views MUST NOT remain readable indefinitely.

## Freshness budget

Call the client-side bound `D`. It covers content, metadata, xattrs, names, listings, negative results,
moves, and authorization, including existing handles. The server has no write buffer or read cache:
server processing, FDB transactions/retries, and network delays are entirely outside `D`.

| Budget | Initial value |
| --- | ---: |
| Client write buffering before dispatch (`W`) | 1000 ms |
| Client read/authorization cache validity (`C`) | 1000 ms |
| Total client-added delay `W + C <= D` | 2000 ms |

The writing client's 1s buffer and the reading client's 1s cache allow up to 2s of client-added
staleness. Start dispatch after a short **25 ms coalescing window**, earlier on pressure or fsync.
`W` bounds client-controlled coalescing and scheduling, not commit latency.
Measure it from the oldest remaining accepted edit, without resetting it when more edits arrive.
Waiting for an in-flight prerequisite RPC is excluded; dispatch as soon as that prerequisite completes
once the coalescing window has elapsed. Apply backpressure before RAM acknowledgment when capacity
or the client buffering bound cannot be respected.

Read validity starts when the client receives a freshly validated response: expire it after `C`.
Cache hits, later use of prefetched entries, and block fills do not restart that clock. Metadata and
authorization refresh together against current FDB state. An unchanged file revision does not prove
that ancestor grants or parent links are unchanged. Session expiry also caps cached access.

There is no 2s acceptance-to-commit deadline or wall-clock convergence promise: total visibility delay
also includes server and network time. An RPC exceeding `W` or `D` is not itself a freshness failure.
Use independent RPC timeouts for stalled requests; on failure, invalidate affected tentative overlays
and retain deferred errors. A timeout cannot cancel an already submitted commit, whose outcome may
be unknown. Expired clean views refresh or fail; they are not served indefinitely during an outage.
Application-owned buffers are outside this contract.

## Client cache

Use one **1 GiB accounted RAM budget per mount**, configurable. It includes metadata, names, directory
pages, blocks, dirty edits, queued/in-flight payloads, and bookkeeping. Initially cap dirty data at
**256 MiB within that budget**. Also bound entry counts and concurrent requests. Evict clean entries
with LRU; never silently evict acknowledged dirty data. No disk recovery initially.

Cache state belongs to the authenticated tenant/session; aliases and handles share object state by
stable ID. Cached authorization must not cross session/grant sets. Keep:

```text
ObjectView = object ID + server revision + metadata + absolute expiry
Block      = (object ID, server revision, block index) -> bytes or proven hole
Pending    = ordered local edits + local generation + oldest acceptance/dispatch state + deferred error
DirPage    = parent/projection + cursor + entries with full attributes + expiry
```

An immutable base plus ordered local edits provides immediate read-your-local-writes while valid.
Local generations are distinct from committed revisions. Serialize conflicting local edits by object;
unrelated objects proceed concurrently. Late RPC replies must not overwrite newer edits or resurrect
locally removed names. Refresh or rebase an overlay atomically, never independently update its size
and blocks. In-flight dirty state follows the RPC's outcome/timeout, not a client freshness deadline.

### Versions and block retention

Expose an opaque object revision, changed by each committed modification to its content, metadata,
explicit grants, parent/name, or directory membership. A fresh UUID suffices; there is no global
version or client-supplied expected version for writes. Child content changes do not change the
parent's directory revision.

Within validity, serve reads/stats from the cached coherent view. After expiry, refresh metadata and
authorization. If the revision is unchanged, reuse cached blocks without downloading them again;
they may remain resident until eviction. If it changed, discard the previous revision's blocks and
install the new metadata together. Only requested blocks are loaded.

A missing-block read carries the cached revision. The server returns data and size from that revision
or reports that the view changed; the client then refreshes/retries the read as a whole. Never splice
old cached bytes into a response containing new-revision bytes. Bound retries under active writers.
Version checks on reads protect coherent caching; they are not write-conflict rejection.

A successful write may have been applied over another writer's changes. Its new revision must not
automatically promote all old cached blocks to that revision. Initially invalidate old clean blocks
and retain only bytes proven by that committed result; reapply any newer pending edits coherently.

### Paginated directory prefetch

Fetch directory pages containing names, IDs, revisions, and **full attributes**: kind, size, mode,
timestamps, MIME type, and xattrs. This first prefetch is metadata-only; file content remains demand
loaded. Keep both an entry limit and an encoded-byte limit, initially **64 entries / 1 MiB per page**.

On traversal, fetch the needed page and optionally one next page at low priority. A lookup/open may
seed one bounded sibling page. Bound total prefetch concurrency and charge it to the same cache;
never eagerly load an entire directory or recurse into descendants.

Use opaque keyset cursors, not offsets. Each page is one authorized snapshot; pagination does not
promise a snapshot across all pages during concurrent mutation. Cache entries expire `C` after receipt
of their validating response. An unchanged directory revision cannot renew child attributes or grants:
children can change without changing directory membership. Partial pages cannot prove arbitrary name
absence or directory EOF; negative lookups require explicit validation.

Overlay local namespace edits atomically, invalidate affected pages, and keep stable FUSE cookies
separate from page residency. `/shared` follows the same paging/freshness rules without a tenant-wide
revision or subtree grant propagation.

## Writeback and fsync

RAM acceptance records an ordered edit and updates the coherent local view before returning to FUSE.
It requires valid cached authorization or a fresh server check; commit rechecks authority in FDB.
Coalesce adjacent/overlapping writes and metadata changes on the same object, preserving truncate,
append, and namespace ordering. Append chooses the final EOF in the server transaction. Stream large
files through bounded groups; neither side needs to materialize an entire file.

Clients allocate stable IDs for tentative creates; servers validate that those IDs are unused. A
create may absorb its initial content and attributes before dispatch while its group stays within
limits. Independent sibling creates remain independent groups even when sent in one RPC.

**`fsync(objectId)` captures only that object's current pending sequence and immediately dispatches
it, bypassing coalescing.** Await its existing in-flight work and commits through that sequence;
later writes cannot prolong the barrier. A new file's creation is a necessary prerequisite, including
that transaction's parent update, but fsync never flushes the parent's other pending operations.
Other namespace prerequisites are likewise limited to those required by the target edits. Directory
fsync waits its namespace edits, not the contents of unrelated child files.

The barrier includes pending edits through any handle to the same object. A shared network envelope
must not make fsync wait for unrelated group results: return outcomes as individual groups finish.
Success means the target prefix reached FDB, though another writer may subsequently supersede it.
This deliberately strengthens v3's RAM-only fsync because v4 has no server writeback stage.

Ordinary close need not force publication, but queued edits and errors outlive the handle. Surface
known failures on close/flush where possible and on fsync/subsequent mutations. An orderly unmount
drains all pending work; a crash may lose it. Do not automatically replay mutations whose commit
outcome is unknown. A deleted server object returns `ENOENT`; old writes must never recreate it.
If a prerequisite fails, discard its dependent overlays and report their failure too.

## Server transactions

The server validates the session, reads current FDB state, authorizes, applies edits, and commits.
No authoritative RAM overlay or additional read cache. Existing parent-chain hints may batch FDB
reads, but every authority decision is validated in the transaction. Ordinary FDB retries apply
only to known noncommits, respect the independent RPC deadline, and recompute against current state.

| Operation | Objects changed atomically |
| --- | --- |
| File writes, truncate | File |
| Mode/MIME/xattrs | Target file or directory |
| Explicit grants | Target, plus its two grant indexes |
| Create/remove | Parent directory and target |
| Move/rename | Source parent, destination parent, moved object; also replaced target if any |

Deduplicate participants for same-parent moves. Corresponding blocks, directory entries, and grant
indexes belong to the same transaction. Authorization ancestors and namespace/cycle checks may add
tracked reads/conflicts; “minimal objects” constrains mutation coverage, not correctness checks.

A network batch is a bounded collection of independent atomic groups with independent outcomes.
Disjoint groups run concurrently; overlapping operations preserve the required local order.
Do not merge a connected chain of namespace dependencies into one large transaction or hold a
tenant-wide lock. File edits arriving from different clients may overwrite each other; apply ordered
patches to current state rather than trusting a client's stale whole-object metadata.

Cap groups conservatively below FDB limits, initially targeting at most **1 MiB of affected data**
including indexes/conflicts. Split large file writes into complete, independently consistent prefix
commits; never split an atomic namespace operation. Also bound the network envelope by bytes and
group count. [FDB limits](https://apple.github.io/foundationdb/known-limitations.html) apply to the
whole transaction, not just uploaded content.

## gRPC and FUSE

Use a separate `dfs.v4` protocol; retain tenant/session/grant administration and filesystem semantics.

| RPC surface | Purpose |
| --- | --- |
| `Lookup`, `StatMany` | Authorized metadata/revision refresh, including explicit absence. |
| `ListPage` | Bounded full-attribute pages and opaque continuation cursors. |
| `Read` | Bounded blocks with revision validation and consistent size. |
| `MutateBatch` | Independent atomic edit groups; stream each committed result/error with its group ID. |

Group IDs correlate outcomes; they do not imply durable retry deduplication. Mutations return canonical
metadata/revisions. Fsync is a client barrier over target-group commit responses; no separate global
flush endpoint is needed. Recovery can reconnect to any server with a valid/recreated session;
uncertain mutations fail explicitly rather than being silently replayed.

Keep kernel caching disabled: direct I/O, zero attribute/name TTLs, no `KEEP_CACHE`, kernel writeback,
or directory-cache flag. The userspace cache serves FUSE callbacks and owns expiry. Shared writable
`mmap` remains out of scope. [Direct I/O](https://www.kernel.org/doc/html/latest/filesystems/fuse/fuse-io.html)
bypasses the kernel page cache and its readahead.

## Validation

Verify object-only fsync with unrelated writes stalled; create/write/fsync prerequisites; concurrent
writers, moves, unlink, append, and truncate/re-extension; unchanged-revision block reuse; child
attribute changes within cached directory pages; grant revocation and expiry across clients/servers;
client-only buffering/cache timing with slow RPCs; bounded memory/backpressure; deferred errors and
ambiguous commits. Then compare deep untar, Git's small writes, and the existing filesystem suite
with v3, including writeback drain separately.

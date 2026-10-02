# dfs:// v1

Rust server and Linux FUSE client for agent workloads: small files, frequent directory traversal,
mostly uncontended writes, and access concentrated in nearby folders. This proposal replaces the
storage and publication design in [v0](../v0/DESIGN.md).

Initial scope: complete grant authorization and `/shared`, ordinary filesystem operations, direct
SlateDB storage, and a thin gRPC FUSE client. Subscriptions and search are future work.

## Architecture

- One server process owns the shard and serves many isolated Dust workspaces. Each sandbox connects
  to one workspace; Product and FUSE clients use the same operations.
- **SlateDB backed by GCS stores everything:** metadata, indexes, and file blocks of every file size.
- Write directly to SlateDB. Its memtables hold visible pending writes, its caches serve reads, and
  its background tasks persist to GCS. Keep SlateDB's internal WAL enabled.
- No application WAL, overlay, persistence worker, or separate server content cache.
- Successful server write RPCs and `fsync` promise server visibility, not durability. With client
  writeback, `write(2)` may acknowledge only kernel-cached bytes. A server crash may lose a recent
  acknowledged suffix, but must never recover partial operations or inconsistent indexes/content.
- Every restart is cold from GCS. Discard previous local caches, RAM state, and sessions.

## Objects, grants, and sessions

Preserve v0's metadata model: server-generated UUIDv4 object IDs, file/directory kind, parent ID and
entry name, MIME type, binary xattrs, POSIX attributes, and file size. Moves preserve identity.
Replace separate content-version UUIDs with one `u64` object version, initially `1`.
URIs remain `dfs://<uuid>` or `dfs://<decorative-name>--<uuid>`; only the UUID identifies the object.

Workspace creation requires the server API key and returns a workspace key. That key authorizes
grant administration and session creation; a session returns an opaque key bound to one workspace
and at most **512 distinct opaque grants**. Sessions expire, can be closed, and never confer workspace
administration.

Effective grants are the union of explicit grants on an object and its current ancestors. Every
server request checks current session authority and this intersection; matching grants or object IDs
never permit cross-workspace access. Grant prefixes such as `u:` and `g:` have no special meaning.
Grant listing, attachment, and revocation require workspace authority. Update both grant indexes
atomically. Revocation takes effect on subsequent server reads; other matching or inherited grants
can still authorize access. Sessions never attach grants implicitly.

## Root and /shared

The synthetic session root contains authorized immediate workspace-root entries and `/shared`.
Discover shared roots by merging and deduplicating the session's grant-index scans; paginate and
omit objects already reachable through an authorized ancestor or visible workspace-root entry.
The 512-grant cap bounds scan fan-out, not the number of shared objects.

Shared roots use `<basename>--<object-id>`; descendants keep ordinary names. Lookup extracts the ID
and rechecks eligibility and current access. A persisted workspace-root child named `shared` appears
inside synthetic `/shared`. Synthetic parents and entries cannot be mutated; normal descendants can.
Traversal through `..` follows the visible projection without exposing private ancestors. Session
mounts remain deferred.

## SlateDB layout

Keep v0's workspace-prefixed key families and dual grant indexes; add `data`. Encode variable key
components unambiguously, UUIDs as 16 bytes, and numeric suffixes as fixed-width big-endian integers.

| Logical key | Value |
| --- | --- |
| `(workspace, objects, object_id)` | Metadata, size, and object version. |
| `(workspace, children, parent_id, name)` | Child object ID. |
| `(workspace, grants_by_object, object_id, grant)` | Explicit attachment. |
| `(workspace, objects_by_grant, grant, object_id)` | Reverse explicit attachment. |
| `(workspace, data, object_id, block_index)` | Up to 65,536 bytes of file content. |
| `(workspace, workspace)` | Root ID and workspace key hash. |

Update related records atomically. Index only explicit grants; resolve inheritance through current
parents. Metadata reads never fetch content. There are no separate application-managed GCS blobs,
including for large files; SlateDB owns all remote storage files.

## File blocks

Block `i` covers `[i * 65536, (i + 1) * 65536)`. Empty files have no data keys. Missing blocks and
unstored bytes within the logical file size read as zeros; reads stop at EOF.

The API accepts byte offsets and bounded byte payloads. The server patches affected blocks and
updates size, timestamps, and version in one operation. Partial blocks use read/modify/write; full
blocks need no old-content read. Initially cap each write at **1 MiB**; large files stream through
successive requests without buffering the whole file. Append chooses EOF during version validation.

Shrink removes blocks beyond EOF and trims the retained tail atomically with the new size. Extension
returns zeros, including after shrink/re-extension; old bytes must never reappear. Unlink removes
the object, entries, grants, and data keys together. Initial truncation/deletion cost is proportional
to removed blocks; reject operations exceeding 65,536 changed keys or an 8 MiB batch budget before publication.

Only changed blocks are rewritten. A 4 KiB patch can still rewrite a 64 KiB block, and SlateDB adds
WAL/compaction amplification. Measure foreground latency, persistence lag, and total GCS bytes.

## Publication, caching, and durability

1. Bound request memory and take a per-object mutation lock. Namespace and grant changes take a
   workspace topology write gate; independent file edits share its read gate.
2. Authorize and prepare from a SlateDB snapshot while holding those gates through publication.
   Atomic batches alone do not protect a preceding read/version check.
3. Build one `WriteBatch` containing all changed blocks, metadata, indexes, and object versions.
4. Await `db.write(batch)`, then return the new object versions. The complete operation is now
   visible in SlateDB memory.

Use `DurabilityLevel::Memory` for live reads through the owner's shared `Db`, including authorization
and ordered index scans. Read related records from one snapshot. Bounded range reads see one object
version; a long file read can span versions unless the caller requests an expected version.

Use SlateDB's memtables, block cache, and built-in disk cache directly. Configure generous defaults
shared across the entire server, not multiplied by workspace or session:

| Budget | Default | Configuration |
| --- | --- | --- |
| RAM read cache | 1 GiB | `--cache-memory-mib` / `DFS_CACHE_MEMORY_MIB` |
| Disk read cache | 16 GiB | `--cache-disk-gib` / `DFS_CACHE_DISK_GIB` |
| Unflushed writes | 512 MiB | `--max-unflushed-mib` / `DFS_MAX_UNFLUSHED_MIB` |

Set the block-cache capacity explicitly and enable the disk cache with a private per-store directory
under `--cache-dir` / `DFS_CACHE_DIR`. Set `ObjectStoreCacheOptions::max_cache_size_bytes` explicitly,
with `cache_on_flush` and `cache_on_compaction` enabled. Populate the block cache on foreground reads
and scans. Discard disk caches on every restart and leave startup preloading disabled; cold misses
fetch from GCS.

Set `Settings::max_unflushed_bytes` to the write budget; this is a backpressure threshold, separate
from read-cache capacity. Bound RPC buffers and snapshot retention separately. Expose all budgets
through CLI/environment configuration so larger hosts can increase them without code changes.

`db.write(batch).await` publishes atomically in memory without awaiting remote durability. SlateDB
flushes its internal WAL and memtables asynchronously. `WriteHandle::await_durable()` confirms
remote durability for a write; `Db::flush()` explicitly waits for a flush. See the
[write API](https://docs.rs/slatedb/0.17.0/slatedb/struct.Db.html#method.write) and
[cache architecture](https://slatedb.io/docs/design/caching/).

Before `fsync` succeeds, preceding buffered writes must reach the server and outstanding write errors
must be reported. Linux drains writeback before the FUSE fsync callback.
The server rechecks session/object access; successful writes are already visible. `fsync` does not
call `flush()` or `await_durable()`. Workspace creation follows the same RAM acknowledgement rule;
an undurable new workspace/key may therefore disappear on crash.

SlateDB applies write backpressure when unflushed data reaches its configured budget; memory
acknowledgement is not an unconditional latency guarantee. Propagate write failures and stop
mutations on an unrecoverable storage error. An ambiguous submission must not be blindly retried.
Graceful shutdown attempts a bounded drain. Keep SlateDB's internal WAL enabled for recovery of
complete batches from GCS; a crash can lose recent writes but cannot recover half a filesystem
operation. Reads and `fsync` barriers do not create object mutations.

## Version conflicts

Every mutation carries the expected version of each existing object it changes. A successful
operation increments each affected, surviving object's version once; new objects start at 1.
Metadata, grants, and content all share that counter. File-content writes do not bump the parent directory. Namespace edits validate and
bump their affected parents too; unrelated file writes have independent versions.

Authorize before reporting versions. If any expected version differs, reject the entire operation
without publication and return `version_conflict` with current authorized versions. Directory
insertion, rename, and removal also validate entry existence and identity atomically. Recheck current
ancestor grants at publication even when the target object's version is unchanged.

The FUSE client serializes its own mutations per object. Cached file pages retain their base version
across opens; only this client's successful mutations advance it. Read fills request that version.
Conflicts return **`EAGAIN`**; kernel writeback can defer or translate the error to `fsync`/close.
Retain the first writeback error, version conflict, or ambiguous file mutation across all handles and
reject subsequent mutations. Never refresh and replay stale dirty pages. Recovery requires inode
reclamation or remount; reopening alone does not reset the failure. Directory conflicts can refresh
before a later caller-initiated mutation because directories have no dirty file pages.

A timeout has an unknown outcome and returns an I/O error without automatic replay. Atomicity is per
server operation, not per fsync: an error does not roll back earlier successful RPCs. Two edits to
different blocks of the same file can still conflict. No retry receipts or exactly-once protocol.
Restart invalidates sessions; observed session loss stops the mount and requires a fresh mount.

## FUSE and transport

Use native Linux kernel caching, with no userspace content cache or freshness deadline:

- Cache attributes, positive/negative lookups, and directories using long kernel TTLs (the protocol
  requires a finite value: `u32::MAX` seconds). No configurable expiry or periodic refresh.
- `readdirplus` reuses attributes from `List`. Keep one bounded RPC page per open directory.
- Enable page and directory caching with `FOPEN_KEEP_CACHE` on both file and directory opens,
  plus `FUSE_WRITEBACK_CACHE`.
  Buffered `write(2)` can acknowledge client RAM; `fsync` drains writes to server visibility and
  reports deferred errors. Close also reports available write errors; it does not need a separate
  synchronization RPC. Explicit fsync still checks current server authorization. Successful local
  unlink acknowledges Linux's later handle-free timestamp cleanup locally; content writes still fail.
- Share one kernel inode per regular file across aliases. Directory inodes retain visible parents.
  Reuse small metadata/version records across handles; bound inodes and handles. Update or invalidate
  affected local entries and directory caches after namespace mutations. Serialize these changes
  against in-flight lookups/listing; send kernel notifications outside callbacks and locks.
- Permit kernel reads on write-only handles for partial-page writes. The kernel owns append offsets
  and orders truncate against writeback; send positioned writes. Never replay failed queued writes.
- Request 1 MiB read-ahead, capped by the kernel, with asynchronous reads, 32 background requests,
  and eight FUSE workers. `--read-ahead-kib`, `--max-background`, and `--threads` configure these bounds.

Cached data can remain accessible after remote edits, unlink, grant revocation, or session expiry
until an RPC observes it or the cache is discarded. Reopening does not guarantee freshness. Every
server RPC still checks current authorization. Cache misses use the retained base version and may
fail on concurrent edits; they cannot silently mix content versions. No timers, polling, global
revision, subscriptions, or remote invalidation protocol.

**Transport: gRPC with Protobuf over persistent HTTP/2 channels, using Rust `tonic`.** Use unary
metadata and bounded read/write RPCs. Return attributes with directory entries and transfer several
64 KiB blocks per request to avoid a round trip per block. Keep raw bytes binary and disable
automatic mutation retries; successful write RPC acknowledgement means SlateDB memory publication.

RPCs cover workspace/session lifecycle, grant listing/updates, stat/lookup/list, create/mkdir,
rename/unlink/rmdir, read/write/append/truncate, attributes/xattrs, and `fsync`. FUSE handles are local
bookkeeping over stable object IDs; avoid remote handle reservations and upload slots. Product
reads see published agent writes; cached FUSE reads have no bounded freshness guarantee.

gRPC still uses HTTP. Its practical benefits here are typed binary messages and multiplexing,
not a guaranteed speedup over HTTP. Start with standard RPCs instead of a custom TCP
protocol; benchmark request overhead and syscall-to-RPC count before adding another transport.
Authenticate sessions in request metadata, use TLS beyond local development, and bound application
queues as well as transport buffers. See
[gRPC concepts](https://grpc.io/docs/what-is-grpc/core-concepts/) and [tonic](https://docs.rs/tonic/).

## PoC limitations and future work

Use a fresh SlateDB prefix and format marker; migration from v0 is outside this iteration.

One owner per shard; multi-server ownership/fencing, transparent failover, macOS mounts, custom
session mounts, cross-client locks, and full POSIX semantics remain deferred. After successful unlink,
server reads and writes through existing client handles return `ENOENT`; cached bytes may remain
readable. Keep this behavior without server-side handle retention or deferred deletion.
Large truncation/deletion batches need measurement and may need a more scalable format.
Subscriptions, change indexes, search, and retry receipts remain out of scope.

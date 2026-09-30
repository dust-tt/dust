# Synchronous storage

`Storage::workspace()` creates a trusted internal handle. Each `read_view()` captures one SlateDB
snapshot for related lookups and scans. Scans take typed exclusive cursors and a limit of 1–1000.
Object batches fetch at most 1000 IDs, in order, with up to 16 concurrent point reads. Grant
intersection checks at most 512 exact keys with the same concurrency bound, independent of the
number of grants attached to the object. The namespace read service authorizes stat/lookup/list
against current ancestors in one snapshot. Namespace mutations prepare outside publication, lock
touched objects/parents in ID order, then validate the snapshot's workspace sequence under the
publication guard. Stale attempts reauthorize and rebuild; namespace locks release before durability
waits. Separate workspace/request and workspace/file gates serialize each content mutation through
durable completion, without blocking unrelated files on that gate.
Metadata-only updates verify preserved content references without blob I/O. Grant patches atomically
update both grant indexes. Rename/removal use the same path. Grant listing includes its revision
from one snapshot.

Grant discovery merges at most 512 prefixes with 32-ID buffers and 16 concurrent initial scans,
deduplicating before the page limit. Shared rendering filters current access and ancestry, then
appends object IDs to basenames. Shared lookup uses that ID directly, with the same access checks.

Workspace creation atomically persists its root, explicit root grants in both directions, key hash,
and initial change event. An existing workspace namespace is never replaced. Authentication reads
workspace records at remote durability; only the SHA-256 digest of a workspace key is persisted.

`upload_blob` streams content and returns an internal `UploadedBlob` descriptor containing workspace,
object, content version, and measured size. It holds a private origin reference to the exact storage
instance. `commit(MetadataBatch)` accepts these descriptors instead of file bytes, rejects mismatched
scope/origin/references, and verifies existing references without descriptors through blob HEAD.
The caller supplies all related object and child-index mutations; `SetGrant` changes both grant
indexes. Duplicate keys and cross-workspace records are rejected before publication. Upload success
alone never creates metadata, entries, or indexing events.

The shared transfer budget reserves 12 MiB per upload, range read, or incoming write body. Uploads
use one 8 MiB part, one incoming frame of at most
1 MiB, and bounded multipart bookkeeping. At most one part is in flight per upload, with no byte queue.
Defaults are 64 MiB and four active transfers, plus 16 admitted waiters that do not poll their streams.
Configure `--upload-memory-mib` / `DFS_UPLOAD_MEMORY_MIB` and `--upload-concurrency` /
`DFS_UPLOAD_CONCURRENCY`; lower budgets reduce concurrency. This is a transfer-buffer budget, excluding
HTTP/TLS buffers, backend storage itself, SlateDB, and general process overhead. Unknown lengths are
measured while streaming; reject more than 10,000 parts and input idle periods over 30 seconds.

Small and empty files use `PutMode::Create`. The pinned object_store multipart API lacks conditional
completion, so larger files use a fresh `blobs/staging/<workspace hex>/<uuid>` key and a
`CopyMode::Create` copy into the final immutable key. A duplicate version fails without overwriting.
Normally abort failed multipart uploads and remove completed temporary blobs. Cleanup is best effort;
cancellation, ambiguous backend responses, or process death may leave multipart uploads or temporary
objects. Orphan reclamation remains future work and must never delete live/recoverable versions.
Unpublished HTTP upload reservations are session-scoped, expire after 15 minutes, and cap at 1024.
They carry no file bytes. `POST /uploads/commit` reauthorizes and publishes the completed descriptor;
its durable receipt survives expiration/restart and is recoverable by currently authorized sessions.
Successful durable publication or replay immediately releases the reservation's slot. Failed commits
retain the completed upload until expiry so callers can correct preconditions or recover the outcome.

`read_blob_stream` verifies the immutable blob's size/range and holds a transfer reservation until
drain/drop. It clamps to EOF, polls only on consumer demand, and never collects the file. HTTP reads
select the current authorized version; optional expected versions conflict when stale. Old versions
remain retained for already-started reads. Backend failures after headers terminate the stream.

Random writes, append, and truncate reserve the resulting logical file size from a shared scratch
quota before streaming the old version into anonymous disk. Patch bytes stream onto disk, followed
by a fresh streamed blob upload. Defaults: 1 GiB scratch, system temporary directory, 16 admitted file
jobs, 4096 handles globally/256 per session. Configure `DFS_SCRATCH_BYTES`, `DFS_SCRATCH_DIR`, and
`DFS_FILE_MUTATIONS`. Quota/disk exhaustion returns capacity errors. Preparation times out after
15 minutes; scratch disappears on close/process death and is never required for recovery.

Each batch includes a per-workspace change sequence and the sorted, deduplicated IDs of affected
objects/parents. A shared publication lock protects sequence allocation and submission;
blob I/O and the WAL durability wait occur outside it. `commit` returns the sequence only after
`WriteHandle::await_durable()` succeeds. An error after submission may have an ambiguous outcome;
do not blindly retry mutations or delete their blobs. File operations use the receipt protocol below;
metadata-only operations still require rereading revisions/state. Orphan reclamation is deferred.

## File mutation receipts and barriers

An edit's client UUID identifies a workspace-scoped operation. Upload publication uses its upload ID.
The content batch includes an `OperationRecord` containing the object, SHA-256 request fingerprint,
and resulting content version, size, and metadata revision. Fingerprints cover operation arguments
and the streamed body digest, but omit ephemeral sessions/handles/sequences. Retry the same operation
after reopening a handle without duplicating an append; changed arguments/bytes conflict. Creation
attributes are part of the upload-commit fingerprint. Receipts authorize the current object, so
deletion or lost access hides them. They are retained indefinitely until a retry-expiry policy exists.

Handle mutations serialize positive sequence numbers; only the next number or the identical latest
request/sequence is accepted. Failures block advancement until that request succeeds or the handle
is closed. Fsync checks the caller's `through_sequence`, waits behind accepted writes, reports their
failures, and invokes `Db::flush()` to await the visible WAL prefix. Receipt replay/status also flush
before returning success: a memory-visible receipt alone is not proof of remote durability. Null
status does not prove failure, since a request may still be preparing or publishing.

Admitted file jobs retain request/content gates independently of HTTP caller cancellation. Preparation
may time out; metadata submission/durability is never cancelled by that timeout. Graceful shutdown
drains these jobs before closing SlateDB. On crash, batch replay recovers the mutation and its receipt
together or neither; an uploaded orphan cannot publish itself or duplicate a recovered operation.

`ReadView::changes()` additionally uses SlateDB's `DurabilityLevel::Remote`, so pending events never
become search-indexing input. Events identify objects to reconcile against persisted state, including
deletions and directory/grant changes; search consumption and checkpointing arrive in group 12.
Event sequences are local to a workspace and are distinct from object metadata revisions.

## Format v1

The database-level `dfs-format` key contains ASCII `1`. Unknown formats and unmarked nonempty
databases fail opening; empty databases receive a durable marker. Only one metadata layout is
supported during early development. Incompatible layout changes require a fresh store; there are
no migrations or compatibility decoders.

Workspace keys start with byte `01`, a big-endian `u32` UTF-8 byte length, the exact workspace bytes,
and a one-byte family tag. IDs below are raw 16-byte UUIDs; names and grants preserve exact UTF-8.

| Tag | Family | Suffix after the workspace prefix and tag | Value before encoding |
| --- | --- | --- | --- |
| `01` | Objects | Object ID | `ObjectRecord` |
| `02` | Children | Parent ID, name bytes | Child ID |
| `03` | Grants by object | Object ID, grant bytes | Unit |
| `04` | Objects by grant | Grant byte length (`u32` big-endian), grant bytes, object ID | Unit |
| `05` | Changes | Sequence (`u64` big-endian) | Array of affected IDs |
| `06` | Change sequence | Empty | Last sequence (`u64`) |
| `07` | Workspace | Empty | Root ID (`[u8; 16]`), key hash (`[u8; 32]`) |
| `08` | Operations | Request ID | `OperationRecord` |

Length prefixes keep workspaces and grants distinct even with slashes, NUL, Unicode, or shared
prefixes. Names/grants at the end of a key need no length delimiter. Fixed-width big-endian change
sequences preserve scan order.

Each value starts with version byte `01`, followed by
[Postcard](https://docs.rs/postcard/1.1.3/postcard/) encoding. `ObjectRecord` stores workspace, ID,
optional parent/name, kind/content reference, MIME type, xattrs, metadata revision, and POSIX
attributes in that order. POSIX attributes are mode (`u16`), atime, mtime, ctime; each time is signed
seconds (`i64`) then nanoseconds (`u32`). UUIDs occupy 16 bytes; xattr values remain binary.
Decoding checks the version, complete consumption, validated names/MIME/xattr keys, object-key
identity, permission bits, and nanosecond bounds. All fields are required; no legacy defaults apply.
HTTP representations are independent.
`OperationRecord` encodes object ID (16 bytes), request fingerprint (32 bytes), content version
(16 bytes), size (`u64`), and metadata revision (`u64`), in that order with the same value envelope.

SlateDB files live under `<prefix>/metadata/`. Content lives at
`<prefix>/blobs/v1/<hex UTF-8 workspace>/<object UUID>/<content UUID>`, with UUIDs formatted as
32 lowercase hex characters. The workspace encoding cannot introduce path components. Every file,
including an empty file, has a separate immutable blob; file bytes never enter metadata records.

## Durability evidence

The pinned SlateDB 0.17 implementation gives all rows in a `WriteBatch` one sequence number and
documents all-or-none batch replay in its WAL contract. `Db::write` publishes in memory;
`WriteHandle::await_durable` waits for persistence. See
[batch writes](https://docs.rs/slatedb/0.17.0/slatedb/struct.Db.html#method.write) and the
[WAL contract](https://docs.rs/slatedb/0.17.0/src/slatedb/wal/mod.rs.html).

Tests use real SlateDB with memory, filesystem, and opt-in GCS backends. They cover scope/prefix
isolation, snapshots across atomic moves/grant changes, malformed formats, failed uploads, and
withheld WAL flushing. Closing before durability produces an error and recovers no partial batch.
A subprocess test kills the writer after commit acknowledgement and verifies metadata, indexes,
events, and content from a fresh reader process; the GCS variant requires no surviving local data.
The broader failure/interruption matrix remains in group 8.

Streaming tests exercise an 80 MiB file with a 12 MiB upload budget, shared admission/backpressure,
interrupted bodies, idle timeouts, descriptor scope, and immutable-version collisions. The real-GCS
fixture also covers empty files and multipart/copy uploads of 17 MiB plus three bytes, including
failed attempts to replace an existing version. Validated against the development bucket on
2026-09-30. HTTP tests cover unknown lengths, session isolation, mid-transfer revocation/closure,
version-pinned reads, serialized appends, sparse/random edits, truncation, fsync ordering, quota and
handle exhaustion, and receipt recovery. File API tests also run against GCS across reopen. A separate
withheld-WAL test disconnects the publishing caller and verifies atomic mutation/receipt recovery or
discard, including a concurrent retry waiting for the first publication's outcome.

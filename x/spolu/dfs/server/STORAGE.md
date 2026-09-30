# Synchronous storage

`Storage::workspace()` creates a trusted internal handle. Each `read_view()` captures one SlateDB
snapshot for related lookups and scans. Scans take typed exclusive cursors and a limit of 1–1000.
The namespace service will authorize requests, check parent/cycle/collision/revision constraints,
and serialize competing object mutations before calling this layer; there are no filesystem HTTP
endpoints yet.

`commit(MetadataBatch)` validates records and uploads, uploads new immutable content, verifies
existing content references, and publishes one atomic SlateDB batch. The caller supplies all related
object and child-index mutations; `SetGrant` always changes both grant indexes. Duplicate keys and
cross-workspace records are rejected before uploading. Uploaded versions use create-only writes;
an existing version is never overwritten, even with identical bytes.

Each batch includes a per-workspace change sequence and the sorted, deduplicated IDs of affected
objects/parents. A short shared publication lock protects sequence allocation and submission;
blob I/O and the WAL durability wait occur outside it. `commit` returns the sequence only after
`WriteHandle::await_durable()` succeeds. An error after submission may have an ambiguous outcome;
do not blindly retry mutations or delete their blobs. Orphan reclamation is deferred.

`ReadView::changes()` additionally uses SlateDB's `DurabilityLevel::Remote`, so pending events never
become search-indexing input. Events identify objects to reconcile against persisted state, including
deletions and directory/grant changes; search consumption and checkpointing arrive in group 12.
Event sequences are local to a workspace and are distinct from object metadata revisions.

## Format v1

The database-level `dfs-format` key contains ASCII `1`. Unknown formats and unmarked nonempty
databases fail opening; empty databases receive a durable marker. No automatic migrations exist.

Workspace keys start with byte `01`, a big-endian `u32` UTF-8 byte length, the exact workspace bytes,
and a one-byte family tag. IDs below are raw 16-byte UUIDs; names and grants preserve exact UTF-8.

| Tag | Family | Suffix after the workspace prefix and tag | Value before encoding |
| --- | --- | --- | --- |
| `01` | Objects | Object ID | `ObjectV1` |
| `02` | Children | Parent ID, name bytes | Child ID |
| `03` | Grants by object | Object ID, grant bytes | Unit |
| `04` | Objects by grant | Grant byte length (`u32` big-endian), grant bytes, object ID | Unit |
| `05` | Changes | Sequence (`u64` big-endian) | Array of affected IDs |
| `06` | Change sequence | Empty | Last sequence (`u64`) |

Length prefixes keep workspaces and grants distinct even with slashes, NUL, Unicode, or shared
prefixes. Names/grants at the end of a key need no length delimiter. Fixed-width big-endian change
sequences preserve scan order.

Each value starts with version byte `01`, followed by [Postcard](https://docs.rs/postcard/1.1.3/postcard/)
encoding. `ObjectV1` stores workspace, ID, optional parent/name, kind/content reference, MIME type,
xattrs, and metadata revision in that order. UUIDs occupy 16 bytes; xattr values remain binary.
Decoding checks the version, complete consumption, validated names/MIME/xattr keys, and object-key
identity. Changing record layouts requires a new version; HTTP representations are independent.

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

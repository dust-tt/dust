# dfs://

Rust filesystem optimized for small files, directory traversal, and concurrent agent workloads.
Prioritize responsiveness over retaining recent writes after a server crash.

Implementation invariants are recorded as top-level code contracts in [CONTRACTS](CONTRACTS).
See [README.md](README.md) for the current implementation scope and local development commands.

## Hypotheses

- Reads and metadata lookups dominate writes.
- Writes rarely contend; a competing writer may wait.
- Access clusters around an agent's conversation folder.

## Proposed architecture

Product and FUSE clients use the same authenticated server API. A tenant is a Dust workspace; each
sandbox belongs to exactly one workspace, and several sandboxes can access that workspace.

The PoC runs one server process serving one shard across many workspaces and concurrent clients.
Competing writers to the same file serialize; unrelated files proceed independently.

The server supports `--write-mode sync` (default, the durable baseline) and `--write-mode cached`
(server visibility with asynchronous persistence). Workspace creation always persists its authority
before returning. Metadata-only filesystem operations need no blob upload. Sections 8–9 remain
deferred while we evaluate cached-path performance.

The synchronous storage API and on-disk format are specified in [server/STORAGE.md](server/STORAGE.md).
It uses workspace-scoped snapshots and atomic metadata/index/event batches, acknowledging commits
only after referenced blobs exist and the SlateDB WAL is durable.

- **Server RAM/SSD:** Staged file contents and a metadata overlay for pending mutations. The owner
  serves the latest state by combining this overlay with SlateDB and cached or persisted blobs.
- **SlateDB, backed by GCS:** Persisted object metadata, directory entries, grants, and their indexes.
- **GCS blobs:** Asynchronously persisted file contents, including small files, as immutable versions.

## Objects and grants

Files and directories have a stable ID, MIME type, and xattrs. Directory entries map
`(parent ID, name)` to object IDs. Renames and moves preserve identity; content updates create a new
version without changing the file ID.

The server generates object IDs and separate content-version IDs using
[`uuid::Uuid::new_v4()`](https://docs.rs/uuid/latest/uuid/struct.Uuid.html#method.new_v4).
Store UUIDs as 16 bytes internally; object records use `(workspace, "objects", UUID)` keys. SlateDB
accepts these keys but does not allocate IDs. Generation needs no database round trip or persisted
counter. UUIDv4 provides 122 random bits; uniqueness is probabilistic. Always generate fresh IDs for
new objects and versions, including after recovery; never deliberately recycle them.

A grant is a caller-defined opaque string, such as `u:spolu@dust.tt` or `g:engineering`; prefixes have
no special meaning to dfs. Clients create a session with a workspace and at most **512 distinct
grants**. Reject larger sets. Session creation authenticates the caller and authorizes its workspace
and grant set; dfs does not resolve user identities or group membership from grant names.

Attach grants to files and directories by object ID. Directory grants inherit: an object's effective
grants are the union of its own and its ancestors' grants. Session access requires an intersection
with the session's grants. The server checks this on every session request; cross-workspace access
is forbidden even when grant strings match.

Store explicit grant attachments in both directions:

| SlateDB key | Purpose |
| --- | --- |
| `(workspace, "grants_by_object", object ID, grant)` | Read an object's grants for authorization. |
| `(workspace, "objects_by_grant", grant, object ID)` | Discover accessible files/directories. |

Update both indexes atomically, first in the owner's overlay and later in SlateDB. Inherited access
uses the current ancestor chain; do not copy inherited grants into these indexes. Root discovery
scans at most 512 grant prefixes and merges/deduplicates object IDs. Paginate results: the grant cap
bounds scan fan-out and search filter size, not the number of matching objects.

`POST /objects/grants/list` pages explicit attachments and returns the object's metadata revision.
`POST /objects/grants/update` uses workspace authority and an expected revision to patch 1–512
attachments (`grant: true/false`). Total attachments per object are uncapped. Both indexes, revision,
server ctime, and an indexing event persist together; content and other attributes stay unchanged.
Removing an attachment does not deny access inherited from ancestors or supplied by other grants.

## Object URIs

Persistent references to files and folders accept `dfs://<uuid>` or `dfs://<name>--<uuid>`, with the
UUID encoded as 32 lowercase hexadecimal characters without hyphens. Only the UUID identifies the
object; the optional name is decorative, ignored during resolution, and need not match its current
name. For example, both URIs reference the same object:

- `dfs://550e8400e29b41d4a716446655440000`
- `dfs://initiative-dfs--550e8400e29b41d4a716446655440000`

URIs contain no filesystem path and remain valid across renames and moves.

Paths are for session navigation and display. A URI identifies the object, not a content version;
deleting the object makes the reference unavailable. Resolving a URI always enforces the session's
workspace and grants.

Canonical formatting emits the bare URI. When including a decorative name, percent-encode it;
parsing validates its syntax and discards it. Paths, query strings, and fragments are not accepted.

## Initial filesystem semantics

These are the baseline semantics; metadata fields and wire types arrive with their operations.

- **Names:** Case-sensitive UTF-8, 1–255 bytes per component; preserve Unicode without normalization.
  Reject NUL, `/`, `.` and `..` as stored names. API relative paths reject empty components and
  traversal; the FUSE client handles navigation in its session namespace.
- **Kinds:** Regular files and directories only, with one canonical parent per non-root object.
  Virtual mounts and shared entries remain aliases, not hard links.
- **Times:** Store `atime`, `mtime`, and `ctime` as signed Unix seconds plus nanoseconds
  (`0–999,999,999`). Initialize all three at creation. Reads do not update `atime`; clients may set
  `atime`/`mtime`. Content changes update `mtime`/`ctime`; directory entry changes update their
  parent's `mtime`/`ctime`; other metadata changes, including rename, update the object's `ctime`.
  Only the server sets `ctime`; revisions, not wall-clock times, order changes.
- **Modes:** Store the low nine permission bits, defaulting to `0644` for files and `0755` for
  directories; clients apply umask on creation. Preserve executable bits and support chmod.
  FUSE reports the mounting user's UID/GID. Modes support local filesystem behavior; server access
  is governed by grants, and UID/GID or mode changes never confer server authority.
- **Xattrs:** Nonempty UTF-8 keys without NUL, with opaque byte values (including empty values).
  JSON represents values as standard padded base64, never lossy text. FUSE initially exposes the
  Linux `user.*` namespace; other namespaces return unsupported. MIME type is a separate field
  on both files and directories, defaulting to `application/octet-stream` and `inode/directory`.
- **Unsupported:** Symlinks, hard links, special files, ownership changes, setuid/setgid/sticky bits,
  POSIX ACLs, and advisory locks return explicit unsupported errors; never silently succeed.
  The file-handle contract below applies to the implemented file endpoints.

## API errors

Errors use `{"error":{"code":"not_found","message":"Not found."}}`. Codes are stable;
messages are fixed public text. Never expose paths, IDs, grants, or underlying storage errors.
Missing, cross-workspace, and otherwise inaccessible objects all return the same `not_found`.
Use `forbidden` only when denial reveals no hidden object, such as mutating a synthetic folder.
Error responses carry `Cache-Control: no-store`; authentication failures also carry
`WWW-Authenticate: Bearer`. Unknown routes return `not_found`; unsupported HTTP methods return
`method_not_allowed` with `Allow` (distinct from unsupported filesystem operations).

| Code | HTTP | FUSE mapping |
| --- | --- | --- |
| `invalid_input` | 400 | `EINVAL` |
| `name_too_long` | 400 | `ENAMETOOLONG` |
| `unauthenticated` | 401 | Recreate session; `EACCES` if unsuccessful. |
| `forbidden` | 403 | `EACCES` |
| `not_found` | 404 | `ENOENT` |
| `not_directory` | 400 | `ENOTDIR` |
| `is_directory` | 400 | `EISDIR` |
| `not_empty` | 409 | `ENOTEMPTY` |
| `method_not_allowed` | 405 | `EOPNOTSUPP` |
| `conflict` | 409 | `EAGAIN` for stale revisions or exhausted contention retries. |
| `already_exists` | 409 | `EEXIST` |
| `capacity_exhausted` | 507 | `ENOSPC` |
| `unavailable` | 503 | `EAGAIN` |
| `unsupported` | 501 | `EOPNOTSUPP` |
| `internal` | 500 | `EIO` |

Add distinct codes for filesystem conditions with their endpoints; clients must not infer errno
from message text or HTTP status alone. Unknown codes map to `EIO`. A failure or disconnect does not
prove a mutation was uncommitted: do not blindly replay writes; define safe retries with the mutation
protocol.

Object reads use session-authenticated `POST /objects/stat`, `/objects/lookup`, and `/objects/list`;
JSON bodies keep names/cursors out of URLs. Each request uses one SlateDB snapshot for inherited
grant checks and returned attributes. Stat omits parent links and paths; lookup/list require access
to the containing directory. Listing returns attributes with entries, ordered by name bytes, with
exclusive name cursors and limits of 1–1000. Pages reauthorize independently; concurrent edits may
require restarting traversal. An in-flight read may complete against its original snapshot.
The synchronous baseline caches neither dfs metadata nor authorization decisions across requests.

`POST /objects/mkdir` creates an authorized child and updates its parent atomically.
`POST /objects/update` patches MIME, xattrs, mode, and atime/mtime with a required expected metadata
revision; stale revisions conflict. Both set server ctime and publish indexing events, with acknowledgement per configured write mode.
Xattr patches use base64 values, null deletions, and a 32 KiB total key/value limit. Authorize before
checking collisions/revisions; denied mutations publish nothing.
Early development uses one metadata format; incompatible layout changes require a fresh store.

Mutations prepare against one snapshot outside publication, then lock touched objects/parents by
workspace and ascending object ID. Under a short shared publication lock, compare the snapshot's
workspace change sequence with current memory-visible state and submit atomically if unchanged.
Otherwise release object/publication locks, wait with bounded randomized backoff, reread, reauthorize,
and recompute the entire lock set. The first attempt has no delay; retry delays grow from 0.5–1 ms
to at most 64 ms. After 16 stale attempts return `conflict` without publication. Validate errors and
no-ops too. Namespace locks release before
WAL durability waits; per-file content and request gates span the complete mutation. Idle lock entries
are reclaimed. The workspace check also
catches ancestor grants/moves but may retry after unrelated writes in that workspace. Narrower
validation is a future optimization. Cached mode memoizes reads and successful authorization for
the exact workspace mutation sequence; synchronous mode retains uncached namespace reads.

`POST /objects/rename` takes the source ID/revision and destination `parent_id`/`name`. Require access
to the source and both containing directories; direct sharing never grants authority over a hidden
parent. Reject roots and moves into the source subtree. Default to no replacement; `replace: true`
allows file-for-file or directory-for-empty-directory replacement of the current destination.
Same parent/name is a no-op after revision validation. Preserve source ID, content, explicit grants,
and descendants; update source ctime/revision and each changed parent's mtime/ctime/revision once.

`POST /objects/unlink` and `/objects/rmdir` take object ID/revision and require current parent access.
Unlink accepts files; rmdir accepts empty directories; neither removes roots. Namespace changes,
deleted/replaced objects, both grant-index removals, and events persist atomically through the same
snapshot validation and publication path. Retain blobs until safe reclamation exists. Inherited access
follows the new ancestry immediately; ambiguous failures require rereading state before retrying.

## Workspace creation, sessions, and virtual folders

`POST /workspaces`, authenticated with the operator's `DFS_SERVER_KEY`, accepts a caller-provided
`workspace_id` and optional `root_grants`. It durably creates the workspace root, explicit root grant
indexes, and workspace key hash in one batch, then returns `workspace_id`, `root_id`, and a fresh
`workspace_key` once. Existing workspaces return a conflict; missing server configuration disables
creation. Root grants default to empty; do not implicitly grant every session access to the root.

The trusted workspace key may create sessions with any grant set in that workspace. It stays with
the trusted Product/caller; sandboxes receive session keys. Grant listing and attachment/revocation
also require the workspace key. Session creation never attaches grants to objects.

`POST /sessions`, authenticated with the workspace key, creates an ephemeral session with fixed
grants. Session creation currently accepts only workspace and grants; `mounts` is deferred.

```json
{
  "workspace_id": "workspace_123",
  "grants": ["u:spolu@dust.tt", "g:engineering"]
}
```

The server returns `session_id`, an opaque `session_key`, workspace/grants, and `expires_at` in Unix
seconds. Workspace/session keys contain 256 random bits; retain only SHA-256 hashes. Sessions expire
after one hour and are lost on restart. The current registry caps live sessions at 10,000 and cleans
expired entries on access. Workspace/session JSON requests are capped at 64 KiB.

`GET /sessions/current` returns the authenticated session's scope and expiry without its key.
Filesystem operations, search, and change subscriptions carry `Authorization: Bearer <session_key>`;
workspace and grants come from the session rather than individual requests.
`DELETE /sessions/{session_id}` requires that session's own key and closes it. Recreate on expiry,
server restart, or to change grants; discard cached namespace views and reestablish subscriptions.

Virtual mounts remain future work in group 5: reintroduce `mounts`, validate authorized directory
URIs and nonoverlapping relative paths, synthesize parents such as `/current`, and preserve virtual
`..` navigation without exposing hidden ancestors. Mounts must not grant additional access.

Key rotation and recovery of a workspace key lost with its creation response are future work. Use
authenticated TLS termination beyond local development; keys travel only in response bodies and
Authorization headers, never URLs or logs.

### Root and shared folder rendering

Read APIs accept the well-known IDs `root` and `shared` alongside real object UUIDs. These synthetic
directories are session-scoped, read-only, and have fixed attributes; they are not persistent objects
or URI targets. The session root combines authorized immediate workspace-root entries and `/shared`.
Root discovery never reveals private ancestors. A persisted root child named `shared` appears inside
synthetic `/shared`, preserving access without hiding the well-known folder.

Populate `/shared` from the session's grant-to-object prefixes, merging and deduplicating by object
ID. Omit objects reachable through an authorized ancestor or ordinary root entry. Every direct entry
uses `<basename>--<uuid>`; truncate only the basename at a UTF-8 boundary to fit 255 bytes. Sharing
`/spolu/C` exposes `/shared/C--<uuid>` without exposing `/spolu`. Canonical names inside C are unchanged.
Names do not depend on other shared objects, and shared rendering requires no extra storage index.

Shared lookup extracts the ID from the suffix, then checks current access, shared-root eligibility,
and the exact rendered name. Grant discovery uses bounded buffers and examines at most
`max(limit, 64)` deduplicated candidates per page. Shared cursors are exclusive object IDs; filtered
pages may be empty with a continuation. Root/canonical pages retain exclusive name cursors. Follow
`next_after` until null; every page and lookup uses fresh authorization in one snapshot. Root
filtering may examine multiple bounded batches.

Aliases return real object attributes and IDs; listing the target uses ordinary directory APIs.
Renames, moves, revocations, and deletions affect subsequent requests. Returned metadata never
includes canonical parents. FUSE maintains visible parents for `/shared` traversal; custom session
mounts remain deferred.

## File I/O contract

- **Handles:** Session-scoped, process-local, bound to stable object IDs and read/write access flags;
  release, session closure/expiry, or restart invalidates them. Opening does not reserve a writer.
  Rename preserves handles; every operation rechecks current grants. An already-authorized read
  may finish against its original snapshot. Initially unlink/replacement invalidates handles to the
  deleted object (`not_found`); POSIX open-after-unlink is future work.
- **Writes:** Serialize content mutations per file, not for the lifetime of an open handle. Append
  selects the current EOF within that serialization; truncation publishes a fresh version, including
  length zero, and extension supplies zero bytes. `O_TRUNC` is a write during open; read-only handles
  cannot mutate content. Replacement checks the expected content version
  and preserves unrelated metadata edits. Concurrent uploads may proceed; they do not reserve a name
  or permission, and a competing published replacement makes an older upload conflict.
- **Visibility:** Incomplete uploads never change file contents, length, listings, or events. A
  namespace commit publishes the entire version atomically; it may become visible before its WAL
  wait finishes. In the synchronous baseline every successful write is durable and visible before
  fsync. Fsync waits for preceding writes on that handle and reports their failures; release does not
  substitute for it. Cached mode changes durability, not the visibility barrier.

### Uploads and publication

`POST /uploads/start` takes `operation: "create"`, `parent_id`, and `name`, or `operation: "replace"`,
`object_id`, and `expected_content_version`. It authorizes the target and reserves fresh IDs for that
session. `PUT /uploads/content` sends `application/octet-stream` with `Dfs-Upload-Id` and the session
bearer key; Content-Length is optional. Completion reports the actual size and retains an internal
workspace/object/version/size descriptor. `POST /uploads/commit` takes `upload_id` and optional initial
MIME/xattrs/mode for creation. It reauthorizes, checks name vacancy or the expected content version,
then publishes metadata, indexes, an event, and a request receipt atomically and durably. Replacement
preserves unrelated metadata. Upload completion alone never publishes a file or acknowledges fsync.

Unpublished reservations expire after 15 minutes, cap at 1024 server-wide, and disappear on restart.
Durable publication releases its reservation immediately; retries use the persisted receipt.
A transfer is one-shot; duplicate submission conflicts. Failed transfers discard their reservations;
`POST /uploads/status` distinguishes pending, completed, and published uploads. Publication receipts
survive restart; currently authorized sessions can recover them and safely repeat the same commit.
The upload ID is its commit request ID. Expiry leaves unreachable blobs for future reclamation;
it never deletes immutable versions that might have been referenced.

Stream one 8 MiB part at a time, with at most one 1 MiB input frame. Uploads, range reads, and incoming
write bodies share a 64 MiB budget. Uploads/write bodies reserve 12 MiB each with four active slots;
reads reserve 2 MiB each with 16 active slots. Each pool admits 16 additional waiters; excess requests
fail with `capacity_exhausted` without polling their body. Limits are configurable via
`DFS_UPLOAD_MEMORY_MIB`, `DFS_UPLOAD_CONCURRENCY`, and `DFS_READ_CONCURRENCY`; this budgets transfer buffers, not total process RSS
(HTTP/TLS, SlateDB, and allocator overhead are separate). Input idle timeout is 30 seconds; the reservation
expiry also bounds total transfer time. A version is capped at 10,000 parts (about 78 GiB).
Small/empty files use a single create-only PUT. Multipart uploads use temporary blobs followed by a
create-only GCS copy; no full-file buffering or local disk is needed. Clean temporary blobs on normal
completion/failure; cancellation or process death can leave temporary objects/incomplete multipart
uploads for later cleanup. No orphan is ever published automatically.

### Handles, edits, and retries

`POST /files/open` returns a session-local handle and attributes. `/files/read` streams an offset/length
range, clamped to EOF, from the current immutable version; an optional version must still be current.
The response pins that version even if another writer publishes during the read. `PUT /files/write`
sends raw bytes with handle, request ID, sequence, offset, and length headers. `/files/truncate` changes
length. Edits assemble a complete new version on anonymous temporary disk, then stream it to GCS;
no full-file RAM buffer or local recovery data is needed. Sparse growth reads as zeros.

Each handle starts at sequence zero. Send writes/truncates in order starting at one; truncating open
consumes sequence one. `/files/fsync` names the last sequence it must cover, waits behind admitted
writes, and rejects unseen sequences or unresolved failures. After a failure, retry the same request
and sequence or close/reopen the handle. `/files/close` releases it without substituting for fsync.

Use a fresh client UUID per edit. Persist its request fingerprint and result with the mutation;
identical retries return the original receipt, while changed arguments/bytes conflict. Receipts are
workspace-scoped and always reauthorize the current object. `/files/status` recovers a visible receipt
after a lost response; null can mean the operation is still in flight. After restart, recreate the
session/handle and retry with the original request ID. Admitted publication continues after HTTP
disconnect; graceful shutdown drains those jobs before closing SlateDB. Receipt reclamation is deferred.

Limits: 4096 handles/server, 256/session, 16 active file jobs plus 256 waiting jobs, and 1 GiB shared
scratch logical size. Queued jobs do not poll streaming bodies or reserve scratch/transfer resources;
they recheck session/grant authorization when executing. Queue overflow returns `capacity_exhausted`.
Configure `DFS_FILE_MUTATIONS`, `DFS_SCRATCH_BYTES`, and `DFS_SCRATCH_DIR`. Reserve the resulting file's
size before assembly; exhaustion returns `capacity_exhausted`. Anonymous files and quota reservations
release on completion/failure; process death leaves no named scratch files. Preparation has a 15-minute
timeout; metadata publication is never cancelled by that timeout.

## Initial FUSE client

`dfs-protocol` shares model/wire types, `dfs-client` streams blocking HTTP, and `dfs-fuse` mounts on
Linux with `fuser` 0.18. Server/client development works natively on macOS; use a Linux sandbox with
`/dev/fuse` for mounts. macFUSE is excluded for now.

Each mount holds one fixed session key loaded from a private file. Recreate the session and remount
after expiry/restart; never silently substitute credentials under existing inodes or handles.
Object IDs plus their visible projection identify mount-local inodes. `/shared/.../..` follows visible
parents; synthetic root/shared entries are read-only. Provision workspace-root children through the
trusted API. Kernel references, open handles, and child links retain inodes; forget/release reclaim
them. No inode numbers are reused within a mount.

Use direct I/O without kernel writeback. Kernel positive/negative entry and attribute caching shares the client metadata
freshness deadline captured before reading; it never extends the one-second bound. Each mount has bounded
LRUs: 32 MiB for metadata and 256 MiB for immutable, version-keyed 1 MiB content blocks. Listing
prefills child lookup/stat entries. Read-only opens use local handles and `POST /objects/read`;
writable handles keep the server mutation/sequence protocol.

`POST /sessions/cache` long-polls a workspace revision. Unchanged revisions keep metadata fresh;
changes, polling failures, or a gap of one second discard metadata. Authorization can be stale for
at most one second, measured from check request start and capped by session expiry. Immutable bytes
have no TTL: retain them until memory pressure evicts them, selecting their version through currently
authorized metadata. Writes and session closure never wait for clients. The writing client clears
its metadata before/after mutations to read its own changes immediately. Response revision stamps
prevent stale in-flight responses refilling the cache. Targeted metadata invalidation is future work.
The client starts checks at least 100 ms apart, including when writes wake long polls immediately.
This bounds check traffic during write bursts without extending freshness deadlines or delaying writes.

Directory reads page with bounded state; seeking backwards replays pages.
Concurrent edits can cause skips/repeats, as with the HTTP listing contract. Up to 32 blocking workers
(default eight) bound concurrency; kernel read/write requests are capped at 1 MiB. Each mount caps inodes
at 100,000 and file/directory handles at 256 each. Exceeding limits returns an error.

Writes publish to the server before returning. Flush waits behind handle edits and reports sticky
write failures without repeating publication; explicit fsync also checks the server sequence barrier. Retry an ambiguous edit once with the same request ID/sequence/bytes; unresolved failures
require closing the handle and checking server state before further edits. Namespace mutations are
not blindly retried. Release frees handles; Linux does not propagate release errors to `close`, so
flush is the error-reporting boundary. Directory fsync relies on already-acknowledged namespace mutations in the configured write mode.
Ownership changes, links, special files, ACLs, advisory locks, and allocation operations are unsupported.
Mapped/executable content is outside the supported baseline. `statfs` reports unknown capacity as
zero. See [fuse/README.md](fuse/README.md) for operation and deployment limits.

## Writes, fsync, and recovery

Synchronous mode waits for content upload and durable metadata. Cached mode implements the following
visibility-only behavior; restarting creates new sessions and discards all volatile state.

The foreground path uses only the shard owner's local state:

1. Stage file contents in server RAM, spilling to local disk as needed.
2. Atomically publish metadata and related index changes in the owner's overlay.
3. Acknowledge `fsync` once other clients can read both metadata and content through the server.

`fsync` means server-side visibility, modulo client caches. It waits for neither GCS uploads nor
SlateDB or local-disk durability. Batch and pipeline requests to keep workloads such as `untar` fast.

Background workers upload immutable blobs concurrently, then apply ordered atomic metadata batches
to SlateDB. Pending references stay outside SlateDB until their blobs exist in GCS; its automatic WAL
flushes must never persist references to local-only data. Retire overlay entries after their mutations
are durable in SlateDB, preserving newer entries for the same keys. Never evict required unuploaded
content; apply backpressure when staging space is full. Superseded versions coalesced out of a durable
batch may be discarded once their read pins are released.

Persist a consistent prefix of mutations, including directory changes and grants. Recovery uses the
durable SlateDB prefix and discards pending local state: recent acknowledged mutations may be lost,
but metadata and content remain consistent. Retain blobs referenced by live or recoverable state;
reclaim orphaned blobs later.

### Cached mode implementation

- Content uses immutable 64 KiB pages shared across versions. Changed pages stay in RAM or spill to
  private temporary disk files without fsync; sparse extensions read as zeroes. Cold edits fetch their
  base once. Reads of persisted content use a bounded cache of 1 MiB ranges. Cache keys include the
  workspace, object, and version; authorization always uses current metadata. Clean entries use LRU
  eviction with a separate configurable entry limit (65,536 by default, `--cache-entries`).
- Defaults: 256 MiB content RAM, 4 GiB spill disk, 128 MiB pending metadata accounting, and a 64 MiB
  SlateDB block cache. Content budgets count shared pages once; process overhead and transfer buffers
  are additional. A separate 64 MiB namespace memo (`--namespace-cache-bytes`) reuses rows and
  successful ancestor authorization only for the exact workspace mutation sequence and grant set;
  every mutation changes that sequence atomically. Configure `--cache-memory-bytes`,
  `--cache-disk-bytes`, `--cache-dir`, and
  `--overlay-bytes` (matching `DFS_*` environment variables). Clean entries may be evicted; dirty
  capacity exhaustion rejects new writes. The queue also caps at 65,536 pending mutations.
- Every server start is cold: clear the private bucket/prefix-scoped disk read caches under
  `--cache-dir` before opening them, and recover state only from GCS. During the process lifetime,
  SlateDB caches immutable SSTs with a 256 MiB target
  (`--metadata-cache-disk-bytes`); manifests and WAL recovery always use GCS. A 512 MiB Foyer disk
  cache (`--read-cache-disk-bytes`) holds immutable 1 MiB content blocks under full version keys.
  Files up to 1 MiB prefill it after durable publication; larger files populate it on reads. Cache
  reads validate keys, lengths, and checksums; misses or read failures fall back to GCS. Neither cache
  restores pending writes or authorizes access. Zero disables either cache; content requires at least
  64 MiB when enabled. Foyer adds 4 MiB hot-entry memory, two rotating 16 MiB flush buffers, a 16 MiB
  admission queue threshold, and index/runtime overhead. Background prefill drains admission every
  1 MiB to avoid overflowing those buffers; read admission stays best effort. Neither delays fsync.
- A persistent ordered map gives cheap, consistent overlay snapshots, including tombstones. All
  point reads and paginated directory/grant scans merge the overlay with a SlateDB snapshot. Views
  pin their current staged content until the caller obtains a pinned stream; overwrites and background
  retirement cannot invalidate an already-selected read.
- Publication wakes one ordered persistence worker. After `--persist-interval-ms` (100 ms), it
  captures up to 4096 queued mutations and coalesces their rows. It uploads only versions referenced
  by the final object rows, with `--persist-concurrency` (16). Create-then-delete needs no blob upload.
  All receipts and events remain in the atomic metadata batch. Background upload buffers are bounded
  separately (about 8 MiB per worker) to preserve foreground transfer capacity. Each retained version
  is still a full GCS blob; local pages are not separate GCS objects. Later batches may upload another
  full version of the same file. Coalescing is not persistent block deduplication or delta encoding.
- Counters/logs distinguish visible, applied, and durable publication progress. Blob failures retry
  with backoff and bounded staging; SlateDB submission/durability failure stops publication until
  restart. Graceful shutdown drains for `--persist-drain-timeout-seconds` (60 by default) and reports
  failure if incomplete.
- Shutdown logs aggregate per-route request counts/handler times and metadata/content cache hits,
  misses, remote bytes, and reused authorization decisions. Handler times exclude streamed bodies.
- Receipts are visible alongside their mutation and become durable in the same persistence batch.
  Cached acknowledgements, including receipts, may disappear after a crash. A receipt records the
  original result and does not promise historical content access: coalesced versions need never reach
  GCS. Durable receipt expiry and blob reclamation remain deferred; client/API response shapes are
  unchanged.

## Caching and synchronization

Cache content by `(tenant, object ID, content version)`. Favor folder locality and return directory
entries with their attributes to minimize network round trips. Revalidate metadata and effective
grants before serving cached content. Scope cached directory listings to the session, including its
grants and virtual mounts.

Product and sandboxes subscribe to changes and automatically invalidate or refetch affected data in
both directions. Resynchronize caches after disconnects, missed events, or owner restart.

## Search

Use [LanceDB OSS](https://docs.rs/lancedb/latest/lancedb/) embedded in the Rust server, with tables
stored directly in GCS (`gs://`). Start with one table per workspace, opened on demand. Search is
rebuildable from persisted filesystem state; seconds-to-minutes freshness is acceptable.

- **Documents and indexes:** Store `file_id`, `content_version`, extracted text, MIME type, selected
  typed xattrs, and `grants` (the object's effective grant strings, including inherited grants).
  Use BM25 for text, scalar indexes for metadata, and a `LabelList` index for grant intersection via
  `array_contains_any`.
  These are native [LanceDB index types](https://docs.rs/lancedb/latest/lancedb/index/enum.Index.html).
- **Authorization:** Prefilter BM25 candidates with the session's at-most-512 grants, plus MIME
  type and xattr filters. Grant changes or moves asynchronously refresh affected descendants' indexed
  grants. Before exposing hits or snippets, reject deleted/superseded versions and recheck effective
  grants against the owner's live state. Revocations apply immediately to returned results; newly
  granted results may lag indexing. Return stable `dfs://` URIs with session-visible display paths.
- **Indexing:** Record replayable indexing events in the same SlateDB transactions as metadata.
  Consume only durable events, extract content from GCS, and batch ordered, idempotent upserts/deletes.
  Checkpoint progress after LanceDB commits so retries cannot lose updates. Indexing never blocks
  filesystem writes or `fsync`.
- **Maintenance:** Schedule index updates and compaction ourselves. LanceDB otherwise scans newly
  added, unindexed rows, which can increase query latency. See its
  [full-text search and maintenance guide](https://docs.lancedb.com/search/full-text-search).

Validate filtered BM25 latency with 512 session grants, large matching sets, inherited-grant
updates, and cold workspace tables before committing to this engine.

## PoC Limitation and Future Work

The PoC assumes exactly one server process serving one shard. It has no routing, ownership transfer,
or overlapping server instances. After a server restart, clients recreate sessions, discard cached
namespace state, and reestablish subscriptions. Compare metadata/content revisions within the
current session; revision counters alone do not establish continuity across restarts.

Future multi-server work includes:

- **Owner epochs:** A fresh UUID for each server ownership tenure. Include it in revision checks and
  subscription cursors so a value such as revision 42 from an old server cannot be mistaken for
  revision 42 after a restart or ownership transfer. This detects stale state; it does not fence a
  writer or prove durability.
- **Writer fencing:** Prevent an old server from acknowledging mutations or persisting updates once
  another server takes ownership. Fence both foreground serving and background persistence.
- **Routing and failover:** Assign workspaces to shards, move shards between servers, and coordinate
  ownership transfer and recovery.

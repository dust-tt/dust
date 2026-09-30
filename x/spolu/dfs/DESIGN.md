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

Implement a synchronous end-to-end baseline first: read from SlateDB/GCS and finish required GCS
uploads followed by durable SlateDB batches before acknowledging mutations. Metadata-only operations
need no blob upload. Add the server caching and asynchronous write architecture below once that
baseline works through FUSE and survives restart.

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
  Open/append/truncate and unlink-with-open-handles semantics are specified with file I/O in group 6.

## API errors

Errors use `{"error":{"code":"not_found","message":"Not found."}}`. Codes are stable;
messages are fixed public text. Never expose paths, IDs, grants, or underlying storage errors.
Missing, cross-workspace, and otherwise inaccessible objects all return the same `not_found`.
Use `forbidden` only when denial reveals no hidden object, such as mutating a synthetic folder.
Error responses carry `Cache-Control: no-store`; authentication failures also carry
`WWW-Authenticate: Bearer`. Unknown routes return `not_found`; unsupported HTTP methods return
`method_not_allowed` with `Allow` (distinct from unsupported filesystem operations).

| Code | HTTP | Future FUSE mapping |
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
revision; stale revisions conflict. Both set server ctime, publish indexing events, and await durability.
Xattr patches use base64 values, null deletions, and a 32 KiB total key/value limit. Authorize before
checking collisions/revisions; denied mutations publish nothing.
Early development uses one metadata format; incompatible layout changes require a fresh store.

Mutations prepare against one snapshot outside publication, then lock touched objects/parents by
workspace and ascending object ID. Under a short shared publication lock, compare the snapshot's
workspace change sequence with current memory-visible state and submit atomically if unchanged.
Otherwise release locks, reread, reauthorize, and recompute the entire lock set; after 16 stale attempts
return `conflict` without publication. Validate errors and no-ops too. All locks release before WAL
durability waits; cancellation cleans up held locks and idle lock entries. The workspace check also
catches ancestor grants/moves but may retry after unrelated writes in that workspace. Narrower
validation is a future optimization; no dfs metadata or authorization cache is introduced.

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
grants and optional virtual mounts:

```json
{
  "workspace_id": "workspace_123",
  "grants": ["u:spolu@dust.tt", "g:engineering"],
  "mounts": {
    "current/conversation": "dfs://initiative-dfs--550e8400e29b41d4a716446655440000",
    "current/pod": "dfs://initiative-dfs--f47ac10b58cc4372a5670e02b2c3d479"
  }
}
```

These targets might currently live at `/spolu@dust.tt/conversations/AXXX` and
`/jd@dust.tt/pods/podZZZ`; their URIs survive changes to those paths.

The server returns `session_id`, an opaque `session_key`, workspace/grants, and `expires_at` in Unix
seconds. Workspace/session keys contain 256 random bits; retain only SHA-256 hashes. Sessions expire
after one hour and are lost on restart. The current registry caps live sessions at 10,000 and cleans
expired entries on access. Workspace/session JSON requests are capped at 64 KiB.

`GET /sessions/current` returns the authenticated session's scope and expiry without its key.
Filesystem operations, search, and change subscriptions carry `Authorization: Bearer <session_key>`;
workspace, grants, and virtual paths come from the session rather than individual requests.

- Resolve mount target URIs to directories at creation, requiring access within the workspace.
  Target renames/moves preserve the alias; current grants still govern every access.
- Mount paths are relative to the session root and appear alongside its ordinary authorized entries.
  Synthesize parents such as `/current`; reject invalid paths, overlapping mounts, and name collisions.
- Mounts provide aliases only. They grant no additional access and create no persistent directories.
  Operations inside them affect the target; `..` follows virtual parents without exposing target
  ancestors. Synthetic parents and mount entries cannot be mutated through filesystem operations.
- `DELETE /sessions/{session_id}` requires that session's own key and closes it. Recreate on expiry,
  owner restart, or to change grants/mounts; discard cached namespace views and reestablish subscriptions.

Nonempty mounts are currently rejected until mount validation is implemented in group 5. Key rotation
and recovery of a workspace key lost with its creation response are future work. Use authenticated
TLS termination when exposing the API beyond local development; keys travel only in response bodies
and Authorization headers, never URLs or logs.

### Root and shared folder rendering

The session root combines authorized workspace-root entries, a synthetic `/shared` folder, and
configured virtual folders such as `/current`. Reserve `/shared` in the session namespace.

Populate `/shared` from the grant-to-object index, using the owner's overlay plus SlateDB. Omit
objects already reachable through an authorized ancestor or directly from the workspace root.
Render each remaining object under its basename, disambiguating collisions with stable object IDs.
Thus a grant on `/spolu/C` exposes `/shared/C` without exposing `/spolu`.

These entries are aliases, not copied directories. Listing `/shared/C` reads C's ordinary directory
entries; grant changes update the rendered view through session notifications and cache invalidation.

## Writes, fsync, and recovery

The initial synchronous implementation waits for any content upload and a durable metadata batch.
The following visibility-only behavior is introduced with server caching after that baseline works.

The foreground path uses only the shard owner's local state:

1. Stage file contents in server RAM, spilling to local disk as needed.
2. Atomically publish metadata and related index changes in the owner's overlay.
3. Acknowledge `fsync` once other clients can read both metadata and content through the server.

`fsync` means server-side visibility, modulo client caches. It waits for neither GCS uploads nor
SlateDB or local-disk durability. Batch and pipeline requests to keep workloads such as `untar` fast.

Background workers upload immutable blobs concurrently, then apply ordered atomic metadata batches
to SlateDB. Pending references stay outside SlateDB until their blobs exist in GCS; its automatic WAL
flushes must never persist references to local-only data. Retire overlay entries after their mutations
are applied to SlateDB. Never evict unuploaded content; apply backpressure when staging space is full.

Persist a consistent prefix of mutations, including directory changes and grants. Recovery uses the
durable SlateDB prefix and discards pending local state: recent acknowledged mutations may be lost,
but metadata and content remain consistent. Retain blobs referenced by live or recoverable state;
reclaim orphaned blobs later.

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

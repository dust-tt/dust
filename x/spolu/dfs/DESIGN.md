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

Each workspace belongs to a shard with one fenced writer. Shared servers handle many workspaces and
concurrent clients. Competing writers to the same file serialize; unrelated files proceed independently.

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
grants are the union of its own and its ancestors' grants. Access requires an intersection with the
session's grants. The server checks this on every request; cross-workspace access is forbidden
even when grant strings match.

Store explicit grant attachments in both directions:

| SlateDB key | Purpose |
| --- | --- |
| `(workspace, "grants_by_object", object ID, grant)` | Read an object's grants for authorization. |
| `(workspace, "objects_by_grant", grant, object ID)` | Discover accessible files/directories. |

Update both indexes atomically, first in the owner's overlay and later in SlateDB. Inherited access
uses the current ancestor chain; do not copy inherited grants into these indexes. Root discovery
scans at most 512 grant prefixes and merges/deduplicates object IDs. Paginate results: the grant cap
bounds scan fan-out and search filter size, not the number of matching objects.

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

## Sessions and virtual folders

`POST /sessions` creates an ephemeral session with fixed grants and optional virtual mounts:

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

The server returns `session_id`, an opaque `session_token`, and `expires_at`. Filesystem operations,
search, and change subscriptions carry `Authorization: Bearer <session_token>`; workspace, grants,
and virtual paths come from the session rather than individual requests.

- Resolve mount target URIs to directories at creation, requiring access within the workspace.
  Target renames/moves preserve the alias; current grants still govern every access.
- Mount paths are relative to the session root and appear alongside its ordinary authorized entries.
  Synthesize parents such as `/current`; reject invalid paths, overlapping mounts, and name collisions.
- Mounts provide aliases only. They grant no additional access and create no persistent directories.
  Operations inside them affect the target; `..` follows virtual parents without exposing target
  ancestors. Synthetic parents and mount entries cannot be mutated through filesystem operations.
- `DELETE /sessions/{session_id}` closes the session. Recreate on expiry or owner restart, or to change
  grants/mounts; discard cached namespace views and reestablish subscriptions when recreating.

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

## PoC Limitation

Assume only one shard running (no routing to solve).

# dfs:// storage proposal

FoundationDB stores tenants, sessions, objects, directory entries, contents, and grants.
[API.md](API.md) defines observable behavior. Session authentication uses a bounded cache backed by
FDB; object authorization reads tree structure and grants from FDB. Search and a full in-memory
authorization index are future work (depending on approach chosen for search).

## Key layout

Keys below show the full logical shape; slashes separate components in the notation, not in the
stored bytes. The namespace prefix is `dfs-v1-{env}`, where `env` is `test` or `prod`: `dfs-v1-test`
and `dfs-v1-prod` isolate the two environments within an FDB cluster. The implementation currently
fixes `env` to `test` until deployment configuration is available.

```text
dfs-v1-{env}/tenant/<tenantId>/<family>/...
```

The tenant subspace is defined in [keys.rs](../server/src/storage/resources/keys.rs) as the FDB
tuple `("dfs-v1-{env}", "tenant", tenantId)`. Each component is encoded separately by the tuple
layer, which supplies type tags, terminators, and escaping. Tenant IDs contain 1–256 UTF-8 bytes
without NUL; a slash in an ID remains part of that tuple component and cannot introduce another key
component.

The authenticated tenant key or session determines `tenantId`. Object IDs are stored as 16-byte
UUIDv7s. Subjects use their exact UTF-8 strings in keys. Block indices and the session expiry index
use big-endian `u64` encoding; expiry timestamps are Unix milliseconds. Variable-length components
need unambiguous boundaries and must preserve ordering where required for pagination. Apart from the
tenant and session records below, family tags and value encodings remain proposals.

UUIDv7 tends to cluster newly created objects within each family or reverse grant prefix. Directory
entries cluster by parent and sort by name; blocks cluster by file and sort by offset. Subtrees are
not contiguous, and allocation order does not establish commit order. Locality gains and write
concentration need measurement.

## Tenants

| Key | Value | Rationale |
| --- | --- | --- |
| `dfs-v1-{env}/tenant/<tenantId>/tenant` | FDB tuple `(root_id_bytes, key_hash_bytes)`. | Stores the tenant's real root ID and credential hash. |
| `dfs-v1-{env}/tenant-key/<keyHash>` | Tenant ID as an FDB tuple string. | Resolves an opaque tenant key before the tenant is known. |

The root is 16 UUIDv7 bytes; `keyHash` is SHA-256 of the bearer key's UTF-8 bytes. Plaintext keys are
returned at creation and never persisted. Creation writes the record and lookup atomically,
checking credential uniqueness. Authentication resolves the lookup and verifies the tenant record's
matching hash in the same transaction.

Each API instance caches successful authentication by key hash for 30 seconds. Cache hits do not
extend expiry; failures are not cached. A shared sweep removes expired tenant and session cache
entries every 30 seconds.

## Sessions

Sessions persist in FDB across server restarts and HTTP/2 connections. Each has a fixed subject set,
an initial one-hour expiry, and a root resolved from tenant state.

| Key | Value | Rationale |
| --- | --- | --- |
| `dfs-v1-{env}/tenant/<tenantId>/session/<sessionId>/state` | FDB tuple `(key_hash_bytes, expires_at_ms)`. | Authoritative session state; supports tenant-scoped revocation by session ID. |
| `dfs-v1-{env}/tenant/<tenantId>/session/<sessionId>/subject/<subject>` | Empty value. | Stores the exact, deduplicated subject set under the session prefix. |
| `dfs-v1-{env}/session-key/<keyHash>` | FDB tuple `(tenant_id, session_id)` of strings. | Resolves an opaque session key before the tenant is known. |
| `dfs-v1-{env}/session-expiry/<expiresAtMs>/<tenantId>/<sessionId>` | Empty value. | Finds expired sessions across tenants in bounded batches. |

Session IDs are UUIDv7 strings in lowercase 32-digit hex. Keys use the FDB tuple layer; expiry index
timestamps are eight-byte big-endian byte strings. Bearer keys are hashed as for tenants and never
persisted in plaintext. Subjects have separate keys because the set can exceed FDB's
[100,000-byte value limit](https://apple.github.io/foundationdb/known-limitations.html).

Creation atomically writes state, subjects, credential lookup, and expiry entry, rejecting ID or key
collisions. IDs and keys are generated before the retrying transaction; an existing ID with the same
hash succeeds without rewriting state, allowing retries to recognize their own commit.

Authentication resolves the lookup and verifies the matching hash and unexpired state in one
transaction. Successful results are cached per API instance for at most 30 seconds from the start
of the lookup, capped by session expiry; hits do not extend this deadline. Revocation can therefore
take up to 30 seconds to prevent new RPCs across servers; already admitted RPCs may finish.

`RefreshSession` reads active state directly from FDB and atomically replaces the expiry index entry,
extending expiry to the later of its current value and server time plus one hour. It never revives
expired or revoked sessions. `RevokeSession` uses the authenticated tenant to locate the session,
then atomically clears its prefix, credential lookup, and expiry entry. Both operations use
conflict-tracked reads and evict the local cache entry after commit.

Each server waits a fresh random 1–60 seconds before each expiry sweep, including the first. A pass
fixes its cutoff at one minute before its start and drains the expiry index in fresh transactions
of at most 100 entries. Each batch rechecks session state with conflict tracking before deletion,
protecting refreshed sessions and allowing concurrent sweepers to retry safely. Stale and orphaned
index entries are also removed. Authentication rejects expired sessions independently of cleanup.

## Objects and contents

| Key | Value | Rationale |
| --- | --- | --- |
| `dfs-v1-{env}/tenant/<tenantId>/object/<objectId>` | Stored attributes, parent ID, basename, `attr_version`, and `content_version`. | Supports direct access and ancestry walks. |
| `dfs-v1-{env}/tenant/<tenantId>/metadata/<objectId>` | Creation time and MIME type. | Keeps optional metadata out of ordinary traversal. |
| `dfs-v1-{env}/tenant/<tenantId>/metadata/<objectId>/xattr/<name>` | Xattr value bytes. | Supports reading and updating individual xattrs. |
| `dfs-v1-{env}/tenant/<tenantId>/child/<parentId>/<name>` | Child ID. | Supports exact lookup, name uniqueness, ordered listing, and emptiness checks. |
| `dfs-v1-{env}/tenant/<tenantId>/block/<objectId>/<blockIndex>` | Up to 64 KiB of content. | Supports range reads, sparse files, and suffix clearing on truncation. |

Each xattr name is a separate tuple component. An empty value denotes a present xattr with empty
bytes; a missing key denotes an absent xattr. Extended metadata reads combine the base entry and
xattr entries from the same transaction. Xattr changes commit with `attr_version` and preserve the
32 KiB limit on combined xattr name/value bytes. Object deletion clears both the base metadata entry
and all xattr entries.

The stored parent and basename support inheritance and namespace maintenance. They change
atomically with directory entries; public `Attr` exposes only the basename. Moves preserve object
IDs and content keys and require no descendant path rewrites. Virtual `root` and `shared` are
projections; the real tenant root is an ordinary stored object.

Effective `mode` and `ReadView` are computed per response. Directory execute/traverse derives from
read permission. File size, versions, and affected blocks commit together. Missing blocks read as
zeroes within the logical size; truncation discards trailing data so extension cannot restore it.

### Directory state and versions

Both versions live in `dfs-v1-{env}/tenant/<tenantId>/object/<objectId>` as `uint64` counters
initialized to 1. Update them atomically according to the [API version rules](API.md#shared-types),
using checked increments that fail before commit on overflow. Directory entry changes read and
update the parent record's timestamps and versions in the same transaction. Concurrent sibling
changes may conflict and retry.

## Grants

Store ALLOW subjects directly as strings. Sessions may contain subjects with no attachments.
Store each grant's complete identity, including its mode, so listing and detaching preserve distinct
grant values.

| Key | Value | Rationale |
| --- | --- | --- |
| `dfs-v1-{env}/tenant/<tenantId>/object-grant/<objectId>/ALLOW/<subject>/<mode>` | Attachment marker. | Reads and paginates explicit ALLOW grants by subject, then mode. |
| `dfs-v1-{env}/tenant/<tenantId>/object-grant/<objectId>/DENY/<mode>` | Attachment marker. | Reads and paginates subjectless DENY grants by mode. |
| `dfs-v1-{env}/tenant/<tenantId>/grant-object/<subject>/<objectId>/<mode>` | Attachment marker. | Finds ALLOW candidates for `/shared` without scanning all objects. |

The forward index also serves `ListGrants`: variants sort ALLOW before DENY, subjects in UTF-8 byte
order, and modes numerically. Subject encoding preserves that order while delimiting subsequent
components. Forward and reverse entries change atomically and are removed when their object is deleted.

Authorization walks the real ancestor chain in one transaction. At each level, DENY removes inherited
bits, then matching ALLOW adds bits. Only read/write bits exist; a deeper ALLOW can reopen access.
Reverse scans return candidates requiring deduplication and full permission/projection checks. DENY
creates no entry point. Inherited grants are never materialized, so grant changes need no descendant
rewrites and never bump object versions.

## Transactions

Namespace indexes, metadata, blocks, grants, and corresponding versions commit atomically.
Authorization and structural checks use the same transaction. Conflict-tracked reads protect
existence, source/destination bindings, directory emptiness, and move-cycle checks.

Within `Apply`, each operation validates before staging writes; failed operations leave no changes.
Later operations see earlier successes, and all successes commit together. Storage or commit
failures fail the attempt. Retry definitely uncommitted transactions, recomputing reads and
decisions. Retrying an unknown commit result requires operation-specific idempotency, as for tenant
creation.

The 4 MiB RPC ceiling and 1 MiB `Apply` request budget are separate from FDB transaction accounting.
Budget index maintenance, metadata, blocks, and required responses before commit. Scans use bounded
batches; no operation requires loading the full tenant index.

## Future work

Search and the full in-memory index are deferred with their supporting keys and workers. Initial
writes need not maintain them. Background workers could share an internal tenant discovery index:

| Key | Value | Rationale |
| --- | --- | --- |
| `dfs-v1-{env}/tenant-registry/<tenantId>` | Registration marker. | Discovers tenants without active sessions, using a separate global namespace. |

### Search

Search would use an asynchronous Elasticsearch projection with a durable FDB work queue:

| Key | Value | Rationale |
| --- | --- | --- |
| `dfs-v1-{env}/tenant/<tenantId>/search-pending/<objectId>` | Work token, enqueue time, and retry state. | Coalesces edits into an obligation to index current state, including deletion. |
| `dfs-v1-{env}/tenant/<tenantId>/search-meta` | Index generation, backfill/queue cursors, and publication time. | Makes backfills and queue processing resumable. |

When introduced, searchable mutations would replace the pending token atomically with source
changes. Workers publish conditionally and clear only a matching token, preserving concurrent edits
and failed work. Hits require bounded existence, freshness, scope, and permission checks. FDB can
provide these without a RAM tree; indexed ACLs are never authoritative. Results use `SearchAttr`.

### Full in-memory authorization index

We may never build this. A complete tenant tree with compact parent slots and explicit grants could
accelerate ancestry walks, at the cost of memory, bootstrap, freshness, and recovery machinery.

| Key | Value | Rationale |
| --- | --- | --- |
| `dfs-v1-{env}/tenant/<tenantId>/tree-node/<objectId>` | Parent, kind, grant/deletion flags, and latest stamp. | Bootstraps the tree and locates the previous update. |
| `dfs-v1-{env}/tenant/<tenantId>/tree-update/<stamp10>/<objectId>` | Latest authorization image. | Discovers changes in commit order. |
| `dfs-v1-{env}/tenant/<tenantId>/tree-deleted/<stamp10>/<objectId>` | Tombstone marker. | Collects expired deletions without scanning live objects. |
| `dfs-v1-{env}/tenant/<tenantId>/tree-incarnation` | Feed incarnation ID. | Detects rebuilds that invalidate old cursors. |
| `dfs-v1-{env}/tenant/<tenantId>/tree-floor` | Minimum resumable FDB version. | Forces rebootstrap after missed tombstones. |
| `dfs-v1-{env}/tenant/<tenantId>/tree-deleted-count` | Retained tombstone count. | Bounds retention without scanning tombstones. |

Each object retains one head and at most one current update. Source mutations replace these
atomically, ordered by FDB's 10-byte commit versionstamp and object ID. Records omit names,
contents, and inherited permissions; explicit grants are read at the same snapshot. Replicas publish
coherent generations with tenant-wide authorization versions and fall back to FDB when unavailable
or stale.

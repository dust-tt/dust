# dfs:// storage proposal

FoundationDB stores objects, directory entries, contents, and grants. [API.md](API.md) defines
observable behavior. Initially, authorization reads topology and grants directly from FDB.
Search and a full in-memory authorization index are future work.

## Key layout

Keys below show the full logical shape; separators and family names are illustrative. The namespace
prefix is `dfs-v1-{env}`, where `env` is `test` or `prod`: `dfs-v1-test` and `dfs-v1-prod` isolate the
two environments within an FDB cluster.

```text
dfs-v1-{env}/tenants/<tenantId>/<family>/...
```

The authenticated tenant key or session determines `tenantId`. Object IDs are stored as 16-byte
UUIDv7s. Subjects use their exact UTF-8 strings in keys. Block indices use big-endian `u64` encoding.
Variable-length components need unambiguous boundaries and must preserve ordering where required
for pagination. Exact family tags and value encodings remain to be chosen.

UUIDv7 tends to cluster newly created objects within each family or reverse grant prefix.
Directory entries cluster by parent and sort by name; blocks cluster by file and sort by offset.
Subtrees are not contiguous, and allocation order does not establish commit order. Locality gains
and write concentration need measurement.

## Objects and contents

| Key | Value | Rationale |
| --- | --- | --- |
| `dfs-v1-{env}/tenants/<tenantId>/tenant` | Root ID and tenant credential hash. | Resolves durable tenant identity and its root. |
| `dfs-v1-{env}/tenants/<tenantId>/object/<objectId>` | Stored attributes, parent ID, basename, `attr_version`, and `content_version`. | Supports direct access and ancestry walks. |
| `dfs-v1-{env}/tenants/<tenantId>/metadata/<objectId>` | Creation time, MIME type, and xattrs. | Keeps optional metadata out of ordinary traversal. |
| `dfs-v1-{env}/tenants/<tenantId>/child/<parentId>/<name>` | Child ID. | Supports exact lookup, name uniqueness, ordered listing, and emptiness checks. |
| `dfs-v1-{env}/tenants/<tenantId>/block/<objectId>/<blockIndex>` | Up to 64 KiB of content. | Supports range reads, sparse files, and suffix clearing on truncation. |

The stored parent and basename support inheritance and namespace maintenance. They change
atomically with directory entries; public `Attr` exposes only the basename. Moves preserve object
IDs and content keys and require no descendant path rewrites. Virtual `root` and `shared` are
projections; the real tenant root is an ordinary stored object. Sessions remain in server memory.

Effective `mode` and `ReadView` are computed per response. Directory execute/traverse derives from
read permission. File size, versions, and affected blocks commit together. Missing blocks read as
zeroes within the logical size; truncation discards trailing data so extension cannot restore it.

### Directory state and versions

Both versions live in `dfs-v1-{env}/tenants/<tenantId>/object/<objectId>` as `uint64` counters
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
| `dfs-v1-{env}/tenants/<tenantId>/object-grant/<objectId>/ALLOW/<subject>/<mode>` | Attachment marker. | Reads and paginates explicit ALLOW grants by subject, then mode. |
| `dfs-v1-{env}/tenants/<tenantId>/object-grant/<objectId>/DENY/<mode>` | Attachment marker. | Reads and paginates subjectless DENY grants by mode. |
| `dfs-v1-{env}/tenants/<tenantId>/grant-object/<subject>/<objectId>/<mode>` | Attachment marker. | Finds ALLOW candidates for `/shared` without scanning all objects. |

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
Later operations see earlier successes, and all successes commit together. Storage or commit failures
fail the attempt. Retry only definitely uncommitted transactions, recomputing reads and decisions.

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
| `dfs-v1-{env}/tenants/<tenantId>/search-pending/<objectId>` | Work token, enqueue time, and retry state. | Coalesces edits into an obligation to index current state, including deletion. |
| `dfs-v1-{env}/tenants/<tenantId>/search-meta` | Index generation, backfill/queue cursors, and publication time. | Makes backfills and queue processing resumable. |

When introduced, searchable mutations would replace the pending token atomically with source
changes. Workers publish conditionally and clear only a matching token, preserving concurrent edits
and failed work. Hits require bounded existence, freshness, scope, and permission checks. FDB can
provide these without a RAM tree; indexed ACLs are never authoritative. Results use `SearchAttr`.

### Full in-memory authorization index

We may never build this. A complete tenant tree with compact parent slots and explicit grants
could accelerate ancestry walks, at the cost of memory, bootstrap, freshness, and recovery machinery.

| Key | Value | Rationale |
| --- | --- | --- |
| `dfs-v1-{env}/tenants/<tenantId>/tree-node/<objectId>` | Parent, kind, grant/deletion flags, and latest stamp. | Bootstraps the tree and locates the previous update. |
| `dfs-v1-{env}/tenants/<tenantId>/tree-update/<stamp10>/<objectId>` | Latest authorization image. | Discovers changes in commit order. |
| `dfs-v1-{env}/tenants/<tenantId>/tree-deleted/<stamp10>/<objectId>` | Tombstone marker. | Collects expired deletions without scanning live objects. |
| `dfs-v1-{env}/tenants/<tenantId>/tree-incarnation` | Feed incarnation ID. | Detects rebuilds that invalidate old cursors. |
| `dfs-v1-{env}/tenants/<tenantId>/tree-floor` | Minimum resumable FDB version. | Forces rebootstrap after missed tombstones. |
| `dfs-v1-{env}/tenants/<tenantId>/tree-deleted-count` | Retained tombstone count. | Bounds retention without scanning tombstones. |

Each object retains one head and at most one current update. Source mutations replace these
atomically, ordered by FDB's 10-byte commit versionstamp and object ID. Records omit names, contents,
and inherited permissions; explicit grants are read at the same snapshot. Replicas publish coherent
generations with tenant-wide authorization versions and fall back to FDB when unavailable or stale.

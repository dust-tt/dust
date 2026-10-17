# dfs:// API proposal

This document proposes the dfs:// server API as a gRPC service named `Dfs`. All calls are unary.
Requests authenticate through gRPC metadata: `authorization: Bearer <key>`.

The schemas below describe the API's logical types, rather than literal protobuf syntax.
`field?: T` means the field may be omitted; `T[]` means a list; `map<K, V>` means a map. Lists and maps
may be empty unless a minimum is specified. Numeric sizes and offsets are in bytes.

## Shared types

- `ObjectId`: the identity of a real stored object, represented as a 16-byte UUIDv7. It remains
  stable across renames and moves. The real tenant root also has an `ObjectId`.
- `ObjectRef`: either a real `ObjectId` or a virtual `root` / `shared` tag. Virtual references work
  with `Stat`, `Lookup`, and `List`. Other operations require a real `ObjectId`.
  Virtual `root` is a session projection, distinct from the stored tenant root.
- `bytes`: a sequence of raw bytes.

```text
ObjectId = UUIDv7               // Exactly 16 bytes; identifies a real stored object.
ObjectRef = ObjectId | root | shared
Timestamp = uint64              // Milliseconds since 1970-01-01T00:00:00Z.
ObjectKind = FILE | DIRECTORY | SYMLINK

Attr {
  id: ObjectRef
  name: string                   // Stored basename; empty for the stored and virtual roots.
  kind: ObjectKind
  size: uint64                   // Logical file size; zero for directories.
  mode: uint32                   // Owner r/w bits, plus derived directory x.
  atime?: Timestamp
  mtime?: Timestamp
  ctime?: Timestamp
  attr_version: uint64           // Version of attributes and metadata.
  content_version: uint64        // Version of bytes or directory entries.
  grants_version: uint64         // Version of grants attached to the object itself.
  store_version: int64           // FDB read snapshot or successful mutation commit version.
  metadata?: ExtendedMetadata    // Present when extended metadata was requested.
}

ExtendedMetadata {
  created: Timestamp             // Creation time; Unix epoch for virtual projections.
  mime_type?: string
  xattrs: map<string, bytes>
}

ErrorDetails {
  code: ErrorCode
}

Empty {}
```

`kind` is `FILE` for regular files and `DIRECTORY` for directories, including the stored and virtual
roots. `SYMLINK` is reserved until symlink targets are specified: creating one fails with
`UNSUPPORTED`, and attributes never report it.

`Attr.name` is the stored basename for real non-root objects, independent of the alias used to
access them. The stored tenant root and virtual `root` use an empty name; virtual `shared` uses
`shared`. `Entry.name` is the listing name and can differ from `Attr.name`, such as the
`<name>--<object-id>` aliases under `/shared`.

For real objects, `Attr.mode` encodes the current session's effective read/write grant permissions
in the POSIX owner bits by shifting them left by six: read (`0o400`) and write (`0o200`). Directories
automatically add owner execute/traverse (`0o100`) if and only if read is allowed. Write alone does
not add execute/traverse. Regular files report no execute bits. Mode is computed from the
authorization state used for the response and is not an independently stored permission mask.
Group, other, special, and file-type bits are always zero.

| Effective grants | Directory mode | Regular file mode |
| --- | --- | --- |
| None | `0o000` | `0o000` |
| `r` | `0o500` | `0o400` |
| `w` | `0o200` | `0o200` |
| `rw` | `0o700` | `0o600` |

Virtual `shared` reports read/traverse access (`0o500`). Virtual `root` reports `0o700` when the
session has `w` on the stored tenant root, and `0o500` otherwise.
Create and update operations do not accept a mode; new objects inherit permissions from grants.

Executable-file handling is explicitly deferred to future work, likely client heuristics based on
MIME types and/or xattrs. Whether a file is executable must be independent of the session and its
grants.

All timestamps, including session expiration and search time bounds, use this millisecond format.
Precision is one millisecond, and dates before the Unix epoch are not representable. Zero denotes
the epoch; an omitted optional timestamp is distinct from zero.

Optional `metadata` contains creation time, MIME type, and xattrs; absence means metadata was not
fetched, while a present metadata object with an empty xattr map means it was fetched and no xattrs
exist. `Stat` and `Lookup` populate this field when `include_metadata=true`. `Search` may include it
in `SearchAttr`. Other responses omit it unless explicitly specified.

In returned metadata, an omitted MIME type means none is assigned. Setting `mime_type` to `""` in a
create or update operation clears it and stores `None`; subsequent metadata reads omit the field.

Whenever extended metadata is returned, `created` is required. For every real object, including the
tenant root, the server assigns it when the object is created. It is read-only and remains unchanged
across writes, metadata or grant changes, renames, and moves. Virtual projections return the
synthetic value zero (the Unix epoch).

**`attr_version`, `content_version`, and `grants_version` are monotonically increasing `uint64`
values.** They are positive, may have gaps, and never wrap or reset during the object's lifetime.
Compare each field only with the same field for the same tenant and object. Attribute versions and
content versions of all directories, including virtual projections, are additionally scoped to the
session's visible namespace; they are not comparable across different sessions.

`attr_version` covers an object's attributes and extended metadata. `content_version` covers a
file's bytes, or a directory's mapping of stored entry names to object IDs, not the child attributes
included in `List` responses. `grants_version` covers the grants attached to the object itself, not
those inherited from its ancestors, so it does not track the effective `mode`.
[VERSIONS.md](VERSIONS.md) lists which operations update each version and timestamp. Comparing
versions requires a fresh authorization check; matching versions alone never grant access or confirm
that grant-dependent attributes are unchanged.

Virtual `root` returns the stored tenant root's real ID, attributes, and versions, with the mode
described above. Clients must refresh the listing of virtual `shared` through `List`. No version
comparison replaces authorization or confirms cached visibility.

`Attr.store_version` is a nonnegative FDB `int64` version: the read snapshot for reads, or the
successful commit for mutations. Authorization and attributes are read in the same transaction.
Versions order store states within a tenant, may repeat or have gaps, and are not timestamps;
responses can arrive out of order. This field does not replace `attr_version` or `content_version`
for detecting object changes.

## Authorization and common limits

The master key is configured at startup through `DFS_MASTER_KEY` (or `--master-key`) and must contain
64 visible ASCII characters. Every RPC supplies its bearer, including when reusing a connection.
The master key is checked against its configured hash in memory. Successful tenant authentication is
cached by key hash across all connections served by the API instance for 30 seconds. Cache hits do
not extend expiry; the next call after expiry authenticates against FDB again. A connection may carry
several different credentials. Tenant keys currently have no rotation or revocation API; immediate
invalidation would require clearing these caches across API instances. Session authentication requires
an existing tenant and caches both for at most 30 seconds, capped by session expiry; hits never extend
expiry. Revocation may take 30 seconds to block new RPCs across servers; admitted RPCs may finish.
Refresh checks session and tenant state directly in FDB.

Every RPC request and response is limited to 4 MiB (4,194,304 bytes) of uncompressed protobuf
payload, including encoding overhead. Response budgets include all results, attributes, metadata,
errors, and cursors. gRPC framing and transport headers are excluded. Servers reject oversized
requests before executing them; tighter per-message and field limits also apply.

These budgets bound RPC work alongside FDB's separate affected-data transaction limit. Fitting the
protobuf budget does not guarantee that an operation fits the store's transaction budget.

Filesystem and search calls derive the tenant and subject set exclusively from the active session.
The tenant key holder asserts the session's subjects, such as `u:<userSId>` and `g:<groupSId>`.
Subjects are opaque, case-sensitive strings matched exactly; the server does not resolve group
membership or infer additional subjects. Sessions contain subjects, not grants or permission masks.

Object grants have two variants:

```text
Grant = allow(AllowGrant) | deny(DenyGrant)

AllowGrant {
  subject: string                // Exact subject to match against the session's subjects.
  mode: uint32                   // Permissions to add: r=4, w=2; restricted to 0o6.
}

DenyGrant {
  mode: uint32                   // Inherited permissions to remove for everyone; restricted to 0o6.
}
```

ALLOW requires a nonempty subject. DENY has no subject and applies to every session. A grant must
select exactly one variant. Modes use only the POSIX read/write bits: `r=0o4`, `w=0o2`, and
`rw=0o6`. Zero is valid and leaves permission bits unchanged; bits outside `0o6`, including the
execute bit (`0o1`), are invalid. `Attr.mode` reports the resulting read/write permissions in the
POSIX owner bits and adds execute/traverse only for readable directories, as described above.

Grants inherit from the stored tenant root down to the target object. Start with no permissions.
At each object, remove inherited permissions covered by any DENY grants attached there, then add
the modes of all local ALLOW grants whose subjects match the session:

```text
effective_mode = 0
For each object from the tenant root through the target:
  allow_mode = bitwise OR of matching ALLOW modes attached to this object
  deny_mode = bitwise OR of all DENY modes attached to this object
  effective_mode = (effective_mode & (~deny_mode & 0o6)) | allow_mode
```

DENY removes only inherited permissions. A matching ALLOW at the same object wins over DENY,
independent of attachment order. An ALLOW at the same object or deeper can restore denied
permissions; evaluation must continue even when the inherited mode is zero. An ALLOW for a different
subject has no effect. Direct object IDs and `/shared` use the same evaluation against the real
ancestor chain, including grants above the visible entry point.

For example, ALLOW `u:y r` on `/parent` lets Y read and traverse that directory. Attach both DENY
`rw` and ALLOW `u:x r` to `/parent/child`: the DENY clears inherited access, then the ALLOW grants
X read/traverse access. With these grants, only sessions matching X can read the child; Y retains
access to the parent. Descendants inherit the child's resulting permissions.

For example, after ALLOW `g:engineering rw` on `/project`, DENY `w` on `/project/archive` leaves
matching sessions with `r`: the subtree can be read and traversed but not modified. DENY `rw` on
`/project/private` removes all access. ALLOW `u:<userSId> r` on `/project/private/reports` restores
read/traverse access there for that subject, with inheritance to its descendants. The inaccessible
parent stays hidden; the reopened entry point can be discovered through `/shared`.

The server enforces grant permissions on every call. Mount/client checks of the session's
`Attr.mode` do not replace server authorization. Required grant permissions are:

| Operation | Required effective permissions |
| --- | --- |
| `Stat`, `Read`, `ReadFiles` | `r` on each target. |
| `Lookup` | `r` on the parent and returned child. |
| `List` | `r` on the directory; only children with `r` are returned. |
| `Search` | `r` on each hit and supplied scope directory. |
| create | `r+w` on the parent. |
| update, write | `r+w` on the target. |
| move | `r+w` on the source and target directories; `r` on the moved object. |
| remove | `r+w` on the target and its parent. |

Namespace permissions are checked on each participating object using its effective read/write
permissions. Directory traversal follows read access; there is no separate execution permission or
file-execution RPC. Virtual root/shared support namespace reads, with permissions checked separately
on real entries. Virtual shared remains read-only. Namespace mutations at virtual root resolve the
authenticated tenant's stored root on the server and enforce the session's effective grant
permissions. Tenant administration uses its tenant key and is not restricted by object grants.

Ordinary reads conceal inaccessible objects as `NOT_FOUND`. Mutation permission failures use
`FORBIDDEN`.

Every permission check reads the target and its ancestry in the operation's FDB transaction.
Local tree hints schedule reads and reuse grants only when the freshly read `grants_version`
matches. Search indexing has independent lag.

Keys are opaque 64-character bearer strings. A tenant key authorizes administration for that tenant;
filesystem calls require a session key. Tenant IDs contain 1–256 UTF-8 bytes without NUL. Subject
strings contain 1–1,024 UTF-8 bytes.

Stored basenames contain 1–255 UTF-8 bytes, exclude `/` and NUL, and cannot be `.` or `..`. MIME types
may be absent or empty; nonempty values must be valid and at most 255 bytes. Xattr names contain
1–255 bytes without NUL; combined xattr key/value bytes are limited to 32 KiB.

## Tenants and sessions

### CreateTenant

Creates a tenant with an empty root directory. Requires the **master key**.
The root directory starts without a MIME type.

**Arguments**

```text
CreateTenantRequest {
  tenant_id: string
  root_grants: Grant[]           // At most 512 distinct grant values.
}
```

**Returns**

```text
Tenant {
  tenant_id: string
  root_id: ObjectId              // Real root directory, not the virtual root projection.
  tenant_key: string             // Bearer key for this tenant's administration.
}
```

The supplied grants are attached to the root and inherit to future descendants. Identical grant
values are deduplicated. An existing tenant ID fails with `ALREADY_EXISTS`.
The tenant, root object, and initial grants are committed together; invalid grants create none of them.

### CreateSession

Creates a session with a fixed subject set in the tenant identified by the **tenant key**.
The tenant is derived exclusively from the authenticated key; the request does not accept a tenant ID.

**Arguments**

```text
CreateSessionRequest {
  subjects: string[]             // At most 512 distinct subjects asserted by the tenant key holder.
}
```

**Returns**

```text
Session {
  id: string                    // Session identifier used for revocation, not a bearer credential.
  tenant_id: string
  subjects: string[]             // Deduplicated session subjects.
  session_key: string            // Bearer key for filesystem and search calls.
  expires_at: Timestamp          // Session expiration time in Unix milliseconds.
}
```

Clients address the virtual `root`; the server resolves the stored root directory from the session's
tenant. The root directory ID belongs to tenant state, not session state.

Subjects may be included before any ALLOW grants reference them. Sessions are stored in FoundationDB
and survive server restarts. They initially expire after one hour; an active session can extend its
expiry through `RefreshSession`. Its subject set is fixed; create a new session to change subjects.
Expired sessions fail authentication immediately and are removed asynchronously by periodic cleanup.

### CurrentSession

Returns information about the authenticated session. Requires the **session key**.

**Arguments:** `Empty {}`.

**Returns:** `Session`, with the fields defined above. `session_key` is an empty string; this call
never reissues the credential. The session's subject set and expiration are unchanged.
The response may reflect cached state for up to 30 seconds after a refresh on another server.

### RevokeSession

Revokes a session in the tenant identified by the **tenant key**. The tenant is derived exclusively
from the authenticated key; the request does not accept a tenant ID or require the session key.

**Arguments**

```text
RevokeSessionRequest {
  session_id: string             // Nonempty identifier returned by CreateSession.
}
```

**Returns:** `Empty {}` after the session and its indexes are removed from FDB.
Servers may continue admitting RPCs through cached session state for up to 30 seconds after
revocation commits. After that window, calls using the session key fail authentication. Already
admitted RPCs may finish.
Unknown sessions and sessions belonging to another tenant return `NOT_FOUND`. A concurrent refresh
cannot undo revocation.

### RefreshSession

Extends the authenticated session's expiry. Requires an active **session key**.

**Arguments:** `Empty {}`.

**Returns:** `Session`, with `expires_at` set to `max(current_expires_at, server_now + 3_600_000)` in
Unix milliseconds. Refresh never shortens expiry, and repeated refreshes do not accumulate an extra
hour each time. The session ID, tenant, subjects, and bearer key stay unchanged; `session_key` is an
empty string in the response, as with `CurrentSession`.

Expired or revoked sessions fail with `UNAUTHENTICATED`; refresh cannot revive them. Create a new
session with the tenant key instead.

## Grant management

### ListGrants

Lists explicit grants attached to one object in the tenant identified by the **tenant key**.
The tenant is derived exclusively from the authenticated key; the request does not accept a tenant ID.

**Arguments**

```text
ListGrantsRequest {
  object_id: ObjectId
  after?: string                 // Opaque exclusive cursor; omit for the first page.
  limit: uint32                  // Required, from 1 to 512.
}
```

**Returns**

```text
GrantPage {
  grants: Grant[]                // Explicit ALLOW and DENY attachments in stable order.
  next_after?: string            // Absent when there are no more pages.
}
```

Inherited grants are excluded. Grants are ordered by variant (ALLOW before DENY), then by subject
in UTF-8 byte order for ALLOW, then by numeric mode. Pass `next_after` unchanged as the next request's
`after`; clients must not construct cursors from subject names.
Cursors are scoped to the tenant and object. Malformed or mismatched cursors fail with `INVALID_INPUT`.
A missing object, including an object from another tenant, fails with `NOT_FOUND`.

### UpdateGrants

Atomically attaches or detaches grants on one object in the tenant identified by the **tenant key**.
The tenant is derived exclusively from the authenticated key; the request does not accept a tenant ID.

**Arguments**

```text
UpdateGrantsRequest {
  object_id: ObjectId
  changes: GrantUpdate[]         // At most 512 changes, with unique grant values.
}

GrantUpdate {
  grant: Grant
  remove: bool                   // True detaches the grant; false attaches it.
}
```

**Returns:** `Empty {}` on success. Failures follow the [error rules](#errors) and commit no partial
grant changes. The tenant key provides no session context, so this operation does not return `Attr`.
A missing object, including an object from another tenant, fails with `NOT_FOUND`.

A grant's identity is its complete value: variant, subject for ALLOW, and mode. A request cannot
repeat the same grant value, even with different `remove` flags. Multiple ALLOW modes for the same
subject, or multiple DENY modes, are combined as described above. To change a mode, detach the old
grant and attach the new one in the same request. Attaching an existing value or detaching an absent
value leaves the grant set unchanged.

Attachments not included in `changes` remain unchanged. Detaching an ancestor grant does not remove
independent attachments below it. Permission checks use their transaction's view of committed grants;
conflicting mutations retry their checks before committing.

## Filesystem reads

All calls in this section require a **session key**.

### Stat

Reads attributes for a batch of objects, optionally including extended metadata.
Virtual projections are supported.

**Arguments**

```text
StatRequest {
  object_ids: ObjectRef[]        // From 1 to 4096 references.
  include_metadata?: bool       // Defaults to false; true includes ExtendedMetadata.
}
```

**Returns**

```text
AttrBatch {
  results: AttrResult[]          // One result per input, in the same order.
}

AttrResult {
  object?: Attr                  // Present on success.
  error?: ErrorDetails           // Present on failure, instead of object.
}
```

Results correspond to inputs by position, including repeated inputs. Each successful result
identifies the object in `object.id` and the shared FDB snapshot in `object.store_version`.
An individual missing or inaccessible object does not prevent results for the other IDs. With
`include_metadata=true`, each successful result populates `object.metadata` from the same FDB snapshot
as its attributes. Virtual projections return synthetic metadata with MIME type `inode/directory`,
an empty xattr map, and `created: 0`. With the flag omitted or false, extended metadata is not
returned.

Clients recheck access and cached versions through `Stat`, normally with metadata omitted. Compare
`attr_version` and `content_version` independently to decide which cached state to refresh. Matching
versions do not authorize writes or establish current grant-dependent visibility; refresh listings
through `List`, always for `shared`.

The encoded response is limited to 4 MiB. If requested metadata would exceed that budget, the RPC
fails with `CAPACITY`; retry with fewer IDs. Metadata is never silently omitted from a successful
result when requested.

### Lookup

Resolves a batch of immediate children by parent and name, optionally including extended metadata.

**Arguments**

```text
LookupRequest {
  targets: LookupTarget[]       // From 1 to 256 parent/name pairs.
  include_metadata?: bool       // Defaults to false; true includes ExtendedMetadata.
}

LookupTarget {
  parent_id: ObjectRef           // Real directory, virtual root, or virtual shared.
  name: string                  // Child basename, not a path.
}
```

**Returns**

```text
AttrBatch {
  results: AttrResult[]          // One result per target, in the same order.
}
```

Each target is resolved independently. A missing or inaccessible child produces `NOT_FOUND` in its
result without preventing other results. For each real parent, the caller must have access to that
directory. Results use the same attribute/error shape, per-object store versions, metadata option,
and 4 MiB response budget as `Stat`.

A missing or unreadable parent also produces `NOT_FOUND`, even when the child itself is readable
through an ALLOW attached to it; such entry points are reached through `shared`. `NOT_DIRECTORY` is
only returned for a readable parent that is a file. Invalid names fail their own result with
`INVALID_INPUT` or `NAME_TOO_LONG`; an invalid parent reference fails the whole request with
`INVALID_INPUT`. Under virtual `root`, the stored root's read access is not required, each child is
still checked, and the name `shared` resolves to virtual `shared`. Lookups under virtual `shared`
currently fail with `UNSUPPORTED`.

### List

Lists a directory's immediate children with their attributes.

**Arguments**

```text
ListRequest {
  directory_id: ObjectRef
  after?: string                 // Exclusive cursor; omit for the first page.
  limit: uint32                  // Required, from 1 to 4,096 entries.
}
```

**Returns**

```text
EntryPage {
  entries: Entry[]
  next_after?: string            // Absent when listing is complete.
}

Entry {
  name: string
  object?: Attr
}
```

Pages obey both the entry limit and a 4 MiB response budget. Pass `next_after` unchanged into the
next request. Ordinary directories are ordered by basename; `shared` uses object-ID cursors.
Continue until `next_after` is absent, even after an empty page.

Clients refresh cached pages through `List`. For real directories and virtual `root`,
`Attr.content_version` from `Stat` identifies topology changes to entry names and object IDs.
Unchanged versions do not confirm visibility, which grants control. Refresh through `List` to
obtain current visibility. An unchanged directory version also does not validate child attributes embedded in an old page; those require separate checks or a refetch.
Each fetched page includes current child attributes sharing the same `Attr.store_version`. Pages are
independently refreshed; traversal across pages does not promise a single snapshot, and validation
does not retroactively make independently fetched pages coherent. The same refresh behavior applies
to real directories and virtual projections. There is no separate listing token or version
precondition on `List`.

Virtual `root` exposes visible top-level entries plus `shared`. Virtual `shared` exposes readable
entry points with a matching explicit ALLOW using names suffixed with `--<object-id>`, allowing
discovery without access to their parents. DENY does not create entry points; all entry points must
pass the full root-to-object grant evaluation. This includes descendants reopened by a deeper ALLOW
below an inaccessible parent. Use returned real IDs for subsequent metadata, content, and mutation
operations.

A missing or unreadable directory fails with `NOT_FOUND`; `NOT_DIRECTORY` is only returned for a
readable file. Unreadable children are left out, so a page can hold fewer entries than `limit`, or
none. Under virtual `root`, the stored root's read access is not required, each child is still
checked, and `shared` appears in name order among the stored root's children. Listing virtual
`shared` currently fails with `UNSUPPORTED`.

### Read

Reads a byte range from a file.

**Arguments**

```text
ReadRequest {
  object_id: ObjectId
  offset: uint64                 // Zero-based byte offset.
  length: uint32                 // Maximum bytes to return, at most 1 MiB.
}
```

**Returns**

```text
ReadData {
  data: bytes
  object: Attr                   // Attributes from the same snapshot as data.
}
```

Reads stop at EOF and may return fewer bytes than requested. An offset at or beyond EOF returns
empty data; a directory fails with `IS_DIRECTORY`. Returned bytes and attributes reflect the read's
current snapshot, identified by `object.store_version`.

### ReadFiles

Reads several small files in full within a shared response budget.

**Arguments**

```text
ReadFilesRequest {
  object_ids: ObjectId[]         // From 1 to 256 IDs.
}
```

**Returns**

```text
FilesBatch {
  results: FileResult[]          // Exactly one result per input, in input order.
}

FileResult {
  object_id: ObjectId
  object?: Attr                  // Present on success together with data.
  data?: bytes                   // Whole file contents, including empty files.
  error?: ErrorDetails           // Present on failure instead of object/data.
}
```

Each input has exactly one result, in input order. Files larger than 1 MiB or that cannot fit in
the 4 MiB encoded reply budget receive individual `CAPACITY` errors without being downloaded. The
reply budget reserves conservative overhead for every result, including errors. Attributes and
contents share one FDB snapshot. All returned attributes carry the same `object.store_version`.

## Filesystem mutations

### Apply

Executes an ordered list of filesystem operations and returns all outcomes in one response.
Requires a **session key**.

**Arguments**

```text
ApplyRequest {
  operations: Operation[]        // Nonempty; subject to the 4 MiB RPC request limit.
}

Operation = create(CreateOperation)
          | update(UpdateOperation)
          | write(WriteOperation)
          | move(MoveOperation)
          | remove(RemoveOperation)
```

**Returns**

```text
OperationBatch {
  results: OperationResult[]     // Exactly one result per operation, in request order.
}

OperationResult {
  mutation?: Mutation            // Present on success, including successful removal.
  error?: ErrorDetails           // Present on failure instead of mutation.
}

Mutation {
  object?: Attr                  // Primary object after this operation; absent for removal.
  related: Attr[]                // Other returned objects affected by the operation.
}
```

Operations with overlapping targets run in request order; disjoint batches run concurrently within
one FDB transaction. All batches containing a Move are merged to prevent cycles across moves.
Later operations in a batch see earlier successful changes, allowing a request
to create a directory, create a file within it, and write that file. Transaction write budgets may
reject the request with `CAPACITY` even when its input fits. All required results and attributes are
checked against the 4 MiB encoded response budget before substituting the commit `store_version`.
If either budget is exceeded, `Apply` fails with `CAPACITY` before committing any changes.

Each operation must finish filesystem validation before staging any writes. A validation failure
records that operation's error without changing state; later operations continue. All successful
operations commit together. Storage or commit failures affect the entire transaction attempt and
cannot be reported as isolated operation failures. No results are returned before commit.

Returned attributes reflect state immediately after each operation; later operations do not rewrite
earlier results. Clients process successful results in request order, keeping the latest attributes
and applying removals. Create and removal return their updated parent in `mutation.related`;
Move returns each distinct parent.
Invalidate cached attributes for affected parents omitted from results, and affected listing pages.

Every attribute returned in `mutation.object` or `mutation.related` across the batch carries the
same `Attr.store_version`: the batch's commit version, or the transaction's read version when no
stored changes were made. This identifies the batch commit, not a snapshot of each intermediate
result. A successful mutation returning no attributes carries no store version.

Accepted work continues after disconnection, so a lost response does not prove a mutation failed.
The request has no idempotency key; callers must not blindly replay operations with uncertain outcomes.
Internal FDB retries reuse one receipt for the whole batch, returning its original results after commit.

The following operations are variants within `Apply`, not separate RPCs. Each produces the
`OperationResult` described above.

### create operation

Creates an empty file or directory under an authorized real directory.

**Arguments**

```text
CreateOperation {
  parent_id: ObjectId
  name: string
  object_id: ObjectId            // Caller-supplied UUIDv7, at most five minutes old.
  kind: ObjectKind               // FILE or DIRECTORY; SYMLINK fails with UNSUPPORTED.
  mime_type?: string             // Omitted or empty stores None.
  xattrs: map<string, bytes>
}
```

**Successful result:** `mutation.object` contains the created object's attributes and
`mutation.related` contains its updated parent's attributes. Name or ID collisions fail with
`ALREADY_EXISTS`.
The name `shared` is reserved directly under the tenant root, where virtual `shared` lives: creating
it there fails with `ALREADY_EXISTS`. Deeper directories accept it.

### update operation

Applies a metadata patch to an authorized object. Omitted optional fields remain unchanged.

**Arguments**

```text
UpdateOperation {
  object_id: ObjectId
  mime_type?: string             // Omitted leaves unchanged; "" clears it and stores None.
  xattrs: XattrChange[]           // Changes to individual keys; not a full replacement map.
  atime?: Timestamp
  mtime?: Timestamp
  size?: uint64                  // Truncates or extends a regular file.
}

XattrChange {
  name: string
  value?: bytes                  // Omitted removes the key; present empty bytes set an empty value.
}
```

**Successful result:** `mutation.object` contains the object's attributes after the update.
The requested changes form one operation: a validation failure applies none of that patch. Growing
a file with `size` exposes zero-filled bytes; truncation discards data beyond the new size.
Xattr changes apply in order. Explicit `mtime` overrides the automatic resize timestamp.

### write operation

Writes bytes to an authorized regular file, extending it when needed.

**Arguments**

```text
WriteOperation {
  object_id: ObjectId
  offset: uint64                 // Zero-based byte offset; ignored when append is true.
  data: bytes                    // Must fit the overall Apply request budget.
  append: bool                   // True chooses the current EOF atomically.
}
```

**Successful result:** `mutation.object` contains the file's attributes after the write.
Sparse gaps read as zeroes. Append observes earlier successful operations in the same request.
An overflowing end offset fails with `INVALID_INPUT`. Empty writes leave size unchanged but still
advance versions and timestamps as specified in [VERSIONS.md](VERSIONS.md).

### move operation

Moves or renames an object while preserving its identity.

**Arguments**

```text
MoveOperation {
  object_id: ObjectId            // Object to move or rename.
  parent_id: ObjectId            // Source directory.
  target_id?: ObjectId           // Destination directory; defaults to parent_id.
  name: string                  // Destination basename.
}
```

**Successful result:** `mutation.object` contains the moved object's attributes after the move.
`mutation.related` contains the updated source and target directories, once each.
The object's current parent must match `parent_id` in the transaction, otherwise `NOT_FOUND`.
An occupied destination fails with `ALREADY_EXISTS`, except when renaming an object to its current
name. Moving a directory into itself or a descendant fails with `INVALID_INPUT`. Moving the tenant
root fails with `FORBIDDEN`; the name `shared` remains reserved under it.

### remove operation

Removes an authorized file or empty directory from its accessible parent.

**Arguments**

```text
RemoveOperation {
  object_id: ObjectId
  parent_id: ObjectId             // Current parent directory.
  kind: ObjectKind               // Must match the object's kind.
}
```

**Successful result:** `mutation` is present, with no `object` attributes. Its `related` field
includes the parent's attributes after removal. Nonempty directories fail with `NOT_EMPTY`;
recursive deletion requires explicitly removing descendants first. Removing the tenant root fails
with `FORBIDDEN`.
The object's current parent must match `parent_id` in the transaction, otherwise `NOT_FOUND`.

## Search

### Search

Searches visible files and directories. Requires a **session key**.

**Arguments**

```text
SearchRequest {
  query: string                  // Plain text, at most 4,096 UTF-8 bytes.
  fields: SearchField[]          // NAME and/or CONTENT; empty defaults to both.
  scope?: SearchScope            // Omitted searches across the session's visible tenant objects.
  filter?: SearchFilter
  limit?: uint32                 // From 1 to 100; defaults to 20.
}

SearchField = NAME | CONTENT

SearchScope {
  directory_id: ObjectId         // Must be an authorized real directory.
  recursive?: bool              // Defaults to true; false selects immediate children only.
}

SearchFilter {
  kind?: ObjectKind
  name?: string                 // Exact basename.
  name_prefix?: string          // Exact basename prefix.
  mime_types: string[]           // OR within the list, at most 32 values.
  min_size?: uint64              // Inclusive lower bound.
  max_size?: uint64              // Inclusive upper bound.
  modified_after?: Timestamp    // Inclusive lower mtime bound.
  modified_before?: Timestamp   // Inclusive upper mtime bound.
  xattrs: SearchXattr[]          // At most 64 predicates, combined with AND.
}

SearchXattr {
  name: string
  value?: bytes                 // Omitted means existence; present means byte-exact equality.
}
```

**Returns**

```text
SearchResults {
  hits: SearchHit[]              // At most limit hits.
  partial: bool                 // Whether bounded evaluation stopped before finishing.
}

SearchHit {
  object: SearchAttr
  excerpt?: string              // File excerpt, at most 512 characters; absent for directories.
}

SearchAttr {
  id: ObjectId
  name: string                   // Stored basename; empty for the stored tenant root.
  kind: ObjectKind
  size: uint64                   // Logical file size; zero for directories.
  atime?: Timestamp
  mtime?: Timestamp
  ctime?: Timestamp
  metadata?: ExtendedMetadata
}
```

Each hit carries simplified attributes in `object`, using the same name, size, timestamp, and
metadata semantics as `Attr`. Extended metadata is optional. Neither search results nor individual
hits expose a `store_version`: the search index's state is independent of the store's read snapshot.
Search attributes also omit mode and attribute, content, and grants versions and cannot validate cached
attributes or permissions. Use `Stat` to fetch full attributes and versions.

An empty or whitespace-only query searches metadata only. Nonempty text matches any normalized
token in the selected fields, combined with OR. Content-only selection excludes directories.
Directories match their own name and metadata. Scope excludes the directory itself; virtual
projections are not indexed.

Filter fields combine with AND. MIME/size predicates select files and cannot be combined with
`kind=DIRECTORY`. A present empty xattr value matches empty bytes, rather than testing existence.

Search uses Elasticsearch and returns `UNAVAILABLE` when it is disabled or unavailable. Indexing is
asynchronous; deleted objects and stale indexed content or metadata are suppressed before results
are returned, and every hit is permission-checked. The server checks indexed names and metadata
separately from indexed content freshness. Unsupported content formats remain searchable by
name/metadata. Results have no public cursor, score, or total-hit count.

Evaluation is bounded to 4,096 candidates, a ten-second retrieval budget, and a 1 MiB response.
`partial` indicates bounded evaluation, not whether indexing is current. Backend failures are errors,
not successful empty results.

## Errors

Application failures, including authentication rejections, carry a gRPC status with protobuf
`ErrorDetails { code }` in its details. Failures generated by the transport or gRPC framework may omit
`ErrorDetails`. Examples include:

- Protobuf decoding failures, including invalid object IDs: gRPC `INTERNAL`.
- Transport message-size rejections: gRPC `OUT_OF_RANGE`.
- Unsupported compression: gRPC `UNIMPLEMENTED`.

Clients handle any failure using the gRPC status when details are absent. Individual batch failures
always carry `ErrorDetails`. Stable protocol codes are `INTERNAL`,
`INVALID_INPUT`, `NOT_FOUND`, `FORBIDDEN`, `UNAUTHENTICATED`, `ALREADY_EXISTS`, `NOT_DIRECTORY`,
`IS_DIRECTORY`, `NOT_EMPTY`, `CAPACITY`, `UNAVAILABLE`, `UNSUPPORTED`, and `NAME_TOO_LONG`.

## Future work

If search uses a full in-memory tree index instead of fan-out writes for indexed parents and grants,
we may add `auth_version` to identify that index's authorization snapshot separately from
`store_version`. See [storage future work](STORAGE.md#full-in-memory-tree-index).

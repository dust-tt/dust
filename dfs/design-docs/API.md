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
  with `Stat`, `Lookup`, `List`, and `Validate`. Other operations require a real `ObjectId`.
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
  attr_version: uint64           // Version of attributes and metadata; excludes grant changes.
  content_version: uint64        // Version of bytes or directory entries; excludes grant changes.
  view: ReadView                 // Store and authorization versions for these attributes.
  metadata?: ExtendedMetadata    // Present when extended metadata was requested.
}

ExtendedMetadata {
  created: Timestamp             // Creation time; Unix epoch for virtual projections.
  mime_type: string
  xattrs: map<string, bytes>
}

ReadView {
  store_version: int64           // Monotonically increasing store snapshot/commit version.
  auth_version: int64            // Monotonically increasing authorization-state version.
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

Whenever extended metadata is returned, `created` is required. For every real object, including the
tenant root, the server assigns it when the object is created. It is read-only and remains unchanged
across writes, metadata or grant changes, renames, and moves. Virtual projections return the
synthetic value zero (the Unix epoch).

**`attr_version` and `content_version` are monotonically increasing `uint64` values.** They are
positive, may have gaps, and never wrap or reset during the object's lifetime. Compare each field
only with the same field for the same tenant and object. Attribute versions and content versions of
all directories, including virtual projections, are additionally scoped to the session's visible
namespace; they are not comparable across different sessions.

`attr_version` advances when stored attributes or extended metadata change, including size,
timestamps, MIME type, xattrs, the object's own name, and its stored parent. Renames and moves advance
it even when file contents are unchanged. Grant changes never advance `attr_version`, even when
grants on the object or its ancestors change the reported mode. Comparing `attr_version` requires a
fresh authorization check; matching versions alone never grant access or confirm that grant-dependent
attributes are unchanged.
Fetching optional metadata or returning a newer `ReadView` does not itself change `attr_version`.
The version fields themselves are excluded from attribute-change detection, avoiding recursive
version bumps. Content mutations advance `attr_version` whenever they change size or timestamps.

For a regular file, `content_version` starts at 1 and advances atomically with nonempty writes and
changes to file size, including truncation and extension. A nonempty write advances it even when the
supplied bytes equal the existing bytes. Mode, timestamps, MIME type, xattrs, grants, renames, and
moves do not advance it.

For a real directory, `content_version` starts at 1 and advances atomically whenever its stored
immediate entries change: a child is created, removed, renamed, moved in or out, or replaced by
another object under the same name. It covers the mapping of stored entry names to object IDs, not
the child attributes included in `List` responses. Grant changes never advance it, even when they
change which entries are visible to the session. Editing a child's contents or attributes alone does
not advance its parent's `content_version`. Renaming or moving the directory itself advances its
`attr_version` and the affected parents' `content_version`; it leaves its own `content_version`
unchanged when its entries are unchanged.

Virtual `root` and `shared` also return positive content versions that advance when topology changes
their entry mappings. Grant changes never advance them, even when they change visible membership.
These versions must preserve their ordering across servers and restarts for the same session view.
No version comparison replaces authorization, validates cached visibility, or establishes a snapshot
across listing pages.

**Both `ReadView.store_version` and `ReadView.auth_version` are monotonically increasing within a
tenant.** Each is a nonnegative `int64`: as its respective state advances, its version increases
and never resets or wraps. Repeated observations of the same snapshot may return the same version;
versions may have gaps and are not timestamps or counts of operations. Compare each field only with
the same field for the same tenant.

Monotonicity describes the ordering of states, not response arrival order. Responses can arrive out
of order, and different authorization replicas can serve different versions within the allowed
freshness bound.

For reads, `store_version` identifies the store snapshot supplying the response. For mutations, it
identifies the successful commit. `Attr.view` carries both versions with an individual object's
attributes. `auth_version` identifies the permission and topology state used to authorize the
operation, whether served from the RAM tree or the store fallback. The two fields do not promise a
common snapshot, and a mutation response does not imply the RAM tree has applied that mutation yet.
Neither field replaces `attr_version` or `content_version` for detecting changes to an object's
attributes or contents.

Authorization versions must use one tenant-wide ordering across server instances, restarts, tree
rebuilds, and store fallback. A process-local counter that resets on restart, or unrelated counters
for RAM and fallback, cannot implement this contract. The same authorization snapshot must retain
its version whichever instance or authorization path serves it; equal versions identify the same
authorization state.

## Authorization and common limits

Every RPC request and response is limited to 4 MiB (4,194,304 bytes) of uncompressed protobuf
payload, including encoding overhead. Response budgets include all results, attributes, metadata,
errors, and cursors. gRPC framing and transport headers are excluded. Servers reject oversized
requests before executing them; tighter per-message and field limits also apply.

These budgets bound RPC work alongside FDB's separate affected-data transaction limit. Fitting the
protobuf budget does not guarantee that an operation fits the store's transaction budget.

Filesystem and search calls derive the tenant and subject set exclusively from the active session.
The tenant key holder asserts the session's subjects, such as `u:spolu@dust.tt` and `g:engineering`.
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
`/project/private` removes all access. ALLOW `u:spolu@dust.tt r` on `/project/private/reports` restores
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
| `Validate` | `r` on each target. |
| create | `w` on the parent. |
| update, write | `w` on the target. |
| rename | `w` on the source, any replacement, and affected parents. |
| remove | `w` on the target and its parent. |

Namespace permissions are checked on each participating object using its effective read/write
permissions. Directory traversal follows read access; there is no separate execution permission or
file-execution RPC. Virtual root/shared support namespace reads, with permissions checked separately
on real entries. Virtual shared remains read-only. Namespace mutations at virtual root resolve the
authenticated tenant's stored root on the server and enforce the session's effective grant
permissions. Tenant administration uses its tenant key and is not restricted by object grants.

Ordinary reads conceal inaccessible objects as `NOT_FOUND`; `Validate` can report `DENIED`
explicitly. Mutation permission failures use `FORBIDDEN`.

The server may authorize through a complete permission tree up to 30 seconds old by default. Expired
or unusable tree proofs fall back to current FDB authorization. File metadata/content reads use FDB;
search indexing has independent lag.

Keys are opaque 64-character bearer strings. A tenant key authorizes administration for that tenant;
filesystem calls require a session key. Tenant IDs contain 1–256 UTF-8 bytes without NUL. Subject
strings contain 1–1,024 UTF-8 bytes.

Stored basenames contain 1–255 UTF-8 bytes, exclude `/` and NUL, and cannot be `.` or `..`. MIME types
must be valid and at most 255 bytes. Xattr names contain 1–255 bytes without NUL; combined xattr
key/value bytes are limited to 32 KiB.

## Tenants and sessions

### CreateTenant

Creates a tenant with an empty root directory. Requires the **server key**.

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

### CurrentSession

Returns information about the authenticated session. Requires the **session key**.

**Arguments:** `Empty {}`.

**Returns:** `Session`, with the fields defined above. `session_key` is an empty string; this call
never reissues the credential. The session's subject set and expiration are unchanged.

### RevokeSession

Revokes a session in the tenant identified by the **tenant key**. The tenant is derived exclusively
from the authenticated key; the request does not accept a tenant ID or require the session key.

**Arguments**

```text
RevokeSessionRequest {
  session_id: string             // Nonempty identifier returned by CreateSession.
}
```

**Returns:** `Empty {}` after admitted mutations finish and the session is invalidated.
Revocation prevents new admissions; subsequent calls using that session key fail authentication.
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

A grant's identity is its complete value: variant, subject for ALLOW, and mode. A request cannot
repeat the same grant value, even with different `remove` flags. Multiple ALLOW modes for the same
subject, or multiple DENY modes, are combined as described above. To change a mode, detach the old
grant and attach the new one in the same request. Attaching an existing value or detaching an absent
value is a no-op.

Attachments not included in `changes` remain unchanged. Detaching an ancestor grant does not remove
independent attachments below it. Permission changes, including DENY, are subject to the
authorization freshness bound described above; they do not promise immediate revocation.

## Filesystem reads

All calls in this section require a **session key**.

### Stat

Reads attributes for a batch of objects, optionally including extended metadata.
Virtual projections are supported.

**Arguments**

```text
StatRequest {
  object_ids: ObjectRef[]        // From 1 to 256 references.
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
identifies the object in `object.id` and carries its read view in `object.view`; the batch has no
separate view.
An individual missing or inaccessible object does not prevent results for the other IDs. With
`include_metadata=true`, each successful result populates `object.metadata` from the same FDB snapshot
as its attributes. Virtual projections return synthetic metadata with MIME type `inode/directory`,
an empty xattr map, and `created: 0`. With the flag omitted or false, extended metadata is not returned;
`attr_version` still covers it.

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
directory. Results use the same attribute/error shape, per-object read views, metadata option, and
4 MiB response budget as `Stat`.

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

Clients refresh cached pages through `List`. A directory's `Attr.content_version`, obtained through
`Stat`, identifies topology changes to its entry names and object IDs. `Validate` can check those
bindings, but an unchanged version does not confirm cached entry visibility: grants can change
visibility without changing the version. Refresh through `List` to obtain current visibility. An
unchanged directory version also does not validate child attributes embedded in an old page; those
require separate checks or a refetch. Each fetched page includes current child attributes sharing
the same `Attr.view` for that request; the page has no separate view. Pages are independently
refreshed; traversal across pages does not promise a single snapshot, and validation does not
retroactively make independently fetched pages coherent. The same refresh behavior applies to real
directories and virtual projections. There is no separate listing token or version precondition on
`List`.

Virtual `root` exposes visible top-level entries plus `shared`. Virtual `shared` exposes readable
entry points with a matching explicit ALLOW using names suffixed with `--<object-id>`, allowing
discovery without access to their parents. DENY does not create entry points; all entry points must
pass the full root-to-object grant evaluation. This includes descendants reopened by a deeper ALLOW
below an inaccessible parent. Use returned real IDs for subsequent metadata, content, and mutation
operations.

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
current snapshot, identified by `object.view`.

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
reply budget accounts for every result, including errors. Attributes and contents share one FDB
snapshot. All returned attributes carry the same `object.view`; the batch has no separate view.

### Validate

Rechecks access and compares cached attribute and/or content versions for files, directories, and
virtual projections.

**Arguments**

```text
ValidateRequest {
  checks: VersionCheck[]         // From 1 to 256 checks.
}

VersionCheck {
  object_id: ObjectRef
  attr_version?: uint64          // Positive version of cached attributes and extended metadata.
  content_version?: uint64       // Positive version of cached bytes or directory entries.
}
```

Each check must supply at least one version; it may supply either version alone or both. An omitted
version is not compared. A check with neither version, or with any supplied version equal to zero,
rejects the request with `INVALID_INPUT`.

**Returns**

```text
ValidationBatch {
  results: ValidationResult[]    // One result per check, in the same order.
  view: ReadView
}

ValidationResult {
  outcome: UNCHANGED | CHANGED | DENIED | MISSING | ERROR
  error?: ErrorDetails           // Details for denied, missing, or erroneous checks.
}
```

Authorization is checked before comparing versions. Both versions, when supplied, are compared
against the same current object view.

Valid checks on virtual `shared` always return `CHANGED`, even when the supplied versions match.
This applies to attribute-only checks, content-only checks, and checks of both versions. Grants can
change shared membership without advancing its `content_version`; clients must refresh its listing
through `List`. Returning `CHANGED` does not require a version bump.

For other existing, authorized objects:

| Supplied versions | `UNCHANGED` when | `CHANGED` when |
| --- | --- | --- |
| `attr_version` only | The attribute version matches. | The attribute version differs. |
| `content_version` only | The content version matches. | The content version differs. |
| Both | Both versions match. | Either or both versions differ. |

`UNCHANGED` renews read access and validates only the supplied versions; it does not authorize
writes. Every mutation must independently check its required grant permissions. An attribute check
covers the object's stored attributes and extended metadata, excluding mode changes caused by
grants. A content check covers file bytes or a directory's entry-name/object-ID bindings, excluding
visibility changes caused by grants. Refresh through `Stat` or `Lookup` for
current grant-dependent attributes and through `List` for current entry visibility; `UNCHANGED` does
not validate either from cached versions. An attribute-only check does not validate content or a
cached `content_version`; a content-only check does not validate attributes or extended metadata.
Even when both versions of a directory match, the attributes and contents of its children require
their own checks. Session-scoped versions must come from the same session view.

`CHANGED` does not identify which supplied version differed. Refresh the relevant state through
`Stat`, `Read`/`ReadFiles`, or `List`; checking both versions does not necessarily require downloading
file bytes again if a fresh `Stat` shows the content version still matches. `DENIED` means access is
not allowed, `MISSING` means the object is absent, and `ERROR` covers other check failures. These
outcomes take precedence over version comparisons. A backend failure can fail the entire RPC rather
than establish freshness for only part of the batch.

## Filesystem mutations

### Apply

Executes an ordered list of filesystem operations and returns all outcomes in one response.
Requires a **session key**.

**Arguments**

```text
ApplyRequest {
  operations: Operation[]        // Nonempty; encoded request is at most 1 MiB.
}

Operation = create(CreateOperation)
          | update(UpdateOperation)
          | write(WriteOperation)
          | rename(RenameOperation)
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
  object?: Attr                  // Primary object, if it survives the complete request.
  related: Attr[]                // Other returned objects affected by the operation.
}
```

Operations run in order within one FDB transaction, including operations on different objects.
Later operations see earlier successful changes, so a request may create a directory, create a file
within it, and write that file. Transaction write budgets may reject the request with `CAPACITY`
even when its input fits. All required results and final attributes must fit within the 4 MiB
encoded response budget. If the transaction or response budget cannot be met, `Apply` fails with
`CAPACITY` before committing any changes.

Each operation must finish filesystem validation before staging any writes. A validation failure
records that operation's error without changing state; later operations continue. All successful
operations commit together. Storage or commit failures affect the entire transaction attempt and
cannot be reported as isolated operation failures. No results are returned before commit.

Returned attributes reflect the final committed state, rather than an intermediate state after
each operation. Removed objects have no returned attributes. Removal returns the surviving parent's
attributes in `mutation.related`. Other operations may omit parents changed only by listing
membership and its associated version bookkeeping; clients must invalidate omitted parents' cached
attributes and listing pages. Attribute and content versions follow the shared rules above and
advance atomically with their corresponding changes.

Every attribute returned in `mutation.object` or `mutation.related` across the batch carries the
same `Attr.view`: `store_version` is the batch's commit version, and `auth_version` is the
authorization-state version used by the committed attempt. For an attempt with no stored changes,
`store_version` is the snapshot version checked by that attempt. A successful mutation returning no
attributes carries no view.

Accepted work continues after disconnection, so a lost response does not prove a mutation failed.
The request has no idempotency key; callers must not blindly replay operations with uncertain outcomes.

The following operations are variants within `Apply`, not separate RPCs. Each produces the
`OperationResult` described above.

### create operation

Creates an empty file or directory under an authorized real directory.

**Arguments**

```text
CreateOperation {
  parent_id: ObjectId
  name: string
  object_id: ObjectId            // Fresh UUIDv7 supplied by the caller.
  kind: ObjectKind               // FILE or DIRECTORY; SYMLINK fails with UNSUPPORTED.
  mime_type?: string             // Defaults to inode/directory or application/octet-stream.
  xattrs: map<string, bytes>
}
```

**Successful result:** `mutation.object` contains the created object's final attributes, unless a
later operation in the same request removes it. Name or ID collisions fail with `ALREADY_EXISTS`.

### update operation

Applies a metadata patch to an authorized object. Omitted optional fields remain unchanged.

**Arguments**

```text
UpdateOperation {
  object_id: ObjectId
  mime_type?: string
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

**Successful result:** `mutation.object` contains the object's final attributes if it survives.
The requested changes form one operation: a validation failure applies none of that patch. Growing
a file with `size` exposes zero-filled bytes; truncation discards data beyond the new size.

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

**Successful result:** `mutation.object` contains the file's final attributes if it survives.
Sparse gaps read as zeroes. Append observes earlier successful operations in the same request.

### rename operation

Renames or moves an object while preserving its identity.

**Arguments**

```text
RenameOperation {
  object_id: ObjectId            // Object to move or rename.
  parent_id: ObjectId            // Destination directory.
  name: string                  // Destination basename.
  replace: bool                 // Whether an existing destination may be replaced.
}
```

**Successful result:** `mutation.object` contains the moved object's final attributes if it survives.
The source object and affected parents must be accessible. Replacement requires the same kind;
a destination directory must be empty. Moving a directory into itself or a descendant is rejected.
The object's `attr_version` advances on a rename or parent change; the affected parents' listing
content versions advance as well.

### remove operation

Removes an authorized file or empty directory from its accessible parent.

**Arguments**

```text
RemoveOperation {
  object_id: ObjectId
  kind: ObjectKind               // Must match the object's kind.
}
```

**Successful result:** `mutation` is present, with no `object` attributes. Its `related` field
includes the parent's final attributes, including `view`, unless that parent is also removed later
in the batch. Nonempty directories fail with `NOT_EMPTY`; recursive deletion requires explicitly
removing descendants first.

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
hits expose a `ReadView`: the search index's state is independent of the store's read snapshot.
Search attributes also omit mode and attribute/content versions and cannot validate cached
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

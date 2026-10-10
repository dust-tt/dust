// Types for the dfs:// filesystem service, see `dfs/design-docs/API.md`.
//
// Field names follow the API in camelCase. Timestamps are milliseconds since the Unix epoch and
// carry an `Ms` suffix. Versions are `bigint` because they are 64-bit integers that are compared
// exactly and must never lose precision.

/** A real stored object: 32 lowercase hex digits encoding a 16-byte UUIDv7. */
export type DfsObjectId = string;

/** A real object or one of the session's virtual projections. */
export type DfsObjectRef = DfsObjectId | "root" | "shared";

// Version nibble 7 and RFC 4122 variant bits, as required by the server.
export const DFS_OBJECT_ID_REGEX =
  /^[0-9a-f]{12}7[0-9a-f]{3}[89ab][0-9a-f]{15}$/;

export function isDfsObjectId(value: string): value is DfsObjectId {
  return DFS_OBJECT_ID_REGEX.test(value);
}

export type DfsErrorCode =
  | "internal"
  | "invalid_input"
  | "not_found"
  | "forbidden"
  | "unauthenticated"
  | "already_exists"
  | "not_directory"
  | "is_directory"
  | "not_empty"
  | "capacity"
  | "unavailable"
  | "unsupported"
  | "name_too_long"
  // Client-side only: the server answered with a message the client cannot decode.
  | "invalid_response"
  // Client-side only: a file changed between the chunks of a multi-chunk read (`DfsPathFileSystem`).
  | "content_changed";

export class DfsError extends Error {
  constructor(
    readonly code: DfsErrorCode,
    message?: string
  ) {
    super(message ?? code);
    this.name = "DfsError";
  }
}

export interface DfsReadView {
  storeVersion: bigint;
  authVersion: bigint;
}

export interface DfsExtendedMetadata {
  createdMs: number;
  mimeType: string;
  xattrs: Record<string, Uint8Array>;
}

// Servers never report "symlink" and reject creating one until symlink targets are specified.
export type DfsObjectKind = "file" | "directory" | "symlink";

export interface DfsAttr {
  id: DfsObjectRef;
  // Stored basename; empty for the tenant root and virtual root, "shared" for virtual shared.
  name: string;
  kind: DfsObjectKind;
  size: number;
  // The session's effective grant permissions in the owner bits (r=0o400, w=0o200), plus x=0o100
  // on directories readable by the session. Not stored per object.
  mode: number;
  atimeMs?: number;
  mtimeMs?: number;
  ctimeMs?: number;
  attrVersion: bigint;
  contentVersion: bigint;
  view: DfsReadView;
  metadata?: DfsExtendedMetadata;
}

// Tenants and sessions.

export interface DfsTenant {
  tenantId: string;
  rootId: DfsObjectId;
  tenantKey: string;
}

export interface DfsSession {
  // Identifies the session for `revokeSession`; not a credential.
  id: string;
  tenantId: string;
  subjects: string[];
  // Empty string when returned by `currentSession` or `refreshSession`.
  sessionKey: string;
  expiresAtMs: number;
}

// Grants. Modes use r=4 and w=2 only (at most 0o6); directory traversal follows read access.

export type DfsGrant =
  // Adds `mode` for sessions holding exactly `subject` (e.g. `u:spolu@dust.tt`, `g:engineering`).
  | { type: "allow"; subject: string; mode: number }
  // Removes `mode` for every session.
  | { type: "deny"; mode: number };

export interface DfsGrantPage {
  grants: DfsGrant[];
  nextAfter?: string;
}

export interface DfsGrantUpdate {
  grant: DfsGrant;
  // True detaches the grant; false attaches it.
  remove: boolean;
}

// Filesystem reads.

// One result per `stat` reference or `lookup` target, in request order. Each successful result
// carries its read view in `object.view`.
export type DfsAttrResult =
  | { status: "ok"; object: DfsAttr }
  | { status: "error"; errorCode: DfsErrorCode };

export interface DfsAttrBatch {
  results: DfsAttrResult[];
}

export interface DfsLookupTarget {
  parentId: DfsObjectRef;
  // Child basename, not a path.
  name: string;
}

export interface DfsEntry {
  name: string;
  object?: DfsAttr;
}

export interface DfsEntryPage {
  entries: DfsEntry[];
  nextAfter?: string;
}

export interface DfsReadData {
  data: Uint8Array;
  object: DfsAttr;
}

export type DfsFileResult =
  | { status: "ok"; objectId: DfsObjectId; object: DfsAttr; data: Uint8Array }
  | { status: "error"; objectId: DfsObjectId; errorCode: DfsErrorCode };

// One result per input; files that do not fit the reply budget get a `capacity` error.
export interface DfsFilesBatch {
  results: DfsFileResult[];
}

export interface DfsVersionCheck {
  objectId: DfsObjectRef;
  attrVersion?: bigint;
  contentVersion?: bigint;
}

export type DfsValidationOutcome =
  | "unchanged"
  | "changed"
  | "denied"
  | "missing"
  | "error";

export interface DfsValidationResult {
  outcome: DfsValidationOutcome;
  errorCode?: DfsErrorCode;
}

export interface DfsValidationBatch {
  results: DfsValidationResult[];
  view: DfsReadView;
}

// Filesystem mutations.

export interface DfsCreateOperation {
  type: "create";
  parentId: DfsObjectId;
  name: string;
  // Fresh UUIDv7 supplied by the caller, see `newDfsObjectId`.
  objectId: DfsObjectId;
  kind: DfsObjectKind;
  mimeType?: string;
  xattrs?: Record<string, Uint8Array>;
}

export interface DfsXattrChange {
  name: string;
  // Omitted removes the key; an empty array sets an empty value.
  value?: Uint8Array;
}

export interface DfsUpdateOperation {
  type: "update";
  objectId: DfsObjectId;
  mimeType?: string;
  xattrs?: DfsXattrChange[];
  atimeMs?: number;
  mtimeMs?: number;
  size?: number;
}

export interface DfsWriteOperation {
  type: "write";
  objectId: DfsObjectId;
  // Ignored when `append` is true.
  offset: number;
  data: Uint8Array;
  append: boolean;
}

export interface DfsRenameOperation {
  type: "rename";
  objectId: DfsObjectId;
  parentId: DfsObjectId;
  name: string;
  replace: boolean;
}

export interface DfsRemoveOperation {
  type: "remove";
  objectId: DfsObjectId;
  kind: DfsObjectKind;
}

export type DfsOperation =
  | DfsCreateOperation
  | DfsUpdateOperation
  | DfsWriteOperation
  | DfsRenameOperation
  | DfsRemoveOperation;

// The commit's read view is in each returned `Attr.view`.
export interface DfsMutation {
  object?: DfsAttr;
  related: DfsAttr[];
}

export type DfsOperationResult =
  | { status: "ok"; mutation: DfsMutation }
  | { status: "error"; errorCode: DfsErrorCode };

export interface DfsOperationBatch {
  results: DfsOperationResult[];
}

// Search.

export type DfsSearchField = "name" | "content";

export interface DfsSearchScope {
  directoryId: DfsObjectId;
  // Defaults to true on the server.
  recursive?: boolean;
}

export interface DfsSearchXattr {
  name: string;
  // Omitted tests existence; present tests byte-exact equality.
  value?: Uint8Array;
}

export interface DfsSearchFilter {
  kind?: DfsObjectKind;
  name?: string;
  namePrefix?: string;
  mimeTypes?: string[];
  minSize?: number;
  maxSize?: number;
  modifiedAfterMs?: number;
  modifiedBeforeMs?: number;
  xattrs?: DfsSearchXattr[];
}

export interface DfsSearchRequest {
  query: string;
  // Empty or omitted searches both name and content.
  fields?: DfsSearchField[];
  scope?: DfsSearchScope;
  filter?: DfsSearchFilter;
  limit?: number;
}

// Index-backed attributes: not a cache-validation result nor evidence of current permissions.
export interface DfsSearchAttr {
  id: DfsObjectId;
  name: string;
  kind: DfsObjectKind;
  size: number;
  atimeMs?: number;
  mtimeMs?: number;
  ctimeMs?: number;
  metadata?: DfsExtendedMetadata;
}

export interface DfsSearchHit {
  object: DfsSearchAttr;
  excerpt?: string;
}

export interface DfsSearchResults {
  hits: DfsSearchHit[];
  partial: boolean;
}

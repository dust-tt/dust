// Conversion between the dfs domain types (`@app/types/dfs`) and wire messages (`DfsWireMessage`).
//
// Encoders throw `DfsError("invalid_input")` on values that cannot be represented on the wire (see
// `encoders-throw-invalid-input` in `CONTRACTS`); `DfsClient` turns those into `Err` results. Decoders validate wire messages with zod, and
// `decodeWireResponse` returns `DfsError("invalid_response")` when they do not match.

import type { DfsWireMessage } from "@app/lib/dfs/proto";
import type {
  DfsOperationBatch,
  DfsAttr,
  DfsErrorCode,
  DfsExtendedMetadata,
  DfsFileResult,
  DfsGrant,
  DfsGrantPage,
  DfsObjectId,
  DfsObjectRef,
  DfsOperation,
  DfsOperationResult,
  DfsEntryPage,
  DfsFilesBatch,
  DfsReadData,
  DfsReadView,
  DfsSearchField,
  DfsSearchKind,
  DfsSearchAttr,
  DfsSearchRequest,
  DfsSearchResults,
  DfsSession,
  DfsAttrBatch,
  DfsAttrResult,
  DfsTenant,
  DfsValidationBatch,
  DfsValidationOutcome,
  DfsVersionCheck,
} from "@app/types/dfs";
import { DfsError, isDfsObjectId } from "@app/types/dfs";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { z } from "zod";
import { fromError } from "zod-validation-error";

// Errors.

const WIRE_ERROR_CODES = {
  INTERNAL: "internal",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  UNAUTHENTICATED: "unauthenticated",
  ALREADY_EXISTS: "already_exists",
  NOT_DIRECTORY: "not_directory",
  IS_DIRECTORY: "is_directory",
  NOT_EMPTY: "not_empty",
  CAPACITY: "capacity",
  UNAVAILABLE: "unavailable",
  UNSUPPORTED: "unsupported",
  NAME_TOO_LONG: "name_too_long",
} as const satisfies Record<string, DfsErrorCode>;

type WireErrorCode = keyof typeof WIRE_ERROR_CODES;

function isWireErrorCode(value: string): value is WireErrorCode {
  return value in WIRE_ERROR_CODES;
}

/**
 * Maps a wire `ErrorCode` name to a `DfsErrorCode`. Codes unknown to this client (added by a newer
 * server) map to `internal`.
 */
export function dfsErrorCodeFromWire(value: string): DfsErrorCode {
  return isWireErrorCode(value) ? WIRE_ERROR_CODES[value] : "internal";
}

// Scalars.

const UINT64_REGEX = /^\d+$/;
const INT64_REGEX = /^-?\d+$/;
// Largest values of the protobuf `uint32` and `uint64` types.
const MAX_UINT32 = 2 ** 32 - 1;
export const MAX_UINT64 = (BigInt(1) << BigInt(64)) - BigInt(1);

export function encodeUint64(value: number | bigint, field: string): string {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new DfsError("invalid_input", `${field} must be a safe integer.`);
  }
  if (value < 0 || BigInt(value) > MAX_UINT64) {
    throw new DfsError("invalid_input", `${field} must fit in a uint64.`);
  }
  return value.toString();
}

export function encodeUint32(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_UINT32) {
    throw new DfsError("invalid_input", `${field} must fit in a uint32.`);
  }
  return value;
}

function encodeOptionalUint32(
  value: number | undefined,
  field: string
): number | undefined {
  return value === undefined ? undefined : encodeUint32(value, field);
}

function encodeOptionalUint64(
  value: number | bigint | undefined,
  field: string
): string | undefined {
  return value === undefined ? undefined : encodeUint64(value, field);
}

const WireBigUint64Schema = z.string().regex(UINT64_REGEX).transform(BigInt);
const WireBigInt64Schema = z.string().regex(INT64_REGEX).transform(BigInt);
// Sizes and timestamps: exact as long as they fit in a JS number, rejected otherwise.
const WireNumberUint64Schema = z
  .string()
  .regex(UINT64_REGEX)
  .transform(Number)
  .refine(Number.isSafeInteger, "Value exceeds Number.MAX_SAFE_INTEGER.");
const WireBytesSchema = z.instanceof(Uint8Array);
const WireErrorDetailsSchema = z
  .object({ code: z.string() })
  .transform(({ code }) => dfsErrorCodeFromWire(code));

// Object references.

type WireObjectId = { value: Uint8Array };
type WireObjectRef = { id: WireObjectId } | { root: true } | { shared: true };

export function encodeObjectId(id: DfsObjectId): WireObjectId {
  if (!isDfsObjectId(id)) {
    throw new DfsError("invalid_input", `Invalid dfs object id: ${id}.`);
  }
  return { value: Buffer.from(id, "hex") };
}

export function encodeObjectRef(ref: DfsObjectRef): WireObjectRef {
  if (ref === "root") {
    return { root: true };
  }
  if (ref === "shared") {
    return { shared: true };
  }
  return { id: encodeObjectId(ref) };
}

const WireObjectIdSchema = z
  .object({ value: WireBytesSchema })
  .transform(({ value }) => Buffer.from(value).toString("hex"))
  .refine(
    (id): id is DfsObjectId => isDfsObjectId(id),
    "Expected a UUIDv7 object id."
  );

const WireObjectRefSchema = z
  .object({
    id: WireObjectIdSchema.optional(),
    root: z.boolean().optional(),
    shared: z.boolean().optional(),
  })
  .transform((ref, ctx): DfsObjectRef => {
    if (ref.id) {
      return ref.id;
    }
    if (ref.root) {
      return "root";
    }
    if (ref.shared) {
      return "shared";
    }
    ctx.addIssue({ code: "custom", message: "Empty object reference." });
    return z.NEVER;
  });

// Attributes.

const WireReadViewSchema = z
  .object({ storeVersion: WireBigInt64Schema, authVersion: WireBigInt64Schema })
  .transform((v): DfsReadView => v);

const WireExtendedMetadataSchema = z
  .object({
    created: WireNumberUint64Schema,
    mimeType: z.string(),
    xattrs: z.record(WireBytesSchema).optional(),
  })
  .transform((m): DfsExtendedMetadata => ({
    createdMs: m.created,
    mimeType: m.mimeType,
    xattrs: m.xattrs ?? {},
  }));

export const WireAttrSchema = z
  .object({
    id: WireObjectRefSchema,
    name: z.string(),
    kind: z.enum(["FILE", "DIRECTORY"]),
    size: WireNumberUint64Schema,
    mode: z.number().int(),
    atime: WireNumberUint64Schema.optional(),
    mtime: WireNumberUint64Schema.optional(),
    ctime: WireNumberUint64Schema.optional(),
    attrVersion: WireBigUint64Schema,
    contentVersion: WireBigUint64Schema,
    view: WireReadViewSchema,
    metadata: WireExtendedMetadataSchema.optional(),
  })
  .transform((a): DfsAttr => ({
    id: a.id,
    name: a.name,
    directory: a.kind === "DIRECTORY",
    size: a.size,
    mode: a.mode,
    atimeMs: a.atime,
    mtimeMs: a.mtime,
    ctimeMs: a.ctime,
    attrVersion: a.attrVersion,
    contentVersion: a.contentVersion,
    view: a.view,
    metadata: a.metadata,
  }));

// Grants.

export function encodeGrant(grant: DfsGrant): DfsWireMessage {
  switch (grant.type) {
    case "allow":
      return {
        allow: {
          subject: grant.subject,
          mode: encodeUint32(grant.mode, "mode"),
        },
      };
    case "deny":
      return { deny: { mode: encodeUint32(grant.mode, "mode") } };
    default:
      assertNever(grant);
  }
}

const WireGrantSchema = z
  .object({
    allow: z.object({ subject: z.string(), mode: z.number().int() }).optional(),
    deny: z.object({ mode: z.number().int() }).optional(),
  })
  .transform((grant, ctx): DfsGrant => {
    if (grant.allow) {
      return { type: "allow", ...grant.allow };
    }
    if (grant.deny) {
      return { type: "deny", ...grant.deny };
    }
    ctx.addIssue({ code: "custom", message: "Grant has no variant." });
    return z.NEVER;
  });

export const WireGrantPageSchema = z
  .object({
    grants: z.array(WireGrantSchema),
    nextAfter: z.string().optional(),
  })
  .transform((p): DfsGrantPage => p);

// Tenants and sessions.

export const WireTenantSchema = z
  .object({
    tenantId: z.string(),
    rootId: WireObjectIdSchema,
    tenantKey: z.string(),
  })
  .transform((t): DfsTenant => t);

export const WireSessionSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    subjects: z.array(z.string()),
    sessionKey: z.string(),
    expiresAt: WireNumberUint64Schema,
  })
  .transform((s): DfsSession => ({
    id: s.id,
    tenantId: s.tenantId,
    subjects: s.subjects,
    sessionKey: s.sessionKey,
    expiresAtMs: s.expiresAt,
  }));

export const WireEmptySchema = z.object({}).transform(() => undefined);

// Reads.

export const WireAttrBatchSchema = z
  .object({
    results: z.array(
      z.object({
        object: WireAttrSchema.optional(),
        error: WireErrorDetailsSchema.optional(),
      })
    ),
  })
  .transform((r, ctx): DfsAttrBatch => {
    const results: DfsAttrResult[] = [];
    for (const { object, error } of r.results) {
      if (object) {
        results.push({ status: "ok", object });
      } else if (error) {
        results.push({ status: "error", errorCode: error });
      } else {
        ctx.addIssue({ code: "custom", message: "Attribute result is empty." });
        return z.NEVER;
      }
    }
    return { results };
  });

export const WireEntryPageSchema = z
  .object({
    entries: z.array(
      z.object({ name: z.string(), object: WireAttrSchema.optional() })
    ),
    nextAfter: z.string().optional(),
  })
  .transform((p): DfsEntryPage => p);

export const WireReadDataSchema = z
  .object({
    data: WireBytesSchema,
    object: WireAttrSchema,
  })
  .transform((r): DfsReadData => r);

export const WireFilesBatchSchema = z
  .object({
    results: z.array(
      z.object({
        objectId: WireObjectIdSchema,
        object: WireAttrSchema.optional(),
        data: WireBytesSchema.optional(),
        error: WireErrorDetailsSchema.optional(),
      })
    ),
  })
  .transform((r, ctx): DfsFilesBatch => {
    const results: DfsFileResult[] = [];
    for (const { objectId, object, data, error } of r.results) {
      if (object && data) {
        results.push({ status: "ok", objectId, object, data });
      } else if (error) {
        results.push({ status: "error", objectId, errorCode: error });
      } else {
        ctx.addIssue({ code: "custom", message: "File result is incomplete." });
        return z.NEVER;
      }
    }
    return { results };
  });

const WIRE_VALIDATION_OUTCOMES = {
  UNCHANGED: "unchanged",
  CHANGED: "changed",
  DENIED: "denied",
  MISSING: "missing",
  ERROR: "error",
} as const satisfies Record<string, DfsValidationOutcome>;

export const WireValidationBatchSchema = z
  .object({
    results: z.array(
      z.object({
        outcome: z.enum(["UNCHANGED", "CHANGED", "DENIED", "MISSING", "ERROR"]),
        error: WireErrorDetailsSchema.optional(),
      })
    ),
    view: WireReadViewSchema,
  })
  .transform((r): DfsValidationBatch => ({
    results: r.results.map(({ outcome, error }) => ({
      outcome: WIRE_VALIDATION_OUTCOMES[outcome],
      errorCode: error,
    })),
    view: r.view,
  }));

export function encodeVersionCheck(check: DfsVersionCheck): DfsWireMessage {
  return {
    objectId: encodeObjectRef(check.objectId),
    attrVersion: encodeOptionalUint64(check.attrVersion, "attrVersion"),
    contentVersion: encodeOptionalUint64(
      check.contentVersion,
      "contentVersion"
    ),
  };
}

// Mutations.

export function encodeOperation(operation: DfsOperation): DfsWireMessage {
  switch (operation.type) {
    case "create":
      return {
        create: {
          parentId: encodeObjectId(operation.parentId),
          name: operation.name,
          objectId: encodeObjectId(operation.objectId),
          kind: operation.directory ? "DIRECTORY" : "FILE",
          mimeType: operation.mimeType,
          xattrs: operation.xattrs ?? {},
        },
      };
    case "update":
      return {
        update: {
          objectId: encodeObjectId(operation.objectId),
          mimeType: operation.mimeType,
          xattrs: operation.xattrs ?? [],
          atime: encodeOptionalUint64(operation.atimeMs, "atimeMs"),
          mtime: encodeOptionalUint64(operation.mtimeMs, "mtimeMs"),
          size: encodeOptionalUint64(operation.size, "size"),
        },
      };
    case "write":
      return {
        write: {
          objectId: encodeObjectId(operation.objectId),
          offset: encodeUint64(operation.offset, "offset"),
          data: operation.data,
          append: operation.append,
        },
      };
    case "rename":
      return {
        rename: {
          objectId: encodeObjectId(operation.objectId),
          parentId: encodeObjectId(operation.parentId),
          name: operation.name,
          replace: operation.replace,
        },
      };
    case "remove":
      return {
        remove: {
          objectId: encodeObjectId(operation.objectId),
          kind: operation.directory ? "DIRECTORY" : "FILE",
        },
      };
    default:
      assertNever(operation);
  }
}

export const WireOperationBatchSchema = z
  .object({
    results: z.array(
      z.object({
        mutation: z
          .object({
            object: WireAttrSchema.optional(),
            related: z.array(WireAttrSchema),
          })
          .optional(),
        error: WireErrorDetailsSchema.optional(),
      })
    ),
  })
  .transform((r, ctx): DfsOperationBatch => {
    const results: DfsOperationResult[] = [];
    for (const { mutation, error } of r.results) {
      if (mutation) {
        results.push({ status: "ok", mutation });
      } else if (error) {
        results.push({ status: "error", errorCode: error });
      } else {
        ctx.addIssue({ code: "custom", message: "Operation result is empty." });
        return z.NEVER;
      }
    }
    return { results };
  });

// Search.

function encodeSearchField(field: DfsSearchField): string {
  switch (field) {
    case "name":
      return "NAME";
    case "content":
      return "CONTENT";
    default:
      assertNever(field);
  }
}

function encodeSearchKind(kind: DfsSearchKind): string {
  switch (kind) {
    case "file":
      return "FILE";
    case "directory":
      return "DIRECTORY";
    default:
      assertNever(kind);
  }
}

export function encodeSearchRequest(request: DfsSearchRequest): DfsWireMessage {
  const { scope, filter } = request;
  return {
    query: request.query,
    fields: (request.fields ?? []).map(encodeSearchField),
    scope: scope && {
      directoryId: encodeObjectId(scope.directoryId),
      recursive: scope.recursive,
    },
    filter: filter && {
      kind: filter.kind && encodeSearchKind(filter.kind),
      name: filter.name,
      namePrefix: filter.namePrefix,
      mimeTypes: filter.mimeTypes ?? [],
      minSize: encodeOptionalUint64(filter.minSize, "minSize"),
      maxSize: encodeOptionalUint64(filter.maxSize, "maxSize"),
      modifiedAfter: encodeOptionalUint64(
        filter.modifiedAfterMs,
        "modifiedAfterMs"
      ),
      modifiedBefore: encodeOptionalUint64(
        filter.modifiedBeforeMs,
        "modifiedBeforeMs"
      ),
      xattrs: filter.xattrs ?? [],
    },
    limit: encodeOptionalUint32(request.limit, "limit"),
  };
}

const WireSearchAttrSchema = z
  .object({
    id: WireObjectIdSchema,
    name: z.string(),
    kind: z.enum(["FILE", "DIRECTORY"]),
    size: WireNumberUint64Schema,
    atime: WireNumberUint64Schema.optional(),
    mtime: WireNumberUint64Schema.optional(),
    ctime: WireNumberUint64Schema.optional(),
    metadata: WireExtendedMetadataSchema.optional(),
  })
  .transform((a): DfsSearchAttr => ({
    id: a.id,
    name: a.name,
    directory: a.kind === "DIRECTORY",
    size: a.size,
    atimeMs: a.atime,
    mtimeMs: a.mtime,
    ctimeMs: a.ctime,
    metadata: a.metadata,
  }));

export const WireSearchResultsSchema = z
  .object({
    hits: z.array(
      z.object({
        object: WireSearchAttrSchema,
        excerpt: z.string().optional(),
      })
    ),
    partial: z.boolean(),
  })
  .transform((r): DfsSearchResults => r);

export function decodeWireResponse<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  message: DfsWireMessage
): Result<T, DfsError> {
  const parsed = schema.safeParse(message);
  if (!parsed.success) {
    return new Err(
      new DfsError("invalid_response", fromError(parsed.error).toString())
    );
  }
  return new Ok(parsed.data);
}

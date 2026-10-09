import {
  decodeWireResponse,
  encodeGrant,
  encodeObjectId,
  encodeObjectRef,
  encodeOperation,
  encodeSearchRequest,
  encodeUint32,
  encodeUint64,
  encodeVersionCheck,
  WireOperationBatchSchema,
  WireEmptySchema,
  WireGrantPageSchema,
  WireEntryPageSchema,
  WireFilesBatchSchema,
  WireReadDataSchema,
  WireSearchResultsSchema,
  WireSessionSchema,
  WireAttrBatchSchema,
  WireTenantSchema,
  WireValidationBatchSchema,
} from "@app/lib/dfs/codec";
import { DfsGrpcTransport } from "@app/lib/dfs/grpc_transport";
import type { DfsMethod, DfsWireMessage } from "@app/lib/dfs/proto";
import type { DfsTransport } from "@app/lib/dfs/transport";
import type {
  DfsAttrResult,
  DfsOperationBatch,
  DfsGrant,
  DfsGrantUpdate,
  DfsGrantPage,
  DfsLookupTarget,
  DfsObjectId,
  DfsObjectRef,
  DfsOperation,
  DfsEntryPage,
  DfsFilesBatch,
  DfsReadData,
  DfsSearchRequest,
  DfsSearchResults,
  DfsSession,
  DfsAttrBatch,
  DfsTenant,
  DfsValidationBatch,
  DfsVersionCheck,
} from "@app/types/dfs";
import { DfsError, isDfsObjectId } from "@app/types/dfs";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";
import type { z } from "zod";

// `dfs-read-data-limit`: a read never returns more than 1 MiB.
const MAX_READ_BYTES = 1024 * 1024;

// A successful attribute result matches `expected` if it reports that object; virtual references
// resolve to ids the client does not know, so any object matches them.
function attrMatchesRef(
  result: DfsAttrResult,
  expected: DfsObjectRef
): boolean {
  return (
    result.status !== "ok" ||
    !isDfsObjectId(expected) ||
    result.object.id === expected
  );
}

// Successful lookups report the stored basename, which equals the requested name except under
// virtual `shared`, whose names are projected aliases.
function attrMatchesTarget(
  result: DfsAttrResult,
  { parentId, name }: DfsLookupTarget
): boolean {
  return (
    result.status !== "ok" ||
    parentId === "shared" ||
    result.object.name === name
  );
}

/**
 * Typed client for the dfs:// API (`dfs/design-docs/API.md`). Each instance authenticates every call
 * with a single bearer key: the server key (`createTenant`), a tenant key (`createSession`,
 * `revokeSession` and grant management) or a session key (session refresh, filesystem and search
 * calls). Several clients can share one
 * transport.
 */
/**
 * @cc [owner:fabiencelier,label:error-handling] client-errors-as-results
 * Every `DfsClient` RPC method MUST resolve to `Err(DfsError)` instead of throwing: invalid inputs
 * (e.g. malformed object ids) yield `invalid_input` without sending the request, transport failures
 * keep the transport's `DfsError`, and responses not matching the API yield `invalid_response`.
 */
/**
 * @cc [owner:fabiencelier,label:api] per-item-errors-in-results
 * Per-item failures of batch calls (`stat`, `lookup`, `readFiles`, `validate`, `apply`) MUST be
 * returned in
 * the corresponding result entry, in request order, and MUST NOT fail the whole call.
 */
/**
 * @cc [owner:fabiencelier,label:api;error-handling] batch-results-match-inputs
 * Batch responses whose results do not line up with the request MUST yield `invalid_response`: a
 * result count different from the input count, or a successful result reporting an object other
 * than the one its input names (by id, or by name for lookups outside virtual `shared`).
 */
export class DfsClient {
  constructor(
    private readonly transport: DfsTransport,
    private readonly key: string
  ) {}

  /** Opens a gRPC channel to `endpoint`; call `transport.close()` when done. */
  static overGrpc({
    endpoint,
    useTls,
    key,
  }: {
    endpoint: string;
    useTls: boolean;
    key: string;
  }): { client: DfsClient; transport: DfsGrpcTransport } {
    const transport = new DfsGrpcTransport({ endpoint, useTls });
    return { client: new DfsClient(transport, key), transport };
  }

  /** Returns a client sharing this client's transport, authenticated with `key`. */
  withKey(key: string): DfsClient {
    return new DfsClient(this.transport, key);
  }

  private async callMatching<T>(
    method: DfsMethod,
    buildRequest: () => DfsWireMessage,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    matchesRequest: (response: T) => boolean
  ): Promise<Result<T, DfsError>> {
    const response = await this.call(method, buildRequest, schema);
    if (response.isOk() && !matchesRequest(response.value)) {
      return new Err(
        new DfsError(
          "invalid_response",
          `${method} response does not match the request.`
        )
      );
    }
    return response;
  }

  private async call<T>(
    method: DfsMethod,
    buildRequest: () => DfsWireMessage,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>
  ): Promise<Result<T, DfsError>> {
    let request: DfsWireMessage;
    try {
      request = buildRequest();
    } catch (err) {
      if (err instanceof DfsError) {
        return new Err(err);
      }
      throw err;
    }

    const response = await this.transport.call(method, request, this.key);
    if (response.isErr()) {
      return response;
    }
    return decodeWireResponse(schema, response.value);
  }

  // Tenants and sessions.

  /** Requires the server key. */
  async createTenant({
    tenantId,
    rootGrants,
  }: {
    tenantId: string;
    rootGrants: DfsGrant[];
  }): Promise<Result<DfsTenant, DfsError>> {
    return this.call(
      "CreateTenant",
      () => ({ tenantId, rootGrants: rootGrants.map(encodeGrant) }),
      WireTenantSchema
    );
  }

  /** Requires the tenant key, which also determines the tenant. */
  async createSession({
    subjects,
  }: {
    subjects: string[];
  }): Promise<Result<DfsSession, DfsError>> {
    return this.call("CreateSession", () => ({ subjects }), WireSessionSchema);
  }

  /**
   * Requires the tenant key. Invalidates the session `sessionId` (the `id` returned by
   * `createSession`, not its key) once its admitted mutations finish.
   */
  async revokeSession({
    sessionId,
  }: {
    sessionId: string;
  }): Promise<Result<void, DfsError>> {
    if (sessionId === "") {
      return new Err(new DfsError("invalid_input", "Empty session id."));
    }
    return this.call("RevokeSession", () => ({ sessionId }), WireEmptySchema);
  }

  /** Requires the session key. The returned `sessionKey` is empty. */
  async currentSession(): Promise<Result<DfsSession, DfsError>> {
    return this.call("CurrentSession", () => ({}), WireSessionSchema);
  }

  /**
   * Requires the session key. Extends the session to at least one hour from now; expired or revoked
   * sessions fail with `unauthenticated`. The returned `sessionKey` is empty.
   */
  async refreshSession(): Promise<Result<DfsSession, DfsError>> {
    return this.call("RefreshSession", () => ({}), WireSessionSchema);
  }

  // Grants. Require the tenant key, which also determines the tenant.

  async listGrants({
    objectId,
    after,
    limit,
  }: {
    objectId: DfsObjectId;
    after?: string;
    limit: number;
  }): Promise<Result<DfsGrantPage, DfsError>> {
    return this.call(
      "ListGrants",
      () => ({
        objectId: encodeObjectId(objectId),
        after,
        limit: encodeUint32(limit, "limit"),
      }),
      WireGrantPageSchema
    );
  }

  async updateGrants({
    objectId,
    changes,
  }: {
    objectId: DfsObjectId;
    changes: DfsGrantUpdate[];
  }): Promise<Result<void, DfsError>> {
    return this.call(
      "UpdateGrants",
      () => ({
        objectId: encodeObjectId(objectId),
        changes: changes.map(({ grant, remove }) => ({
          grant: encodeGrant(grant),
          remove,
        })),
      }),
      WireEmptySchema
    );
  }

  // Filesystem reads. Require the session key.

  async stat({
    objectIds,
    includeMetadata,
  }: {
    objectIds: DfsObjectRef[];
    includeMetadata?: boolean;
  }): Promise<Result<DfsAttrBatch, DfsError>> {
    return this.callMatching(
      "Stat",
      () => ({ objectIds: objectIds.map(encodeObjectRef), includeMetadata }),
      WireAttrBatchSchema,
      ({ results }) =>
        results.length === objectIds.length &&
        results.every((r, i) => attrMatchesRef(r, objectIds[i]))
    );
  }

  /** Resolves immediate children by parent and basename; a missing child is a `not_found` result. */
  async lookup({
    targets,
    includeMetadata,
  }: {
    targets: DfsLookupTarget[];
    includeMetadata?: boolean;
  }): Promise<Result<DfsAttrBatch, DfsError>> {
    return this.callMatching(
      "Lookup",
      () => ({
        targets: targets.map(({ parentId, name }) => ({
          parentId: encodeObjectRef(parentId),
          name,
        })),
        includeMetadata,
      }),
      WireAttrBatchSchema,
      ({ results }) =>
        results.length === targets.length &&
        results.every((r, i) => attrMatchesTarget(r, targets[i]))
    );
  }

  async list({
    directoryId,
    after,
    limit,
  }: {
    directoryId: DfsObjectRef;
    after?: string;
    limit: number;
  }): Promise<Result<DfsEntryPage, DfsError>> {
    return this.call(
      "List",
      () => ({
        directoryId: encodeObjectRef(directoryId),
        after,
        limit: encodeUint32(limit, "limit"),
      }),
      WireEntryPageSchema
    );
  }

  async read({
    objectId,
    offset,
    length,
  }: {
    objectId: DfsObjectId;
    offset: number;
    length: number;
  }): Promise<Result<DfsReadData, DfsError>> {
    return this.callMatching(
      "Read",
      () => ({
        objectId: encodeObjectId(objectId),
        offset: encodeUint64(offset, "offset"),
        length: encodeUint32(length, "length"),
      }),
      WireReadDataSchema,
      ({ data, object }) =>
        data.length <= Math.min(length, MAX_READ_BYTES) &&
        object.id === objectId
    );
  }

  async readFiles({
    objectIds,
  }: {
    objectIds: DfsObjectId[];
  }): Promise<Result<DfsFilesBatch, DfsError>> {
    return this.callMatching(
      "ReadFiles",
      () => ({ objectIds: objectIds.map(encodeObjectId) }),
      WireFilesBatchSchema,
      ({ results }) =>
        results.length === objectIds.length &&
        results.every(
          (r, i) =>
            r.objectId === objectIds[i] &&
            (r.status !== "ok" || r.object.id === objectIds[i])
        )
    );
  }

  async validate({
    checks,
  }: {
    checks: DfsVersionCheck[];
  }): Promise<Result<DfsValidationBatch, DfsError>> {
    return this.callMatching(
      "Validate",
      () => ({ checks: checks.map(encodeVersionCheck) }),
      WireValidationBatchSchema,
      ({ results }) => results.length === checks.length
    );
  }

  // Filesystem mutations. Require the session key.

  /**
   * Runs `operations` in order in one transaction. The request has no idempotency key: a call that
   * failed with `unavailable` may still have committed and must not be blindly replayed.
   */
  async apply({
    operations,
  }: {
    operations: DfsOperation[];
  }): Promise<Result<DfsOperationBatch, DfsError>> {
    return this.callMatching(
      "Apply",
      () => ({ operations: operations.map(encodeOperation) }),
      WireOperationBatchSchema,
      // The primary object, when it survives the request, is the operation's object.
      ({ results }) =>
        results.length === operations.length &&
        results.every(
          (r, i) =>
            r.status !== "ok" ||
            !r.mutation.object ||
            r.mutation.object.id === operations[i].objectId
        )
    );
  }

  // Search. Requires the session key.

  async search(
    request: DfsSearchRequest
  ): Promise<Result<DfsSearchResults, DfsError>> {
    return this.call(
      "Search",
      () => encodeSearchRequest(request),
      WireSearchResultsSchema
    );
  }
}

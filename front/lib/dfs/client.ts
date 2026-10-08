import {
  decodeWireResponse,
  encodeGrant,
  encodeObjectId,
  encodeObjectRef,
  encodeOperation,
  encodeSearchRequest,
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
import { DfsError } from "@app/types/dfs";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";
import type { z } from "zod";

/**
 * Typed client for the dfs:// API (`dfs/design-docs/API.md`). Each instance authenticates every call
 * with a single bearer key: the server key (`createTenant`), a tenant key (`createSession` and
 * grant management) or a session key (filesystem and search calls). Several clients can share one
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
 * Batch responses whose results do not line up with the request MUST yield `invalid_response`.
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

  private async callBatch<T>(
    method: DfsMethod,
    buildRequest: () => DfsWireMessage,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    matchesInputs: (response: T) => boolean
  ): Promise<Result<T, DfsError>> {
    const response = await this.call(method, buildRequest, schema);
    if (response.isOk() && !matchesInputs(response.value)) {
      return new Err(
        new DfsError(
          "invalid_response",
          `${method} results do not match the request.`
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

  /** Requires the session key. The returned `sessionKey` is empty. */
  async currentSession(): Promise<Result<DfsSession, DfsError>> {
    return this.call("CurrentSession", () => ({}), WireSessionSchema);
  }

  /** Requires the session key. */
  async closeSession(): Promise<Result<void, DfsError>> {
    return this.call("CloseSession", () => ({}), WireEmptySchema);
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
      () => ({ objectId: encodeObjectId(objectId), after, limit }),
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
    return this.callBatch(
      "Stat",
      () => ({ objectIds: objectIds.map(encodeObjectRef), includeMetadata }),
      WireAttrBatchSchema,
      ({ results }) => results.length === objectIds.length
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
    return this.callBatch(
      "Lookup",
      () => ({
        targets: targets.map(({ parentId, name }) => ({
          parentId: encodeObjectRef(parentId),
          name,
        })),
        includeMetadata,
      }),
      WireAttrBatchSchema,
      ({ results }) => results.length === targets.length
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
      () => ({ directoryId: encodeObjectRef(directoryId), after, limit }),
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
    return this.call(
      "Read",
      () => ({
        objectId: encodeObjectId(objectId),
        offset: encodeUint64(offset, "offset"),
        length,
      }),
      WireReadDataSchema
    );
  }

  async readFiles({
    objectIds,
  }: {
    objectIds: DfsObjectId[];
  }): Promise<Result<DfsFilesBatch, DfsError>> {
    return this.callBatch(
      "ReadFiles",
      () => ({ objectIds: objectIds.map(encodeObjectId) }),
      WireFilesBatchSchema,
      ({ results }) =>
        results.length === objectIds.length &&
        results.every((r, i) => r.objectId === objectIds[i])
    );
  }

  async validate({
    checks,
  }: {
    checks: DfsVersionCheck[];
  }): Promise<Result<DfsValidationBatch, DfsError>> {
    return this.callBatch(
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
    return this.callBatch(
      "Apply",
      () => ({ operations: operations.map(encodeOperation) }),
      WireOperationBatchSchema,
      ({ results }) => results.length === operations.length
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

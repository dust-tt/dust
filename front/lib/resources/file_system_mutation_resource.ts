import type { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import type {
  FileSystemOperation,
  FileSystemOperationResponse,
} from "@app/lib/api/file_system/namespace_types";
import {
  FileSystemOperationError,
  FileSystemOperationResponseSchema,
} from "@app/lib/api/file_system/namespace_types";
import type { Authenticator } from "@app/lib/auth";
import { FileSystemBlobCleanupResource } from "@app/lib/resources/file_system_blob_cleanup_resource";
import { FileSystemNodeResource } from "@app/lib/resources/file_system_node_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import type { FileSystemMutationKind } from "@app/lib/resources/storage/models/file_system_mutation";
import { FileSystemMutationModel } from "@app/lib/resources/storage/models/file_system_mutation";
import type { FileSystemNodeModel } from "@app/lib/resources/storage/models/file_system_node";
import { FileSystemNodeModel as FileSystemNode } from "@app/lib/resources/storage/models/file_system_node";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { md5 } from "@app/types/shared/utils/encryption";
import type { Transaction } from "sequelize";
import { Op, QueryTypes, UniqueConstraintError } from "sequelize";

type CreateRequest = Extract<FileSystemOperation, { operation: "create" }> & {
  requestId: string;
};
type MutationRequest =
  | CreateRequest
  | Extract<FileSystemOperation, { operation: "remove" | "rename" }>;

const CLEANUP_BATCH_SIZE = 50;
const CLEANUP_WORKSPACE_SCAN_SIZE = 128;
const COMPLETED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Applies one namespace change and records its response in the same transaction. */
export class FileSystemMutationResource {
  private static model: ModelStaticWorkspaceAware<FileSystemMutationModel> =
    FileSystemMutationModel;

  private static async findByRequest(
    auth: Authenticator,
    requestId: string,
    transaction?: Transaction
  ): Promise<FileSystemMutationModel | null> {
    return FileSystemMutationModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        requestId,
      },
      transaction,
      ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    });
  }

  private static completedResponse(
    mutation: FileSystemMutationModel,
    expectedKind: FileSystemMutationKind
  ): Result<FileSystemOperationResponse, FileSystemOperationError> {
    if (mutation.kind !== expectedKind) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          "That request ID belongs to a different filesystem operation."
        )
      );
    }
    const response = FileSystemOperationResponseSchema.safeParse(
      mutation.response
    );
    return response.success
      ? new Ok(response.data)
      : new Err(
          new FileSystemOperationError(
            "invalid_operation",
            "The saved filesystem response is invalid."
          )
        );
  }

  static async apply(
    auth: Authenticator,
    scope: FileSystemScope,
    request: MutationRequest
  ): Promise<Result<FileSystemOperationResponse, FileSystemOperationError>> {
    const existing = await this.findByRequest(auth, request.requestId);
    if (existing) {
      return this.completedResponse(existing, request.operation);
    }

    try {
      return await withTransaction(async (transaction) => {
        // A move can change every child's root. Serializing namespace writes
        // per workspace keeps concurrent creates and moves from leaving a
        // child with the old root after its parent crossed to another root.
        await this.lockNamespace(auth, transaction);
        const concurrent = await this.findByRequest(
          auth,
          request.requestId,
          transaction
        );
        if (concurrent) {
          return this.completedResponse(concurrent, request.operation);
        }

        const result = await this.applyInTransaction(
          auth,
          scope,
          request,
          transaction
        );
        if (result.isErr()) {
          return result;
        }
        await FileSystemMutationModel.create(
          {
            workspaceId: auth.getNonNullableWorkspace().id,
            completedAt: new Date(),
            requestId: request.requestId,
            kind: request.operation,
            response: result.value,
          },
          { transaction }
        );
        return result;
      });
    } catch (error) {
      if (!(error instanceof UniqueConstraintError)) {
        throw error;
      }
      // A concurrent retry can win either the request-ID constraint or the
      // parent/name constraint. Prefer its saved response when available.
      const completed = await this.findByRequest(auth, request.requestId);
      return completed
        ? this.completedResponse(completed, request.operation)
        : new Err(
            new FileSystemOperationError(
              "already_exists",
              "A file or directory already exists at that path."
            )
          );
    }
  }

  private static async lockNamespace(
    auth: Authenticator,
    transaction: Transaction
  ): Promise<void> {
    const workspaceModelId = auth.getNonNullableWorkspace().id;
    // Twelve hex digits stay inside JavaScript's exact integer range while
    // providing a stable PostgreSQL advisory-lock key for this workspace.
    const lockKey = Number.parseInt(
      md5(`file_system_namespace_${workspaceModelId}`).slice(0, 12),
      16
    );
    // biome-ignore lint/plugin/noRawSql: PostgreSQL advisory locks have no Sequelize equivalent.
    await frontSequelize.query("SELECT pg_advisory_xact_lock(:lockKey)", {
      transaction,
      replacements: { lockKey },
    });
  }

  private static async applyInTransaction(
    auth: Authenticator,
    scope: FileSystemScope,
    request: MutationRequest,
    transaction: Transaction
  ): Promise<Result<FileSystemOperationResponse, FileSystemOperationError>> {
    switch (request.operation) {
      case "create": {
        const created = await FileSystemNodeResource.createInTransaction(
          auth,
          scope,
          request,
          transaction
        );
        return created.isErr() ? created : new Ok({ node: created.value });
      }
      case "remove":
        return this.remove(auth, scope, request, transaction);
      case "rename":
        return this.rename(auth, scope, request, transaction);
    }
  }

  private static async writableParent(
    auth: Authenticator,
    scope: FileSystemScope,
    parentId: number,
    description: string,
    transaction: Transaction
  ): Promise<Result<FileSystemNodeModel, FileSystemOperationError>> {
    const parent = await FileSystemNodeResource.fetch(
      auth,
      scope,
      parentId,
      transaction
    );
    if (!parent || parent.kind !== "directory") {
      return new Err(
        new FileSystemOperationError(
          "not_found",
          `The ${description} directory was not found.`
        )
      );
    }
    if (!scope.canWrite(parent.rootKind, parent.rootId)) {
      return new Err(
        new FileSystemOperationError(
          "unauthorized",
          `You do not have write access to the ${description} directory.`
        )
      );
    }
    return new Ok(parent);
  }

  private static async child(
    workspaceModelId: number,
    parentId: number,
    name: string,
    transaction: Transaction
  ): Promise<FileSystemNodeModel | null> {
    return FileSystemNode.findOne({
      where: { workspaceId: workspaceModelId, parentId, name },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  }

  private static async isInSubtree(
    workspaceModelId: number,
    sourceNodeId: number,
    possibleDescendantNodeId: number,
    transaction: Transaction
  ): Promise<boolean> {
    // biome-ignore lint/plugin/noRawSql: recursive tree traversal has no Sequelize equivalent.
    const rows = await frontSequelize.query<{ found: number }>(
      `
        WITH RECURSIVE subtree AS (
          SELECT "id"
          FROM "file_system_nodes"
          WHERE "workspaceId" = :workspaceModelId AND "id" = :sourceNodeId

          UNION ALL

          SELECT child."id"
          FROM "file_system_nodes" child
          JOIN subtree parent ON child."parentId" = parent."id"
          WHERE child."workspaceId" = :workspaceModelId
        )
        SELECT 1 AS "found"
        FROM subtree
        WHERE "id" = :possibleDescendantNodeId
        LIMIT 1
      `,
      {
        type: QueryTypes.SELECT,
        transaction,
        replacements: {
          workspaceModelId,
          sourceNodeId,
          possibleDescendantNodeId,
        },
      }
    );
    return rows.length > 0;
  }

  private static async moveSubtreeToRoot(
    workspaceModelId: number,
    sourceNodeId: number,
    rootKind: FileSystemNodeModel["rootKind"],
    rootId: string,
    transaction: Transaction
  ): Promise<void> {
    // Names and bytes do not change here. Only the cached root scope on each
    // inode changes so authorization remains correct after a cross-root move.
    // biome-ignore lint/plugin/noRawSql: recursive tree update has no Sequelize equivalent.
    await frontSequelize.query(
      `
        WITH RECURSIVE subtree AS (
          SELECT "id"
          FROM "file_system_nodes"
          WHERE "workspaceId" = :workspaceModelId AND "id" = :sourceNodeId

          UNION ALL

          SELECT child."id"
          FROM "file_system_nodes" child
          JOIN subtree parent ON child."parentId" = parent."id"
          WHERE child."workspaceId" = :workspaceModelId
        )
        UPDATE "file_system_nodes"
        SET
          "rootKind" = :rootKind,
          "rootId" = :rootId,
          "updatedAt" = NOW()
        WHERE "workspaceId" = :workspaceModelId
          AND "id" IN (SELECT "id" FROM subtree)
      `,
      {
        transaction,
        replacements: { workspaceModelId, sourceNodeId, rootKind, rootId },
      }
    );
  }

  private static async remove(
    auth: Authenticator,
    scope: FileSystemScope,
    request: Extract<MutationRequest, { operation: "remove" }>,
    transaction: Transaction
  ): Promise<Result<FileSystemOperationResponse, FileSystemOperationError>> {
    const parent = await this.writableParent(
      auth,
      scope,
      request.parentId,
      "source",
      transaction
    );
    if (parent.isErr()) {
      return parent;
    }
    const source = await this.child(
      parent.value.workspaceId,
      parent.value.id,
      request.name,
      transaction
    );
    if (!source) {
      return new Err(
        new FileSystemOperationError(
          "not_found",
          `${request.name} was not found.`
        )
      );
    }
    if (
      !(await FileSystemNodeResource.isEmptyDirectory(
        auth,
        source,
        transaction
      ))
    ) {
      return new Err(
        new FileSystemOperationError("not_empty", "The directory is not empty.")
      );
    }
    if (source.blobId !== null) {
      await FileSystemBlobCleanupResource.retireBlob(
        source.workspaceId,
        source.id,
        source.blobId,
        transaction
      );
    }
    const response: FileSystemOperationResponse = {
      removedNodeId: source.id,
      removedFileResourceId: null,
    };
    await source.destroy({ transaction });
    return new Ok(response);
  }

  private static async rename(
    auth: Authenticator,
    scope: FileSystemScope,
    request: Extract<MutationRequest, { operation: "rename" }>,
    transaction: Transaction
  ): Promise<Result<FileSystemOperationResponse, FileSystemOperationError>> {
    // Lock both directories in ID order so opposite cross-root moves cannot deadlock.
    const parentIds = [
      ...new Set([request.parentId, request.newParentId]),
    ].sort((left, right) => left - right);
    const parents = new Map<number, FileSystemNodeModel>();
    for (const parentId of parentIds) {
      const parent = await this.writableParent(
        auth,
        scope,
        parentId,
        parentId === request.parentId ? "source" : "destination",
        transaction
      );
      if (parent.isErr()) {
        return parent;
      }
      parents.set(parentId, parent.value);
    }
    const sourceParent = parents.get(request.parentId);
    const destinationParent = parents.get(request.newParentId);
    if (!sourceParent || !destinationParent) {
      return new Err(
        new FileSystemOperationError(
          "not_found",
          "A rename directory was not found."
        )
      );
    }
    const source = await this.child(
      sourceParent.workspaceId,
      sourceParent.id,
      request.name,
      transaction
    );
    if (!source) {
      return new Err(
        new FileSystemOperationError(
          "not_found",
          `${request.name} was not found.`
        )
      );
    }
    if (
      source.parentId === destinationParent.id &&
      source.name === request.newName
    ) {
      return new Ok({ node: FileSystemNodeResource.render(auth, source) });
    }
    if (
      source.kind === "directory" &&
      (await this.isInSubtree(
        source.workspaceId,
        source.id,
        destinationParent.id,
        transaction
      ))
    ) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          "A directory cannot be moved inside itself."
        )
      );
    }
    const destination = await this.child(
      destinationParent.workspaceId,
      destinationParent.id,
      request.newName,
      transaction
    );
    if (destination && destination.kind !== source.kind) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          "A file and directory cannot replace each other."
        )
      );
    }
    if (
      destination &&
      !(await FileSystemNodeResource.isEmptyDirectory(
        auth,
        destination,
        transaction
      ))
    ) {
      return new Err(
        new FileSystemOperationError(
          "not_empty",
          "The destination directory is not empty."
        )
      );
    }
    if (destination?.blobId) {
      await FileSystemBlobCleanupResource.retireBlob(
        destination.workspaceId,
        destination.id,
        destination.blobId,
        transaction
      );
    }
    if (destination) {
      await destination.destroy({ transaction });
    }
    if (
      source.rootKind !== destinationParent.rootKind ||
      source.rootId !== destinationParent.rootId
    ) {
      await this.moveSubtreeToRoot(
        source.workspaceId,
        source.id,
        destinationParent.rootKind,
        destinationParent.rootId,
        transaction
      );
    }
    await source.update(
      {
        parentId: destinationParent.id,
        name: request.newName,
        rootKind: destinationParent.rootKind,
        rootId: destinationParent.rootId,
      },
      { transaction }
    );
    return new Ok({
      node: FileSystemNodeResource.render(auth, source),
      ...(destination ? { removedNodeId: destination.id } : {}),
    });
  }

  static async cleanupCompleted(auth: Authenticator): Promise<void> {
    await FileSystemMutationModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        completedAt: {
          [Op.lt]: new Date(Date.now() - COMPLETED_RETENTION_MS),
        },
      },
      limit: CLEANUP_BATCH_SIZE,
    });
  }

  static async dangerouslyListWorkspaceModelIdsWithExpiredReceipts(): Promise<
    number[]
  > {
    const rows = await this.model.findAll({
      attributes: ["workspaceId"],
      where: {
        completedAt: {
          [Op.lt]: new Date(Date.now() - COMPLETED_RETENTION_MS),
        },
      },
      group: ["workspaceId"],
      order: [["workspaceId", "ASC"]],
      limit: CLEANUP_WORKSPACE_SCAN_SIZE,
      raw: true,
      // WORKSPACE_ISOLATION_BYPASS: only discovers workspace IDs. The
      // scheduled activity re-scopes before deleting receipts.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });
    return rows.map((row) => row.workspaceId);
  }
}

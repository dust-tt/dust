import type { FileSystemFileBinding } from "@app/lib/api/file_system/file_binding";
import type { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import type {
  FileSystemOperation,
  FileSystemOperationResponse,
} from "@app/lib/api/file_system/namespace_types";
import { FileSystemOperationError } from "@app/lib/api/file_system/namespace_types";
import type { Authenticator } from "@app/lib/auth";
import { FileSystemBlobCleanupResource } from "@app/lib/resources/file_system_blob_cleanup_resource";
import { FileSystemNodeResource } from "@app/lib/resources/file_system_node_resource";
import type { FileSystemMutationState } from "@app/lib/resources/storage/models/file_system_mutation";
import { FileSystemMutationModel } from "@app/lib/resources/storage/models/file_system_mutation";
import { FileSystemNodeModel } from "@app/lib/resources/storage/models/file_system_node";
import { makeSId } from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Transaction } from "sequelize";
import { Op, UniqueConstraintError } from "sequelize";

type MutationRequest = Extract<
  FileSystemOperation,
  { operation: "remove" | "rename" }
>;

const REPAIR_BATCH_SIZE = 50;
const COMPLETED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Durable rename/delete work that spans PostgreSQL and FileResource state. */
export class FileSystemMutationResource {
  private static fileSId(auth: Authenticator, fileId: number | null) {
    return fileId === null
      ? null
      : makeSId("file", {
          id: fileId,
          workspaceId: auth.getNonNullableWorkspace().id,
        });
  }

  private static async completedResponse(
    auth: Authenticator,
    scope: FileSystemScope,
    mutation: FileSystemMutationModel
  ): Promise<Result<FileSystemOperationResponse, FileSystemOperationError>> {
    if (mutation.kind === "remove") {
      return new Ok({
        removedNodeId: mutation.nodeId,
        removedFileResourceId: mutation.removedFileResourceId,
      });
    }
    const node = await FileSystemNodeResource.getAttr(
      auth,
      scope,
      mutation.nodeId
    );
    return node.isErr()
      ? node
      : new Ok({
          node: node.value,
          ...(mutation.replacedNodeId
            ? { removedNodeId: mutation.replacedNodeId }
            : {}),
        });
  }

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

  static async apply(
    auth: Authenticator,
    scope: FileSystemScope,
    binding: FileSystemFileBinding,
    request: MutationRequest
  ): Promise<Result<FileSystemOperationResponse, FileSystemOperationError>> {
    let mutation = await this.findByRequest(auth, request.requestId);
    if (!mutation) {
      try {
        const prepared = await this.prepare(auth, scope, request);
        if (prepared.isErr()) {
          return prepared;
        }
        mutation = prepared.value;
      } catch (error) {
        if (!(error instanceof UniqueConstraintError)) {
          throw error;
        }
        mutation = await this.findByRequest(auth, request.requestId);
        if (!mutation) {
          throw error;
        }
      }
    }
    if (mutation.kind !== request.operation) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          "That request ID belongs to a different filesystem operation."
        )
      );
    }
    if (mutation.state === "completed") {
      return this.completedResponse(auth, scope, mutation);
    }
    return this.resume(auth, scope, binding, mutation);
  }

  private static async prepare(
    auth: Authenticator,
    scope: FileSystemScope,
    request: MutationRequest
  ): Promise<Result<FileSystemMutationModel, FileSystemOperationError>> {
    return withTransaction(async (transaction) => {
      const existing = await this.findByRequest(
        auth,
        request.requestId,
        transaction
      );
      if (existing) {
        return new Ok(existing);
      }
      const parent = await FileSystemNodeResource.fetch(
        auth,
        scope,
        request.parentId,
        transaction
      );
      if (!parent || parent.kind !== "directory") {
        return new Err(
          new FileSystemOperationError(
            "not_found",
            "The source directory was not found."
          )
        );
      }
      if (!scope.canWrite(parent.rootKind, parent.rootId)) {
        return new Err(
          new FileSystemOperationError(
            "unauthorized",
            "You do not have write access to the source directory."
          )
        );
      }
      const source = await FileSystemNodeModel.findOne({
        where: {
          workspaceId: parent.workspaceId,
          parentId: parent.id,
          name: request.name,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!source) {
        return new Err(
          new FileSystemOperationError(
            "not_found",
            `${request.name} was not found.`
          )
        );
      }
      if (source.pendingMutationId !== null) {
        return new Err(
          new FileSystemOperationError(
            "busy",
            "The source belongs to another unfinished operation."
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
          new FileSystemOperationError(
            request.operation === "remove" ? "not_empty" : "invalid_operation",
            "Moving or deleting a non-empty directory is not supported."
          )
        );
      }
      const sourceRelativePath = await FileSystemNodeResource.relativePath(
        auth,
        scope,
        source,
        transaction
      );

      let destination: FileSystemNodeModel | null = null;
      let destinationParent: FileSystemNodeModel | null = null;
      let destinationPath: string | null = null;
      if (request.operation === "rename") {
        destinationParent = await FileSystemNodeResource.fetch(
          auth,
          scope,
          request.newParentId,
          transaction
        );
        if (!destinationParent || destinationParent.kind !== "directory") {
          return new Err(
            new FileSystemOperationError(
              "not_found",
              "The destination directory was not found."
            )
          );
        }
        if (
          !scope.canWrite(destinationParent.rootKind, destinationParent.rootId)
        ) {
          return new Err(
            new FileSystemOperationError(
              "unauthorized",
              "You do not have write access to the destination directory."
            )
          );
        }
        if (
          source.parentId === destinationParent.id &&
          source.name === request.newName
        ) {
          const completed = await FileSystemMutationModel.create(
            {
              workspaceId: source.workspaceId,
              completedAt: new Date(),
              requestId: request.requestId,
              kind: "rename",
              state: "completed",
              nodeId: source.id,
              nodeKind: source.kind,
              sourceRootKind: source.rootKind,
              sourceRootId: source.rootId,
              sourceParentId: parent.id,
              sourceName: source.name,
              sourceRelativePath,
              destinationRootKind: destinationParent.rootKind,
              destinationRootId: destinationParent.rootId,
              destinationParentId: destinationParent.id,
              destinationName: request.newName,
              destinationRelativePath: sourceRelativePath,
              replacedNodeId: null,
              sourceBlobId: source.blobId,
              replacedBlobId: null,
              removedFileResourceId: this.fileSId(auth, source.fileId),
              lastError: null,
              attempts: 0,
            },
            { transaction }
          );
          return new Ok(completed);
        }
        destination = await FileSystemNodeModel.findOne({
          where: {
            workspaceId: source.workspaceId,
            parentId: destinationParent.id,
            name: request.newName,
          },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (destination?.pendingMutationId !== null && destination) {
          return new Err(
            new FileSystemOperationError(
              "busy",
              "The destination belongs to another unfinished operation."
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
        if (destination && destination.kind !== source.kind) {
          return new Err(
            new FileSystemOperationError(
              "invalid_operation",
              "A file and directory cannot replace each other."
            )
          );
        }
        if (
          source.fileId !== null &&
          destination?.fileId !== null &&
          destination
        ) {
          return new Err(
            new FileSystemOperationError(
              "invalid_operation",
              "Two attached FileResources cannot overwrite each other."
            )
          );
        }
        const parentPath = await FileSystemNodeResource.relativePath(
          auth,
          scope,
          destinationParent,
          transaction
        );
        destinationPath = [parentPath, request.newName]
          .filter(Boolean)
          .join("/");
      }

      const effectiveFileId = source.fileId ?? destination?.fileId ?? null;
      const mutation = await FileSystemMutationModel.create(
        {
          workspaceId: source.workspaceId,
          completedAt: null,
          requestId: request.requestId,
          kind: request.operation,
          state: "prepared",
          nodeId: source.id,
          nodeKind: source.kind,
          sourceRootKind: source.rootKind,
          sourceRootId: source.rootId,
          sourceParentId: parent.id,
          sourceName: source.name,
          sourceRelativePath,
          destinationRootKind: destinationParent?.rootKind ?? null,
          destinationRootId: destinationParent?.rootId ?? null,
          destinationParentId: destinationParent?.id ?? null,
          destinationName:
            request.operation === "rename" ? request.newName : null,
          destinationRelativePath: destinationPath,
          replacedNodeId: destination?.id ?? null,
          sourceBlobId: source.blobId,
          replacedBlobId: destination?.blobId ?? null,
          removedFileResourceId: this.fileSId(auth, effectiveFileId),
          lastError: null,
          attempts: 0,
        },
        { transaction }
      );
      await source.update({ pendingMutationId: mutation.id }, { transaction });
      if (destination) {
        await destination.update(
          { pendingMutationId: mutation.id },
          { transaction }
        );
      }
      return new Ok(mutation);
    });
  }

  private static async resume(
    auth: Authenticator,
    scope: FileSystemScope,
    binding: FileSystemFileBinding,
    mutation: FileSystemMutationModel
  ): Promise<Result<FileSystemOperationResponse, FileSystemOperationError>> {
    if (mutation.state === "completed") {
      return this.completedResponse(auth, scope, mutation);
    }
    const fileResourceId = mutation.removedFileResourceId;
    if (fileResourceId) {
      const externalResult =
        mutation.kind === "remove"
          ? await binding.deleteFile(auth, fileResourceId)
          : await binding.moveFile(auth, fileResourceId, {
              rootKind: mutation.destinationRootKind!,
              rootId: mutation.destinationRootId!,
              relativePath: mutation.destinationRelativePath!,
              fileName: mutation.destinationName!,
            });
      if (externalResult.isErr()) {
        await mutation.update({
          attempts: mutation.attempts + 1,
          lastError: externalResult.error.message,
        });
        return new Err(
          new FileSystemOperationError(
            "busy",
            `The attached FileResource update failed: ${externalResult.error.message}`
          )
        );
      }
    }

    return withTransaction(async (transaction) => {
      const current = await FileSystemMutationModel.findOne({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: mutation.id,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!current) {
        return new Err(
          new FileSystemOperationError(
            "not_found",
            "The filesystem mutation disappeared."
          )
        );
      }
      if (current.state === "completed") {
        return this.completedResponse(auth, scope, current);
      }
      const source = await FileSystemNodeResource.fetch(
        auth,
        scope,
        current.nodeId,
        transaction
      );
      if (!source) {
        return new Err(
          new FileSystemOperationError(
            "not_found",
            "The source inode disappeared before the mutation completed."
          )
        );
      }
      if (current.kind === "remove") {
        if (source.blobId !== null) {
          await FileSystemBlobCleanupResource.retireBlob(
            source.workspaceId,
            source.id,
            source.blobId,
            transaction
          );
        }
        const result: FileSystemOperationResponse = {
          removedNodeId: source.id,
          removedFileResourceId: current.removedFileResourceId,
        };
        await source.destroy({ transaction });
        await current.update(
          {
            state: "completed",
            completedAt: new Date(),
            lastError: null,
          },
          { transaction }
        );
        return new Ok(result);
      }

      const destination = current.replacedNodeId
        ? await FileSystemNodeResource.fetch(
            auth,
            scope,
            current.replacedNodeId,
            transaction
          )
        : null;
      const destinationParentId = current.destinationParentId;
      const destinationName = current.destinationName;
      const destinationRootKind = current.destinationRootKind;
      const destinationRootId = current.destinationRootId;
      if (
        destinationParentId === null ||
        destinationName === null ||
        destinationRootKind === null ||
        destinationRootId === null
      ) {
        return new Err(
          new FileSystemOperationError(
            "invalid_operation",
            "The prepared rename has no destination."
          )
        );
      }
      const effectiveFileId = source.fileId ?? destination?.fileId ?? null;
      if (destination) {
        if (destination.blobId !== null) {
          await FileSystemBlobCleanupResource.retireBlob(
            destination.workspaceId,
            destination.id,
            destination.blobId,
            transaction
          );
        }
        if (destination.fileId !== null) {
          await destination.update({ fileId: null }, { transaction });
        }
        await destination.destroy({ transaction });
      }
      await source.update(
        {
          parentId: destinationParentId,
          name: destinationName,
          rootKind: destinationRootKind,
          rootId: destinationRootId,
          fileId: effectiveFileId,
          pendingMutationId: null,
        },
        { transaction }
      );
      const result: FileSystemOperationResponse = {
        node: FileSystemNodeResource.render(auth, source),
        ...(destination ? { removedNodeId: destination.id } : {}),
      };
      await current.update(
        {
          state: "completed",
          completedAt: new Date(),
          lastError: null,
        },
        { transaction }
      );
      return new Ok(result);
    });
  }

  static async repairPrepared(
    auth: Authenticator,
    scope: FileSystemScope,
    binding: FileSystemFileBinding
  ): Promise<void> {
    const rows = await FileSystemMutationModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        state: "prepared" satisfies FileSystemMutationState,
      },
      order: [
        ["createdAt", "ASC"],
        ["id", "ASC"],
      ],
      limit: REPAIR_BATCH_SIZE,
    });
    for (const row of rows) {
      try {
        const result = await this.resume(auth, scope, binding, row);
        if (result.isErr()) {
          logger.warn(
            { mutationId: row.id, error: result.error },
            "Dust filesystem mutation repair remains pending"
          );
        }
      } catch (error) {
        logger.warn(
          { mutationId: row.id, error: normalizeError(error) },
          "Dust filesystem mutation repair failed"
        );
      }
    }
    await FileSystemMutationModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        state: "completed" satisfies FileSystemMutationState,
        completedAt: {
          [Op.lt]: new Date(Date.now() - COMPLETED_RETENTION_MS),
        },
      },
      limit: REPAIR_BATCH_SIZE,
    });
  }
}

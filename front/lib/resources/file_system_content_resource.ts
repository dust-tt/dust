import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import { FileSystemOperationError } from "@app/lib/api/file_system/namespace_types";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import {
  FILE_SYSTEM_CONTENT_URL_EXPIRATION_MS,
  FileSystemBlobCleanupResource,
} from "@app/lib/resources/file_system_blob_cleanup_resource";
import { FileSystemNodeModel } from "@app/lib/resources/storage/models/file_system_node";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import {
  contentTypeFromFileName,
  resolveFileContentType,
} from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Transaction, WhereOptions } from "sequelize";
import { Op } from "sequelize";

type AllowedRoot = FileSystemScope["roots"][number];

/** Connects one inode to one immutable, path-free GCS object. */
export class FileSystemContentResource {
  private static allowedWhere(
    auth: Authenticator,
    roots: readonly AllowedRoot[]
  ): WhereOptions<FileSystemNodeModel> {
    return {
      workspaceId: auth.getNonNullableWorkspace().id,
      [Op.or]: roots.map((root) => ({
        rootKind: root.kind,
        rootId: root.id,
      })),
    };
  }

  private static async fetchFile(
    auth: Authenticator,
    scope: FileSystemScope,
    nodeId: number,
    transaction?: Transaction
  ): Promise<Result<FileSystemNodeModel, FileSystemOperationError>> {
    const node = await FileSystemNodeModel.findOne({
      where: { ...this.allowedWhere(auth, scope.roots), id: nodeId },
      transaction,
      ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!node) {
      return new Err(
        new FileSystemOperationError("not_found", "The file was not found.")
      );
    }
    if (node.kind !== "file") {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          "A directory has no file content."
        )
      );
    }
    return new Ok(node);
  }

  static objectPath(
    auth: Authenticator,
    nodeId: number,
    blobId: string
  ): string {
    return FileSystemBlobCleanupResource.objectPath(auth, nodeId, blobId);
  }

  static async getAttachedReadStream({
    workspaceModelId,
    workspaceId,
    fileModelId,
  }: {
    workspaceModelId: number;
    workspaceId: string;
    fileModelId: number;
  }): Promise<Readable | null> {
    const node = await FileSystemNodeModel.findOne({
      attributes: ["id", "blobId"],
      where: {
        workspaceId: workspaceModelId,
        fileId: fileModelId,
        kind: "file",
      },
    });
    if (!node) {
      return null;
    }
    if (node.blobId === null) {
      return Readable.from([]);
    }
    return getPrivateUploadBucket()
      .file(
        FileSystemBlobCleanupResource.objectPathForWorkspace(
          workspaceId,
          node.id,
          node.blobId
        )
      )
      .createReadStream();
  }

  static async getDownload(
    auth: Authenticator,
    scope: FileSystemScope,
    nodeId: number
  ) {
    const node = await this.fetchFile(auth, scope, nodeId);
    if (node.isErr()) {
      return node;
    }
    if (node.value.blobId === null) {
      return new Ok({
        content: {
          blobId: null,
          downloadUrl: null,
          size: node.value.size,
          contentType: node.value.contentType,
        },
      });
    }
    const downloadUrl = await getPrivateUploadBucket().getSignedUrl(
      this.objectPath(auth, node.value.id, node.value.blobId),
      { expirationDelayMs: FILE_SYSTEM_CONTENT_URL_EXPIRATION_MS }
    );
    return new Ok({
      content: {
        blobId: node.value.blobId,
        downloadUrl,
        size: node.value.size,
        contentType: node.value.contentType,
      },
    });
  }

  static async prepareUpload(
    auth: Authenticator,
    scope: FileSystemScope,
    request: {
      nodeId: number;
      expectedBlobId: string | null;
      contentType: string;
    }
  ) {
    const node = await this.fetchFile(auth, scope, request.nodeId);
    if (node.isErr()) {
      return node;
    }
    if (!scope.canWrite(node.value.rootKind, node.value.rootId)) {
      return new Err(
        new FileSystemOperationError(
          "unauthorized",
          "You do not have write access to this file."
        )
      );
    }
    if (node.value.pendingMutationId !== null) {
      return new Err(
        new FileSystemOperationError(
          "busy",
          "The file has a rename or delete in progress."
        )
      );
    }
    if (node.value.blobId !== request.expectedBlobId) {
      return new Err(
        new FileSystemOperationError(
          "stale",
          "The file changed after it was opened."
        )
      );
    }

    const contentType =
      contentTypeFromFileName(node.value.name) ??
      resolveFileContentType(request.contentType, node.value.name);
    const blobId = randomUUID();
    await FileSystemBlobCleanupResource.registerUpload(auth, {
      nodeId: node.value.id,
      blobId,
    });
    const uploadUrl = await getPrivateUploadBucket().getSignedUploadUrl(
      this.objectPath(auth, node.value.id, blobId),
      { contentType, expirationDelayMs: FILE_SYSTEM_CONTENT_URL_EXPIRATION_MS }
    );
    return new Ok({ upload: { blobId, uploadUrl, contentType } });
  }

  static async commitUpload(
    auth: Authenticator,
    scope: FileSystemScope,
    request: {
      nodeId: number;
      expectedBlobId: string | null;
      blobId: string;
      contentType: string;
    }
  ): Promise<Result<number, FileSystemOperationError>> {
    let size: number;
    try {
      const [metadata] = await getPrivateUploadBucket()
        .file(this.objectPath(auth, request.nodeId, request.blobId))
        .getMetadata();
      size = Number(metadata.size);
      if (!Number.isSafeInteger(size) || size < 0) {
        return new Err(
          new FileSystemOperationError(
            "invalid_operation",
            "The uploaded object has an invalid size."
          )
        );
      }
      if (metadata.contentType !== request.contentType) {
        return new Err(
          new FileSystemOperationError(
            "invalid_operation",
            "The uploaded object's content type does not match the request."
          )
        );
      }
    } catch (error) {
      logger.warn(
        {
          error: normalizeError(error),
          nodeId: request.nodeId,
          blobId: request.blobId,
        },
        "Dust filesystem could not verify an uploaded blob"
      );
      return new Err(
        new FileSystemOperationError(
          "not_found",
          "The uploaded object was not found."
        )
      );
    }

    return withTransaction(async (transaction) => {
      const node = await this.fetchFile(
        auth,
        scope,
        request.nodeId,
        transaction
      );
      if (node.isErr()) {
        return node;
      }
      if (!scope.canWrite(node.value.rootKind, node.value.rootId)) {
        return new Err(
          new FileSystemOperationError(
            "unauthorized",
            "You do not have write access to this file."
          )
        );
      }
      // Lost commit responses are safe to retry with the same blob ID.
      if (node.value.blobId === request.blobId) {
        await FileSystemBlobCleanupResource.markBlobLive(
          node.value.workspaceId,
          node.value.id,
          request.blobId,
          transaction
        );
        return new Ok(node.value.id);
      }
      if (node.value.blobId !== request.expectedBlobId) {
        return new Err(
          new FileSystemOperationError(
            "stale",
            "The file changed while content was uploading."
          )
        );
      }
      if (node.value.pendingMutationId !== null) {
        return new Err(
          new FileSystemOperationError(
            "busy",
            "The file has a rename or delete in progress."
          )
        );
      }
      const registered = await FileSystemBlobCleanupResource.markBlobLive(
        node.value.workspaceId,
        node.value.id,
        request.blobId,
        transaction
      );
      if (!registered) {
        return new Err(
          new FileSystemOperationError(
            "invalid_operation",
            "The uploaded blob was not prepared for this file."
          )
        );
      }
      const oldBlobId = node.value.blobId;
      await node.value.update(
        {
          blobId: request.blobId,
          size,
          contentType: request.contentType,
          contentRevision: node.value.contentRevision + 1,
        },
        { transaction }
      );
      if (oldBlobId !== null) {
        await FileSystemBlobCleanupResource.retireBlob(
          node.value.workspaceId,
          node.value.id,
          oldBlobId,
          transaction
        );
      }
      return new Ok(node.value.id);
    });
  }
}

import type { Authenticator } from "@app/lib/auth";
import {
  DEFAULT_SIGNED_URL_EXPIRATION_DELAY_MS,
  getPrivateUploadBucket,
} from "@app/lib/file_storage";
import { FileSystemBlobCleanupModel } from "@app/lib/resources/storage/models/file_system_blob_cleanup";
import { FileSystemNodeModel } from "@app/lib/resources/storage/models/file_system_node";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

const CLEANUP_BATCH_SIZE = 50;
const CLEANUP_DELETE_CONCURRENCY = 10;
const CLEANUP_WORKSPACE_SCAN_SIZE = 128;
export const FILE_SYSTEM_CONTENT_URL_EXPIRATION_MS =
  2 * DEFAULT_SIGNED_URL_EXPIRATION_DELAY_MS;
const ABANDONED_UPLOAD_CLEANUP_DELAY_MS = 24 * 60 * 60 * 1000;
const RETIRED_BLOB_CLEANUP_DELAY_MS =
  FILE_SYSTEM_CONTENT_URL_EXPIRATION_MS + 5 * 60 * 1000;

/** Durable garbage collection for immutable filesystem blobs. */
export class FileSystemBlobCleanupResource {
  private static model: ModelStaticWorkspaceAware<FileSystemBlobCleanupModel> =
    FileSystemBlobCleanupModel;

  static objectPathForWorkspace(
    workspaceId: string,
    nodeId: number,
    blobId: string
  ): string {
    return `w/${workspaceId}/filesystem/blobs/${nodeId}/${blobId}`;
  }

  static objectPath(
    auth: Authenticator,
    nodeId: number,
    blobId: string
  ): string {
    return this.objectPathForWorkspace(
      auth.getNonNullableWorkspace().sId,
      nodeId,
      blobId
    );
  }

  static async registerUpload(
    auth: Authenticator,
    { nodeId, blobId }: { nodeId: number; blobId: string }
  ): Promise<void> {
    await this.model.create({
      workspaceId: auth.getNonNullableWorkspace().id,
      nodeId,
      blobId,
      notBefore: new Date(Date.now() + ABANDONED_UPLOAD_CLEANUP_DELAY_MS),
      attempts: 0,
      lastError: null,
    });
  }

  static async markBlobLive(
    workspaceId: ModelId,
    nodeId: number,
    blobId: string,
    transaction: Transaction
  ): Promise<boolean> {
    return (
      (await this.model.destroy({
        where: { workspaceId, nodeId, blobId },
        transaction,
      })) === 1
    );
  }

  static async retireBlob(
    workspaceId: ModelId,
    nodeId: number,
    blobId: string,
    transaction?: Transaction
  ): Promise<void> {
    await this.model.upsert(
      {
        workspaceId,
        nodeId,
        blobId,
        notBefore: new Date(Date.now() + RETIRED_BLOB_CLEANUP_DELAY_MS),
        attempts: 0,
        lastError: null,
      },
      transaction ? { transaction } : undefined
    );
  }

  /** Cross-workspace discovery only; every returned workspace is re-scoped. */
  static async dangerouslyListWorkspaceModelIdsWithDueCleanup(): Promise<
    ModelId[]
  > {
    const rows = await this.model.findAll({
      attributes: ["workspaceId"],
      where: { notBefore: { [Op.lte]: new Date() } },
      order: [
        ["notBefore", "ASC"],
        ["id", "ASC"],
      ],
      limit: CLEANUP_WORKSPACE_SCAN_SIZE,
      raw: true,
      // WORKSPACE_ISOLATION_BYPASS: only discovers workspace IDs. The caller
      // builds a scoped authenticator before reading nodes or deleting blobs.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });
    return [...new Set(rows.map((row) => row.workspaceId))];
  }

  /** Delete a bounded batch; failed deletes stay queued for the next sweep. */
  static async repairPending(auth: Authenticator): Promise<void> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const pending = await this.model.findAll({
      where: { workspaceId, notBefore: { [Op.lte]: new Date() } },
      order: [
        ["notBefore", "ASC"],
        ["id", "ASC"],
      ],
      limit: CLEANUP_BATCH_SIZE,
    });
    if (pending.length === 0) {
      return;
    }

    const liveNodes = await FileSystemNodeModel.findAll({
      attributes: ["id", "blobId"],
      where: {
        workspaceId,
        id: { [Op.in]: [...new Set(pending.map((row) => row.nodeId))] },
      },
    });
    const liveBlobByNode = new Map(
      liveNodes.map((node) => [node.id, node.blobId])
    );
    const results = await concurrentExecutor(
      pending,
      async (cleanup) => {
        if (liveBlobByNode.get(cleanup.nodeId) === cleanup.blobId) {
          return { id: cleanup.id, completed: true };
        }
        try {
          await getPrivateUploadBucket().delete(
            this.objectPath(auth, cleanup.nodeId, cleanup.blobId),
            { ignoreNotFound: true }
          );
          return { id: cleanup.id, completed: true };
        } catch (error) {
          logger.warn(
            {
              error: normalizeError(error),
              cleanupId: cleanup.id,
              nodeId: cleanup.nodeId,
              blobId: cleanup.blobId,
            },
            "Dust filesystem blob cleanup failed"
          );
          return { id: cleanup.id, completed: false };
        }
      },
      { concurrency: CLEANUP_DELETE_CONCURRENCY }
    );
    const completedIds = results.filter((r) => r.completed).map((r) => r.id);
    const failedIds = results.filter((r) => !r.completed).map((r) => r.id);
    if (completedIds.length > 0) {
      await this.model.destroy({
        where: { workspaceId, id: { [Op.in]: completedIds } },
      });
    }
    if (failedIds.length > 0) {
      await this.model.increment("attempts", {
        by: 1,
        where: { workspaceId, id: { [Op.in]: failedIds } },
      });
      await this.model.update(
        { lastError: "GCS delete failed; see the filesystem cleanup log." },
        { where: { workspaceId, id: { [Op.in]: failedIds } } }
      );
    }
  }
}

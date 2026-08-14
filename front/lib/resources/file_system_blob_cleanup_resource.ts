import type { Authenticator } from "@app/lib/auth";
import {
  deleteFileSystemBlob,
  FILE_SYSTEM_CONTENT_URL_EXPIRATION_MS,
} from "@app/lib/file_storage/file_system_blobs";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { FileSystemNodeResource } from "@app/lib/resources/file_system_node_resource";
import { FileSystemBlobCleanupModel } from "@app/lib/resources/storage/models/file_system_blob_cleanup";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Attributes, Transaction } from "sequelize";
import { Op } from "sequelize";

const CLEANUP_BATCH_SIZE = 50;
const CLEANUP_DELETE_CONCURRENCY = 10;
const CLEANUP_WORKSPACE_SCAN_SIZE = 128;
const ABANDONED_UPLOAD_CLEANUP_DELAY_MS = 24 * 60 * 60 * 1000;
const RETIRED_BLOB_CLEANUP_DELAY_MS =
  FILE_SYSTEM_CONTENT_URL_EXPIRATION_MS + 5 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface FileSystemBlobCleanupResource
  extends ReadonlyAttributesType<FileSystemBlobCleanupModel> {}

/** One durable request to delete an abandoned or replaced content blob. */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class FileSystemBlobCleanupResource extends BaseResource<FileSystemBlobCleanupModel> {
  static model: ModelStaticWorkspaceAware<FileSystemBlobCleanupModel> =
    FileSystemBlobCleanupModel;

  constructor(
    model: ModelStaticWorkspaceAware<FileSystemBlobCleanupModel>,
    blob: Attributes<FileSystemBlobCleanupModel>
  ) {
    super(model, blob);
  }

  override delete(): Promise<Result<undefined, Error>> {
    // Queue entries are removed only after a blob becomes live or GCS confirms
    // its deletion. Direct deletion could leak an object permanently.
    throw new Error(
      "Filesystem blob cleanup entries cannot be deleted directly."
    );
  }

  private static async baseFetch(
    auth: Authenticator,
    options: ResourceFindOptions<FileSystemBlobCleanupModel> = {},
    {
      transaction,
      forUpdate = false,
    }: { transaction?: Transaction; forUpdate?: boolean } = {}
  ): Promise<FileSystemBlobCleanupResource[]> {
    const { where, ...otherOptions } = options;
    const rows = await this.model.findAll({
      ...otherOptions,
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
      ...(transaction && forUpdate ? { lock: transaction.LOCK.UPDATE } : {}),
    });

    return rows.map((row) => new this(this.model, row.get()));
  }

  private static async makeNew(
    auth: Authenticator,
    node: FileSystemNodeResource,
    blobId: string,
    notBefore: Date,
    transaction?: Transaction
  ): Promise<FileSystemBlobCleanupResource> {
    if (node.workspaceId !== auth.getNonNullableWorkspace().id) {
      throw new Error("Cannot register a filesystem blob across workspaces.");
    }

    const [row] = await this.model.upsert(
      {
        workspaceId: node.workspaceId,
        nodeId: node.id,
        blobId,
        notBefore,
        attempts: 0,
        lastError: null,
      },
      { transaction, returning: true }
    );

    return new this(this.model, row.get());
  }

  static registerUpload(
    auth: Authenticator,
    node: FileSystemNodeResource,
    blobId: string
  ): Promise<FileSystemBlobCleanupResource> {
    return this.makeNew(
      auth,
      node,
      blobId,
      new Date(Date.now() + ABANDONED_UPLOAD_CLEANUP_DELAY_MS)
    );
  }

  static retireBlob(
    auth: Authenticator,
    node: FileSystemNodeResource,
    blobId: string,
    transaction: Transaction
  ): Promise<FileSystemBlobCleanupResource> {
    // Existing signed reads may still use the replaced blob. Keep it until
    // every URL issued before this commit has expired, plus a small margin.
    return this.makeNew(
      auth,
      node,
      blobId,
      new Date(Date.now() + RETIRED_BLOB_CLEANUP_DELAY_MS),
      transaction
    );
  }

  static async fetchForBlob(
    auth: Authenticator,
    node: FileSystemNodeResource,
    blobId: string,
    transaction: Transaction
  ): Promise<FileSystemBlobCleanupResource | null> {
    if (node.workspaceId !== auth.getNonNullableWorkspace().id) {
      return null;
    }

    const [cleanup] = await this.baseFetch(
      auth,
      { where: { nodeId: node.id, blobId }, limit: 1 },
      { transaction, forUpdate: true }
    );
    return cleanup ?? null;
  }

  async markBlobLive(
    auth: Authenticator,
    node: FileSystemNodeResource,
    transaction: Transaction
  ): Promise<boolean> {
    if (
      this.workspaceId !== auth.getNonNullableWorkspace().id ||
      this.workspaceId !== node.workspaceId ||
      this.nodeId !== node.id
    ) {
      return false;
    }

    return (
      (await this.model.destroy({
        where: { workspaceId: this.workspaceId, id: this.id },
        transaction,
      })) === 1
    );
  }

  /** Cross-workspace discovery only; every returned workspace is re-scoped. */
  static async dangerouslyListWorkspaceModelIdsWithDueCleanup(): Promise<
    ModelId[]
  > {
    const rows = await this.model.findAll({
      attributes: ["workspaceId"],
      where: { notBefore: { [Op.lte]: new Date() } },
      group: ["workspaceId"],
      order: [["workspaceId", "ASC"]],
      limit: CLEANUP_WORKSPACE_SCAN_SIZE,
      raw: true,
      // WORKSPACE_ISOLATION_BYPASS: only discovers workspace IDs. Callers
      // must build a workspace-scoped authenticator before reading entries.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    return [...new Set(rows.map((row) => row.workspaceId))];
  }

  private async deleteBlobIfStillPending(auth: Authenticator): Promise<void> {
    await withTransaction(async (transaction) => {
      const [current] = await FileSystemBlobCleanupResource.baseFetch(
        auth,
        { where: { id: this.id }, limit: 1 },
        { transaction, forUpdate: true }
      );
      if (!current || current.notBefore.getTime() > Date.now()) {
        return;
      }

      try {
        // Keep the cleanup row locked until GCS answers. A concurrent content
        // commit must either remove this row first or wait and fail safely;
        // it can never attach an object while this activity deletes it.
        await deleteFileSystemBlob(auth, current.nodeId, current.blobId);
      } catch (error) {
        logger.warn(
          {
            err: normalizeError(error),
            cleanupId: current.id,
            nodeId: current.nodeId,
            blobId: current.blobId,
          },
          "Dust filesystem blob cleanup failed"
        );
        await current.update(
          {
            attempts: current.attempts + 1,
            lastError: "GCS delete failed; see the filesystem cleanup log.",
          },
          transaction
        );
        return;
      }

      await current.model.destroy({
        where: { workspaceId: current.workspaceId, id: current.id },
        transaction,
      });
    });
  }

  /** Delete a bounded batch; failures remain queued for the next sweep. */
  static async repairPending(auth: Authenticator): Promise<void> {
    const pending = await this.baseFetch(auth, {
      where: { notBefore: { [Op.lte]: new Date() } },
      order: [
        ["notBefore", "ASC"],
        ["id", "ASC"],
      ],
      limit: CLEANUP_BATCH_SIZE,
    });

    await concurrentExecutor(
      pending,
      (cleanup) => cleanup.deleteBlobIfStillPending(auth),
      { concurrency: CLEANUP_DELETE_CONCURRENCY }
    );
  }
}

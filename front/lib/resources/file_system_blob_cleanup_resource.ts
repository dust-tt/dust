import type { Authenticator } from "@app/lib/auth";
import { FILE_SYSTEM_CONTENT_URL_EXPIRATION_MS } from "@app/lib/file_storage/file_system_blobs";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { FileSystemNodeResource } from "@app/lib/resources/file_system_node_resource";
import { FileSystemBlobCleanupModel } from "@app/lib/resources/storage/models/file_system_blob_cleanup";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { Result } from "@app/types/shared/result";
import type { Attributes, Transaction } from "sequelize";

const ABANDONED_UPLOAD_CLEANUP_DELAY_MS = 24 * 60 * 60 * 1000;
const RETIRED_BLOB_CLEANUP_DELAY_MS =
  FILE_SYSTEM_CONTENT_URL_EXPIRATION_MS + 5 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface FileSystemBlobCleanupResource
  extends ReadonlyAttributesType<FileSystemBlobCleanupModel> {}

/**
 * One durable request to delete an abandoned or replaced content blob.
 * A separate worker will claim these rows and delete the GCS objects.
 */
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
    {
      blobId,
      notBefore,
      transaction,
    }: { blobId: string; notBefore: Date; transaction?: Transaction }
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
    { blobId }: { blobId: string }
  ): Promise<FileSystemBlobCleanupResource> {
    return this.makeNew(auth, node, {
      blobId,
      notBefore: new Date(Date.now() + ABANDONED_UPLOAD_CLEANUP_DELAY_MS),
    });
  }

  static retireBlob(
    auth: Authenticator,
    node: FileSystemNodeResource,
    { blobId, transaction }: { blobId: string; transaction: Transaction }
  ): Promise<FileSystemBlobCleanupResource> {
    // Existing signed reads may still use the replaced blob. Keep it until
    // every URL issued before this commit has expired, plus a small margin.
    return this.makeNew(auth, node, {
      blobId,
      notBefore: new Date(Date.now() + RETIRED_BLOB_CLEANUP_DELAY_MS),
      transaction,
    });
  }

  static async fetchForBlob(
    auth: Authenticator,
    node: FileSystemNodeResource,
    { blobId }: { blobId: string }
  ): Promise<FileSystemBlobCleanupResource | null> {
    if (node.workspaceId !== auth.getNonNullableWorkspace().id) {
      return null;
    }

    const [cleanup] = await this.baseFetch(auth, {
      where: { nodeId: node.id, blobId },
      limit: 1,
    });
    return cleanup ?? null;
  }

  static async fetchForBlobForUpdate(
    auth: Authenticator,
    node: FileSystemNodeResource,
    { blobId, transaction }: { blobId: string; transaction: Transaction }
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
    { transaction }: { transaction: Transaction }
  ): Promise<boolean> {
    if (
      this.workspaceId !== auth.getNonNullableWorkspace().id ||
      this.workspaceId !== node.workspaceId ||
      this.nodeId !== node.id
    ) {
      return false;
    }

    const deletedCount = await this.model.destroy({
      where: { workspaceId: this.workspaceId, id: this.id },
      transaction,
    });

    return deletedCount === 1;
  }
}

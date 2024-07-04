// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
import type {
  FileType,
  LightWorkspaceType,
  ModelId,
  Result,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import type { Readable, Writable } from "stream";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { BaseResource } from "@app/lib/resources/base_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";

type FileVersion = "processed" | "original";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface FileResource extends ReadonlyAttributesType<FileModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class FileResource extends BaseResource<FileModel> {
  static model: ModelStatic<FileModel> = FileModel;

  constructor(model: ModelStatic<FileModel>, blob: Attributes<FileModel>) {
    super(FileModel, blob);
  }

  static async makeNew(
    blob: Omit<CreationAttributes<FileModel>, "status" | "sId">
  ) {
    const key = await FileResource.model.create({
      ...blob,
      status: "created",
    });

    return new this(FileResource.model, key.get());
  }

  static async fetchById(
    auth: Authenticator,
    id: string
  ): Promise<FileResource | null> {
    // TODO(2024-07-01 flav) Remove once we introduce AuthenticatorWithWorkspace.
    const owner = auth.workspace();
    if (!owner) {
      throw new Error("Unexpected unauthenticated call to `getUploadUrl`");
    }

    const fileModelId = getResourceIdFromSId(id);
    if (!fileModelId) {
      return null;
    }

    const blob = await this.model.findOne({
      where: {
        workspaceId: owner.id,
        id: fileModelId,
      },
    });
    if (!blob) {
      return null;
    }

    // Use `.get` to extract model attributes, omitting Sequelize instance metadata.
    return new this(this.model, blob.get());
  }

  static async deleteAllForWorkspace(
    workspace: LightWorkspaceType,
    transaction?: Transaction
  ) {
    return this.model.destroy({
      where: {
        workspaceId: workspace.id,
      },
      transaction,
    });
  }

  async delete(auth: Authenticator): Promise<Result<undefined, Error>> {
    try {
      if (this.isReady) {
        await getPrivateUploadBucket()
          .file(this.getCloudStoragePath(auth, "original"))
          .delete();

        // Delete the processed file if it exists.
        await getPrivateUploadBucket()
          .file(this.getCloudStoragePath(auth, "processed"))
          .delete({ ignoreNotFound: true });
      }

      await this.model.destroy({
        where: {
          id: this.id,
        },
      });

      return new Ok(undefined);
    } catch (error) {
      return new Err(error as Error);
    }
  }

  get sId(): string {
    return FileResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("file", {
      id,
      workspaceId,
    });
  }

  // Status logic.

  private async update(
    blob: Partial<CreationAttributes<FileModel>>
  ): Promise<void> {
    const [, affectedRows] = await this.model.update(blob, {
      where: {
        id: this.id,
      },
      returning: true,
    });

    // Update the resource to reflect the new status.
    Object.assign(this, affectedRows[0].get());
  }

  async markAsFailed(): Promise<void> {
    return this.update({ status: "failed" });
  }

  async markAsReady(): Promise<void> {
    return this.update({ status: "ready" });
  }

  get isReady(): boolean {
    return this.status === "ready";
  }

  get isCreated(): boolean {
    return this.status === "created";
  }

  get isFailed(): boolean {
    return this.status === "failed";
  }

  // Cloud storage logic.

  getPublicUrl(auth: Authenticator): string {
    // TODO(2024-07-01 flav) Remove once we introduce AuthenticatorWithWorkspace.
    const owner = auth.workspace();
    if (!owner) {
      throw new Error("Unexpected unauthenticated call to `getPublicUrl`");
    }

    return `${config.getAppUrl()}/api/w/${owner.sId}/files/${this.sId}`;
  }

  getCloudStoragePath(auth: Authenticator, version: FileVersion): string {
    // TODO(2024-07-01 flav) Remove once we introduce AuthenticatorWithWorkspace.
    const owner = auth.workspace();
    if (!owner) {
      throw new Error("Unexpected unauthenticated call to `getUploadUrl`");
    }

    return FileResource.getCloudStoragePathForId({
      fileId: this.sId,
      workspaceId: owner.sId,
      version,
    });
  }

  static getCloudStoragePathForId({
    fileId,
    workspaceId,
    version,
  }: {
    fileId: string;
    workspaceId: string;
    version: FileVersion;
  }) {
    return `files/w/${workspaceId}/${fileId}/${version}`;
  }

  async getSignedUrlForDownload(
    auth: Authenticator,
    version: FileVersion
  ): Promise<string> {
    return getPrivateUploadBucket().getSignedUrl(
      this.getCloudStoragePath(auth, version),
      {
        // Since we redirect, the use is immediate so expiry can be short.
        expirationDelay: 10 * 1000,
        promptSaveAs: this.fileName ?? `dust_${this.sId}`,
      }
    );
  }

  // Stream logic.

  getWriteStream(auth: Authenticator, version: FileVersion): Writable {
    return getPrivateUploadBucket()
      .file(this.getCloudStoragePath(auth, version))
      .createWriteStream({
        resumable: false,
        gzip: true,
      });
  }

  getReadStream(auth: Authenticator, version: FileVersion): Readable {
    return getPrivateUploadBucket()
      .file(this.getCloudStoragePath(auth, version))
      .createReadStream();
  }

  // Serialization logic.

  toJSON(auth: Authenticator): FileType {
    const blob: FileType = {
      contentType: this.contentType,
      fileName: this.fileName,
      fileSize: this.fileSize,
      id: this.sId,
      status: this.status,
      useCase: this.useCase,
    };

    if (this.isCreated) {
      blob.uploadUrl = this.getPublicUrl(auth);
    } else if (this.isReady) {
      blob.downloadUrl = this.getPublicUrl(auth);
    }

    return blob;
  }
}

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
import type {
  FileId,
  FileType,
  LightWorkspaceType,
  Result,
} from "@dust-tt/types";
import { FILE_ID_PREFIX } from "@dust-tt/types";
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
import { generateModelSId } from "@app/lib/utils";

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
    const fileId = makeDustFileId();

    const key = await FileResource.model.create({
      ...blob,
      status: "created",
      sId: fileId,
    });

    return new this(FileResource.model, key.get());
  }

  static async fetchById(
    auth: Authenticator,
    id: FileId
  ): Promise<FileResource | null> {
    // TODO(2024-07-01 flav) Remove once we introduce AuthenticatorWithWorkspace.
    const owner = auth.workspace();
    if (!owner) {
      throw new Error("Unexpected unauthenticated call to `getUploadUrl`");
    }

    const blob = await this.model.findOne({
      where: {
        workspaceId: owner.id,
        sId: id,
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

  get isReady(): boolean {
    return this.status === "ready";
  }

  get isCreated(): boolean {
    return this.status === "created";
  }

  get isFailed(): boolean {
    return this.status === "failed";
  }

  getDownloadUrl(auth: Authenticator): string {
    // TODO(2024-07-01 flav) Remove once we introduce AuthenticatorWithWorkspace.
    const owner = auth.workspace();
    if (!owner) {
      throw new Error("Unexpected unauthenticated call to `getDownloadUrl`");
    }

    // TODO:
    return `${config.getAppUrl()}/api/w/${owner.sId}/files/${this.sId}`;
  }

  getUploadUrl(auth: Authenticator): string {
    // TODO(2024-07-01 flav) Remove once we introduce AuthenticatorWithWorkspace.
    const owner = auth.workspace();
    if (!owner) {
      throw new Error("Unexpected unauthenticated call to `getUploadUrl`");
    }

    return `${config.getAppUrl()}/api/w/${owner.sId}/files/${this.sId}`;
  }

  getCloudStoragePath(auth: Authenticator): string {
    // TODO(2024-07-01 flav) Remove once we introduce AuthenticatorWithWorkspace.
    const owner = auth.workspace();
    if (!owner) {
      throw new Error("Unexpected unauthenticated call to `getUploadUrl`");
    }

    return `files/w/${owner.sId}/${this.sId}`;
  }

  async uploadStream(auth: Authenticator, stream: Readable): Promise<void> {
    const filePath = this.getCloudStoragePath(auth);

    await getPrivateUploadBucket().uploadStream(filePath, stream, {
      contentType: this.contentType,
    });

    await this.model.update(
      {
        status: "ready",
      },
      {
        where: {
          id: this.id,
        },
      }
    );

    // Update the resource to reflect the new status.
    this.status = "ready";
  }

  getStream(auth: Authenticator): Writable {
    return getPrivateUploadBucket()
      .file(this.getCloudStoragePath(auth))
      .createWriteStream({
        resumable: false,
        gzip: true,
      });
  }

  delete(): Promise<Result<undefined, Error>> {
    throw new Error("Method not implemented.");
  }

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
      blob.uploadUrl = this.getUploadUrl(auth);
    } else if (this.isReady) {
      blob.downloadUrl = this.getDownloadUrl(auth);
    }

    return blob;
  }
}

function makeDustFileId(): FileId {
  const fileId = generateModelSId();
  return `${FILE_ID_PREFIX}${fileId}`;
}

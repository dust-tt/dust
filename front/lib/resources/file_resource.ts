// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
import type {
  FileType,
  FileTypeWithUploadUrl,
  LightWorkspaceType,
  ModelId,
  Result,
  UserType,
} from "@dust-tt/types";
import { Err, Ok, removeNulls } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import type { Readable, Writable } from "stream";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import {
  getPrivateUploadBucket,
  getPublicUploadBucket,
} from "@app/lib/file_storage";
import { BaseResource } from "@app/lib/resources/base_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";

type FileVersion = "processed" | "original" | "public" | "snippet";

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
    const res = await FileResource.fetchByIds(auth, [id]);

    return res.length > 0 ? res[0] : null;
  }

  static async fetchByIds(
    auth: Authenticator,
    ids: string[]
  ): Promise<FileResource[]> {
    const owner = auth.getNonNullableWorkspace();

    const fileModelIds = removeNulls(ids.map((id) => getResourceIdFromSId(id)));

    const blobs = await this.model.findAll({
      where: {
        workspaceId: owner.id,
        id: fileModelIds,
      },
    });

    return blobs.map((blob) => new this(this.model, blob.get()));
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

  static async deleteAllForUser(user: UserType, transaction?: Transaction) {
    // We don't actually delete, instead we set the userId field to null.
    return this.model.update(
      { userId: null },
      {
        where: {
          userId: user.id,
        },
        transaction,
      }
    );
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
        // Delete the snippet file if it exists.
        await getPrivateUploadBucket()
          .file(this.getCloudStoragePath(auth, "snippet"))
          .delete({ ignoreNotFound: true });
        // Delete the public file if it exists.
        await getPublicUploadBucket()
          .file(this.getCloudStoragePath(auth, "public"))
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

  async markAsFailed() {
    return this.update({ status: "failed" });
  }

  async markAsReady() {
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
    const owner = auth.getNonNullableWorkspace();

    return `${config.getClientFacingUrl()}/api/w/${owner.sId}/files/${this.sId}`;
  }

  getCloudStoragePath(auth: Authenticator, version: FileVersion): string {
    const owner = auth.getNonNullableWorkspace();

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

  // Available when the file has been pre-processed with uploadToPublicBucket.
  getPublicUrlForDownload(auth: Authenticator): string {
    return getPublicUploadBucket()
      .file(this.getCloudStoragePath(auth, "public"))
      .publicUrl();
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

  getWriteStream({
    auth,
    version,
    overrideContentType,
  }: {
    auth: Authenticator;
    version: FileVersion;
    overrideContentType?: string;
  }): Writable {
    if (version === "public") {
      return getPublicUploadBucket()
        .file(this.getCloudStoragePath(auth, version))
        .createWriteStream({
          resumable: false,
          gzip: true,
          contentType: overrideContentType ?? this.contentType,
        });
    } else {
      return getPrivateUploadBucket()
        .file(this.getCloudStoragePath(auth, version))
        .createWriteStream({
          resumable: false,
          gzip: true,
          contentType: overrideContentType ?? this.contentType,
        });
    }
  }

  getReadStream({
    auth,
    version,
  }: {
    auth: Authenticator;
    version: FileVersion;
  }): Readable {
    if (version === "public") {
      return getPublicUploadBucket()
        .file(this.getCloudStoragePath(auth, version))
        .createReadStream();
    } else {
      return getPrivateUploadBucket()
        .file(this.getCloudStoragePath(auth, version))
        .createReadStream();
    }
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

    if (this.isReady) {
      blob.downloadUrl = this.getPublicUrl(auth);
    }

    if (this.useCase === "avatar") {
      blob.publicUrl = this.getPublicUrlForDownload(auth);
    }

    return blob;
  }

  toJSONWithUploadUrl(auth: Authenticator): FileTypeWithUploadUrl {
    const blob = this.toJSON(auth);

    return {
      ...blob,
      uploadUrl: this.getPublicUrl(auth),
    };
  }
}

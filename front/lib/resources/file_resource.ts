// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
import type { Attributes, CreationAttributes, Transaction } from "sequelize";
import type { Readable, Writable } from "stream";

import config from "@app/lib/api/config";
import {
  generateSignedToken,
  verifySignedToken,
} from "@app/lib/api/files/share_tokens";
import type { Authenticator } from "@app/lib/auth";
import {
  getPrivateUploadBucket,
  getPublicUploadBucket,
  getUpsertQueueBucket,
} from "@app/lib/file_storage";
import { isFileUsingConversationFiles } from "@app/lib/files";
import { BaseResource } from "@app/lib/resources/base_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type {
  FileType,
  FileTypeWithUploadUrl,
  FileUseCaseMetadata,
  LightWorkspaceType,
  ModelId,
  Result,
  UserType,
} from "@app/types";
import {
  ALL_FILE_FORMATS,
  Err,
  isInteractiveContentType,
  normalizeError,
  Ok,
  removeNulls,
} from "@app/types";

import type { ModelStaticWorkspaceAware } from "./storage/wrappers/workspace_models";

export type FileVersion = "processed" | "original" | "public";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface FileResource extends ReadonlyAttributesType<FileModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class FileResource extends BaseResource<FileModel> {
  static model: ModelStaticWorkspaceAware<FileModel> = FileModel;

  constructor(
    model: ModelStaticWorkspaceAware<FileModel>,
    blob: Attributes<FileModel>
  ) {
    super(FileModel, blob);
  }

  static async makeNew(
    blob: Omit<CreationAttributes<FileModel>, "status" | "sId" | "sharedAt">
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

  static override async fetchByModelId(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _id: ModelId,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _transaction?: Transaction
  ): Promise<null> {
    // Workspace isolation is handled in `fetchByModelIdWithAuth`.
    throw Error(
      "Not implemented. `fetchByModelIdWithAuth` should be used instead"
    );
  }

  static async fetchByModelIdWithAuth(
    auth: Authenticator,
    id: ModelId,
    transaction?: Transaction
  ): Promise<FileResource | null> {
    const file = await this.model.findOne({
      where: {
        id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });

    return file ? new this(this.model, file.get()) : null;
  }

  static async fetchByShareTokenWithContent(
    token: string
  ): Promise<{ file: FileResource; content: string } | null> {
    const tokenRes = verifySignedToken(token, config.getFileShareSecret());
    if (tokenRes.isErr()) {
      return null;
    }

    const workspace = await WorkspaceResource.fetchById(tokenRes.value.wId);
    if (!workspace) {
      return null;
    }

    const fileId = getResourceIdFromSId(tokenRes.value.fId);
    if (!fileId) {
      return null;
    }

    const blob = await this.model.findOne({
      where: {
        id: fileId,
        workspaceId: workspace.id,
      },
    });

    const file = blob ? new this(this.model, blob.get()) : null;
    if (!file || !file.isShared) {
      return null;
    }

    // Validate that the token's sharedAt timestamp matches the file's current sharedAt timestamp.
    if (!file.sharedAt || tokenRes.value.sAt !== file.sharedAt.getTime()) {
      return null;
    }

    const content = await file.getFileContent(
      renderLightWorkspaceType({ workspace }),
      "original"
    );

    if (!content) {
      return null;
    }

    if (isFileUsingConversationFiles(content)) {
      // Set the file as not shared.
      await file.setIsShared(false);

      return null;
    }

    return {
      file,
      content,
    };
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

  static async deleteAllForUser(
    auth: Authenticator,
    user: UserType,
    transaction?: Transaction
  ) {
    // We don't actually delete, instead we set the userId field to null.
    return this.model.update(
      { userId: null },
      {
        where: {
          userId: user.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        transaction,
      }
    );
  }

  async delete(auth: Authenticator): Promise<Result<undefined, Error>> {
    try {
      if (this.isReady) {
        await this.getBucketForVersion("original")
          .file(this.getCloudStoragePath(auth, "original"))
          .delete();

        // Delete the processed file if it exists.
        await this.getBucketForVersion("processed")
          .file(this.getCloudStoragePath(auth, "processed"))
          .delete({ ignoreNotFound: true });
        // Delete the public file if it exists.
        await this.getBucketForVersion("public")
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
      return new Err(normalizeError(error));
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

  get updatedAtMs(): number {
    return this.updatedAt.getTime();
  }

  get isShared(): boolean {
    return this.sharedAt !== null;
  }

  get sharedAtMs(): number | null {
    return this.sharedAt?.getTime() ?? null;
  }

  // Cloud storage logic.

  getPrivateUrl(auth: Authenticator): string {
    const owner = auth.getNonNullableWorkspace();

    return `${config.getClientFacingUrl()}/api/w/${owner.sId}/files/${this.sId}`;
  }

  getPublicUrl(auth: Authenticator): string {
    const owner = auth.getNonNullableWorkspace();

    return `${config.getClientFacingUrl()}/api/v1/w/${owner.sId}/files/${this.sId}`;
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
    return `${this.getBaseCloudStorageForWorkspace({ workspaceId })}${fileId}/${version}`;
  }

  static getBaseCloudStorageForWorkspace({
    workspaceId,
  }: {
    workspaceId: string;
  }) {
    return `files/w/${workspaceId}/`;
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
    return this.getBucketForVersion(version).getSignedUrl(
      this.getCloudStoragePath(auth, version),
      {
        // Since we redirect, the use is immediate so expiry can be short.
        expirationDelay: 10 * 1000,
        promptSaveAs: this.fileName ?? `dust_${this.sId}`,
      }
    );
  }

  // Use-case logic

  isUpsertUseCase(): boolean {
    return ["upsert_document", "upsert_table"].includes(this.useCase);
  }

  getBucketForVersion(version: FileVersion) {
    if (version === "public") {
      return getPublicUploadBucket();
    }
    return this.isUpsertUseCase()
      ? getUpsertQueueBucket()
      : getPrivateUploadBucket();
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
    return this.getBucketForVersion(version)
      .file(this.getCloudStoragePath(auth, version))
      .createWriteStream({
        resumable: false,
        gzip: true,
        contentType: overrideContentType ?? this.contentType,
      });
  }

  getReadStream({
    auth,
    version,
  }: {
    auth: Authenticator;
    version: FileVersion;
  }): Readable {
    return this.getBucketForVersion(version)
      .file(this.getCloudStoragePath(auth, version))
      .createReadStream();
  }

  /**
   * Get read stream for shared access without authentication.
   */
  private async getSharedReadStream(
    owner: LightWorkspaceType,
    version: FileVersion
  ): Promise<Readable> {
    const cloudPath = FileResource.getCloudStoragePathForId({
      fileId: this.sId,
      workspaceId: owner.sId,
      version,
    });

    return this.getBucketForVersion(version).file(cloudPath).createReadStream();
  }

  /**
   * Get file content as string for shared access without authentication.
   */
  private async getFileContent(
    owner: LightWorkspaceType,
    version: FileVersion = "original"
  ): Promise<string | null> {
    try {
      const readStream = await this.getSharedReadStream(owner, version);

      // Convert stream to string.
      const chunks: Buffer[] = [];
      for await (const chunk of readStream) {
        chunks.push(chunk);
      }

      const content = Buffer.concat(chunks).toString("utf-8");
      return content || null;
    } catch (error) {
      return null;
    }
  }

  // Direct upload logic.

  async uploadContent(auth: Authenticator, content: string): Promise<void> {
    // Update the file size.
    await this.update({
      fileSize: Buffer.byteLength(content, "utf8"),
    });

    await this.getBucketForVersion("original").uploadRawContentToBucket({
      content,
      contentType: this.contentType,
      filePath: this.getCloudStoragePath(auth, "original"),
    });

    // Mark the file as ready.
    await this.markAsReady();
  }

  setUseCaseMetadata(metadata: FileUseCaseMetadata) {
    return this.update({ useCaseMetadata: metadata });
  }

  setSnippet(snippet: string) {
    return this.update({ snippet });
  }

  setIsShared(isShared: boolean) {
    // Only interactive files can be shared.
    if (
      this.useCase !== "conversation" ||
      !isInteractiveContentType(this.contentType)
    ) {
      throw new Error("Only interactive files can be shared");
    }

    return this.update({ sharedAt: isShared ? new Date() : null });
  }

  // Sharing logic.

  private getShareToken(auth: Authenticator): string | null {
    return generateSignedToken(auth, this, {
      secret: config.getFileShareSecret(),
    });
  }

  getShareUrl(auth: Authenticator): string | null {
    if (!this.isShared) {
      return null;
    }

    const token = this.getShareToken(auth);
    if (!token) {
      return null;
    }

    return `${config.getClientFacingUrl()}/share/file/${token}`;
  }

  // Serialization logic.

  toJSON(auth?: Authenticator): FileType {
    const blob: FileType = {
      // TODO(spolu): move this to ModelId
      id: this.sId,
      sId: this.sId,
      contentType: this.contentType,
      fileName: this.fileName,
      fileSize: this.fileSize,
      status: this.status,
      useCase: this.useCase,
    };

    if (auth && this.isReady && !this.isUpsertUseCase()) {
      blob.downloadUrl = this.getPrivateUrl(auth);
    }

    if (auth && this.useCase === "avatar") {
      blob.publicUrl = this.getPublicUrlForDownload(auth);
    }

    return blob;
  }

  toJSONWithUploadUrl(auth: Authenticator): FileTypeWithUploadUrl {
    const blob = this.toJSON(auth);

    return {
      ...blob,
      uploadUrl: this.getPrivateUrl(auth),
    };
  }

  toPublicJSON(auth: Authenticator): FileType {
    const blob: FileType = {
      // TODO(spolu): move this to ModelId
      id: this.sId,
      sId: this.sId,
      contentType: this.contentType,
      fileName: this.fileName,
      fileSize: this.fileSize,
      status: this.status,
      useCase: this.useCase,
    };

    if (this.isReady && !this.isUpsertUseCase()) {
      // TODO(thomas): This should be a public URL, need to solve authorization
      blob.downloadUrl = this.getPrivateUrl(auth);
    }

    if (this.useCase === "avatar") {
      blob.publicUrl = this.getPublicUrlForDownload(auth);
    }

    return blob;
  }

  toPublicJSONWithUploadUrl(auth: Authenticator): FileTypeWithUploadUrl {
    const blob = this.toPublicJSON(auth);

    return {
      ...blob,
      uploadUrl: this.getPublicUrl(auth),
    };
  }

  isSafeToDisplay(): boolean {
    return ALL_FILE_FORMATS[this.contentType].isSafeToDisplay;
  }
}

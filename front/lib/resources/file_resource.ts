// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.

import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import {
  getPrivateUploadBucket,
  getPublicUploadBucket,
  getUpsertQueueBucket,
} from "@app/lib/file_storage";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import {
  FileModel,
  ShareableFileModel,
} from "@app/lib/resources/storage/models/files";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type {
  FileShareScope,
  FileType,
  FileTypeWithMetadata,
  FileTypeWithUploadUrl,
  FileUseCase,
  FileUseCaseMetadata,
} from "@app/types/files";
import {
  ALL_FILE_FORMATS,
  frameContentType,
  isInteractiveContentFileContentType,
} from "@app/types/files";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import type { File } from "@google-cloud/storage";
import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";
import type { Readable, Writable } from "stream";
import { validate } from "uuid";

import type { ModelStaticWorkspaceAware } from "./storage/wrappers/workspace_models";

export type FileVersion = "processed" | "original" | "public";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface FileResource extends ReadonlyAttributesType<FileModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class FileResource extends BaseResource<FileModel> {
  static model: ModelStaticWorkspaceAware<FileModel> = FileModel;
  static shareableFileModel: ModelStaticWorkspaceAware<ShareableFileModel> =
    ShareableFileModel;

  constructor(
    model: ModelStaticWorkspaceAware<FileModel>,
    blob: Attributes<FileModel>
  ) {
    super(FileModel, blob);
  }

  static async makeNew(
    blob: Omit<CreationAttributes<FileModel>, "status" | "sId" | "version">
  ) {
    const key = await FileResource.model.create({
      ...blob,
      status: "created",
      version: 0,
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
    _id: ModelId,

    _transaction?: Transaction
  ): Promise<null> {
    // Workspace isolation is handled in `fetchByModelIdWithAuth`.
    throw Error(
      "Not implemented. `fetchByModelIdWithAuth` should be used instead"
    );
  }

  static async fetchByModelIdsWithAuth(
    auth: Authenticator,
    ids: ModelId[],
    transaction?: Transaction
  ): Promise<FileResource[]> {
    const files = await this.model.findAll({
      where: {
        id: {
          [Op.in]: ids,
        },
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });

    return files.map((f) => new this(this.model, f.get()));
  }

  static async fetchByModelIdWithAuth(
    auth: Authenticator,
    id: ModelId,
    transaction?: Transaction
  ): Promise<FileResource | null> {
    const [file] = await this.fetchByModelIdsWithAuth(auth, [id], transaction);

    return file ?? null;
  }

  static async fetchByShareTokenWithContent(token: string): Promise<{
    file: FileResource;
    content: string;
    shareScope: FileShareScope;
  } | null> {
    if (!validate(token)) {
      return null;
    }

    const shareableFile = await this.shareableFileModel.findOne({
      where: { token },
      // WORKSPACE_ISOLATION_BYPASS: Used when a frame is accessed through a public token, at this
      // point we don't know the workspaceId.
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });
    if (!shareableFile) {
      return null;
    }

    const [workspace] = await WorkspaceResource.fetchByModelIds([
      shareableFile.workspaceId,
    ]);
    if (!workspace) {
      return null;
    }

    const file = await this.model.findOne({
      where: {
        id: shareableFile.fileId,
        workspaceId: workspace.id,
      },
    });

    const fileRes = file ? new this(this.model, file.get()) : null;
    if (!fileRes) {
      return null;
    }

    // Check if associated conversation still exist (not soft-deleted).
    if (
      fileRes.useCase === "conversation" &&
      fileRes.useCaseMetadata?.conversationId
    ) {
      const conversationId = fileRes.useCaseMetadata.conversationId;

      const auth = await Authenticator.internalBuilderForWorkspace(
        workspace.sId
      );

      // Share token access bypasses normal space restrictions. We only need to verify the
      // conversation exists, but internalBuilderForWorkspace only has global group
      // access and can't see agents from other groups that this conversation might reference.
      // Skip permission filtering since share token provides its own authorization.
      const conversation = await ConversationResource.fetchById(
        auth,
        conversationId,
        { dangerouslySkipPermissionFiltering: true }
      );
      if (!conversation) {
        return null;
      }
    }

    const content = await fileRes.getFileContent(
      renderLightWorkspaceType({ workspace }),
      "original"
    );

    if (!content) {
      return null;
    }

    return {
      file: fileRes,
      content,
      shareScope: shareableFile.shareScope,
    };
  }

  static async unsafeFetchByIdInWorkspace(
    workspace: LightWorkspaceType,
    id: string
  ): Promise<FileResource | null> {
    const fileModelId = getResourceIdFromSId(id);
    if (!fileModelId) {
      return null;
    }

    const file = await this.model.findOne({
      where: {
        workspaceId: workspace.id,
        id: fileModelId,
      },
    });

    return file ? new this(this.model, file.get()) : null;
  }

  static async listByProject(
    auth: Authenticator,
    {
      projectId,
    }: {
      projectId: string;
    }
  ): Promise<FileResource[]> {
    const owner = auth.getNonNullableWorkspace();

    const whereClause: WhereOptions = {
      workspaceId: owner.id,
      useCase: "project_context",
      status: "ready",
      useCaseMetadata: { spaceId: projectId },
    };

    const files = await this.model.findAll({
      where: whereClause,
      order: [["createdAt", "DESC"]],
    });

    return files.map((f) => new this(this.model, f.get()));
  }

  static async deleteAllForWorkspace(auth: Authenticator) {
    // Delete all shareable file records.
    await this.shareableFileModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    return this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
  }

  static async deleteAllForUser(
    auth: Authenticator,
    user: UserType,
    transaction?: Transaction
  ) {
    // We don't actually delete, instead we set the userId field to null.

    await this.shareableFileModel.update(
      {
        sharedBy: null,
      },
      {
        where: {
          sharedBy: user.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        transaction,
      }
    );

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

        // Delete the shareable file record.
        await FileResource.shareableFileModel.destroy({
          where: {
            fileId: this.id,
            workspaceId: this.workspaceId,
          },
        });
      }

      await this.model.destroy({
        where: {
          id: this.id,
          workspaceId: this.workspaceId,
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
    // Early return if the file is already ready.
    if (this.status === "ready") {
      return;
    }

    const updateResult = await this.update({ status: "ready" });

    // For Interactive Content conversation files, automatically create a ShareableFileModel with
    // default workspace scope.
    if (this.isInteractiveContent) {
      await FileResource.shareableFileModel.upsert({
        fileId: this.id,
        shareScope: "workspace",
        sharedBy: this.userId ?? null,
        workspaceId: this.workspaceId,
        sharedAt: new Date(),
        token: crypto.randomUUID(),
      });
    }

    return updateResult;
  }

  get isReady(): boolean {
    return this.status === "ready";
  }

  get isFailed(): boolean {
    return this.status === "failed";
  }

  get updatedAtMs(): number {
    return this.updatedAt.getTime();
  }

  get isInteractiveContent(): boolean {
    return (
      this.useCase === "conversation" &&
      isInteractiveContentFileContentType(this.contentType)
    );
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

  private async getSignedUrl(
    auth: Authenticator,
    version: FileVersion,
    expirationDelayMs: number,
    promptSaveAs?: string
  ): Promise<string> {
    return this.getBucketForVersion(version).getSignedUrl(
      this.getCloudStoragePath(auth, version),
      {
        expirationDelayMs: expirationDelayMs,
        ...(promptSaveAs !== undefined && { promptSaveAs }),
      }
    );
  }

  async getSignedUrlForDownload(
    auth: Authenticator,
    version: FileVersion
  ): Promise<string> {
    const expirationDelayMs = 30 * 1000;
    const promptSaveAs = this.fileName ?? `dust_${this.sId}`;

    return this.getSignedUrl(auth, version, expirationDelayMs, promptSaveAs);
  }

  /**
   * Get a signed URL without downloading
   * Unlike getSignedUrlForDownload, this doesn't set Content-Disposition header,
   * allowing for instance file viewers to render the file inline
   */
  async getSignedUrlForInlineView(auth: Authenticator): Promise<string> {
    const version = "original";
    const expirationDelayMs = 5 * 60 * 1000;
    return this.getSignedUrl(auth, version, expirationDelayMs);
  }

  // Use-case logic

  isUpsertUseCase(): boolean {
    return ["upsert_document", "upsert_table"].includes(this.useCase);
  }

  /**
   * Check if this file belongs to a specific conversation by comparing the
   * conversationId stored in useCaseMetadata.
   *
   * @param requestedConversationId The conversation ID to check against
   * @returns Ok(true) if file belongs to the conversation, Ok(false) if it belongs
   *          to a different conversation, Err if file is not associated with any conversation
   */
  belongsToConversation(
    requestedConversationId: string
  ): Result<boolean, Error> {
    const { useCaseMetadata } = this;

    if (!useCaseMetadata?.conversationId) {
      return new Err(new Error("File is not associated with a conversation"));
    }

    // Direct access, file belongs to the requested conversation.
    if (useCaseMetadata.conversationId === requestedConversationId) {
      return new Ok(true);
    }

    return new Ok(false);
  }

  getBucketForVersion(version: FileVersion) {
    if (version === "public") {
      return getPublicUploadBucket();
    }
    return this.isUpsertUseCase()
      ? getUpsertQueueBucket()
      : getPrivateUploadBucket();
  }

  /**
   * Get sorted file versions from GCS (newest first).
   * Used for reverting Interactive Content files to previous versions.
   * Returns an empty array if versions cannot be retrieved.
   */
  private async getSortedFileVersions(
    auth: Authenticator,
    maxResults?: number
  ): Promise<File[]> {
    const filePath = this.getCloudStoragePath(auth, "original");
    const fileStorage = getPrivateUploadBucket();

    return fileStorage.getSortedFileVersions({
      filePath,
      maxResults,
    });
  }

  /**
   * Revert the file to its previous version.
   * Uses GCS copy function to restore the previous version as the current version.
   * Deletes old versions to prevent accumulation.
   */
  async revert(
    auth: Authenticator,
    {
      revertedByAgentConfigurationId,
    }: {
      revertedByAgentConfigurationId: string;
    }
  ): Promise<Result<undefined, string>> {
    // Get all versions of the file (sorted newest to oldest)
    const versions = await this.getSortedFileVersions(auth);

    // Check if there's a previous version available before attempting revert
    if (versions.length < 2) {
      return new Err("No previous version available to revert to");
    }

    const currentVersion = versions[0];
    const previousVersion = versions[1];

    // Update metadata before copy
    await this.setUseCaseMetadata({
      ...this.useCaseMetadata,
      lastEditedByAgentConfigurationId: revertedByAgentConfigurationId,
    });

    // Use GCS copy function to make a copy of the previous version the current version
    const filePath = this.getCloudStoragePath(auth, "original");
    const bucket = this.getBucketForVersion("original");
    const destinationFile = bucket.file(filePath);

    try {
      await previousVersion.copy(destinationFile);
    } catch (error) {
      return new Err(
        `Revert unsuccessful. Failed to copy previous version: ${normalizeError(error)}`
      );
    }

    // Delete old versions to prevent accumulation and infinite loops
    try {
      // Decrement version after deletion to ensure version counter only changes on success
      await currentVersion.delete();
      await previousVersion.delete();
      await this.decrementVersion();
    } catch (error) {
      logger.error(
        {
          fileId: this.sId,
          workspaceId: this.workspaceId,
          error: normalizeError(error),
        },
        "Failed to delete old file versions after successful revert, future reverts may loop"
      );
    }

    return new Ok(undefined);
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
  getSharedReadStream(
    owner: LightWorkspaceType,
    version: FileVersion
  ): Readable {
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
      const readStream = this.getSharedReadStream(owner, version);

      // Convert stream to string.
      const chunks: Buffer[] = [];
      for await (const chunk of readStream) {
        chunks.push(chunk);
      }

      const content = Buffer.concat(chunks).toString("utf-8");
      return content || null;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      // biome-ignore lint/correctness/noUnusedVariables: ignored using `--suppress`
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

    // Increment version after successful upload and mark as ready
    await this.incrementVersion();
    await this.markAsReady();
  }

  setUseCaseMetadata(metadata: FileUseCaseMetadata) {
    return this.update({ useCaseMetadata: metadata });
  }

  setSnippet(snippet: string) {
    return this.update({ snippet });
  }

  private incrementVersion() {
    return this.update({ version: this.version + 1 });
  }

  private decrementVersion() {
    return this.update({ version: Math.max(0, this.version - 1) });
  }

  rename(newFileName: string) {
    return this.update({ fileName: newFileName });
  }

  // Sharing logic.

  private getShareUrlForShareableFile({
    shareableFileToken,
  }: {
    shareableFileToken: string;
  }): string {
    assert(
      this.isInteractiveContent,
      "getShareUrlForShareableFile called on non-interactive content file"
    );

    if (this.contentType === frameContentType) {
      return `${config.getAppUrl()}/share/frame/${shareableFileToken}`;
    }

    return `${config.getAppUrl()}/share/file/${shareableFileToken}`;
  }

  async setShareScope(
    auth: Authenticator,
    scope: FileShareScope
  ): Promise<void> {
    // Only Interactive Content files can be shared.
    if (!this.isInteractiveContent) {
      throw new Error("Only Interactive Content files can be shared");
    }

    const user = auth.getNonNullableUser();

    // Always update the existing ShareableFileModel record (never delete).
    const existingShare = await FileResource.shareableFileModel.findOne({
      where: { fileId: this.id, workspaceId: this.workspaceId },
    });

    assert(
      existingShare,
      `ShareableFileModel record not found for file ${this.sId}`
    );

    await existingShare.update({
      shareScope: scope,
      sharedBy: user.id,
      sharedAt: new Date(),
    });
  }

  async getShareInfo(): Promise<{
    scope: FileShareScope;
    sharedAt: Date;
    shareUrl: string;
  } | null> {
    if (!this.isInteractiveContent) {
      return null;
    }

    const shareableFile = await FileResource.shareableFileModel.findOne({
      where: { fileId: this.id, workspaceId: this.workspaceId },
    });

    if (shareableFile) {
      return {
        scope: shareableFile.shareScope,
        sharedAt: shareableFile.sharedAt,
        shareUrl: this.getShareUrlForShareableFile({
          shareableFileToken: shareableFile.token,
        }),
      };
    }

    return null;
  }

  static async revokePublicSharingInWorkspace(auth: Authenticator) {
    const workspaceId = auth.getNonNullableWorkspace().id;
    return FileResource.shareableFileModel.update(
      {
        shareScope: "workspace",
      },
      {
        where: {
          workspaceId,
          shareScope: "public",
        },
      }
    );
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
      version: this.version,
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

  toJSONWithMetadata(auth: Authenticator): FileTypeWithMetadata {
    const blob = this.toJSON(auth);

    return {
      ...blob,
      useCaseMetadata: this.useCaseMetadata ?? {},
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
      version: this.version,
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

  /**
   * Copy a file to a new file with the specified use case and metadata.
   * This method copies both the file metadata and the content stored in GCS.
   *
   * @param auth - Authenticator for workspace isolation
   * @param params - Parameters for copying the file
   * @param params.sourceId - The sId of the source file to copy
   * @param params.useCase - The use case for the new file
   * @param params.useCaseMetadata - Metadata for the new file's use case
   * @returns Result containing the new FileResource or an error
   */
  static async copy(
    auth: Authenticator,
    {
      sourceId,
      useCase,
      useCaseMetadata,
    }: {
      sourceId: string;
      useCase: FileUseCase;
      useCaseMetadata?: FileUseCaseMetadata;
    }
  ): Promise<
    Result<
      FileResource,
      Error | { name: "dust_error"; code: string; message: string }
    >
  > {
    // Fetch the source file.
    const sourceFile = await FileResource.fetchById(auth, sourceId);
    if (!sourceFile) {
      return new Err(new Error(`Source file not found: ${sourceId}`));
    }

    if (!sourceFile.isReady) {
      return new Err(
        new Error(
          `Source file is not ready for copying: ${sourceId} (status: ${sourceFile.status})`
        )
      );
    }

    try {
      // Create a new file with the same properties.
      const newFile = await FileResource.makeNew({
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: auth.user()?.id ?? null,
        contentType: sourceFile.contentType,
        fileName: sourceFile.fileName,
        fileSize: sourceFile.fileSize,
        useCase,
        useCaseMetadata,
      });

      // Get a read stream from the source file's original version.
      const readStream = sourceFile.getReadStream({
        auth,
        version: "original",
      });

      // Use processAndStoreFile to handle the content processing and storage.
      const { processAndStoreFile } = await import(
        "@app/lib/api/files/processing"
      );
      const result = await processAndStoreFile(auth, {
        file: newFile,
        content: {
          type: "readable",
          value: readStream,
        },
      });

      if (result.isErr()) {
        return new Err(result.error);
      }

      return new Ok(result.value);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }
}

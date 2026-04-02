// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.

import config from "@app/lib/api/config";
import {
  disambiguateFileName,
  getConversationFilePath,
  makeProcessedMountFileName,
} from "@app/lib/api/files/mount_path";
import {
  getProcessedContentType,
  hasProcessedVersion,
} from "@app/lib/api/files/processing";
import { fetchProjectDataSource } from "@app/lib/api/projects/data_sources";
import {
  getDefaultFrameShareScope,
  sendFrameSharedEmail,
} from "@app/lib/api/share/frame_sharing";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import {
  getPrivateUploadBucket,
  getPublicUploadBucket,
  getUpsertQueueBucket,
} from "@app/lib/file_storage";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  ExternalViewerSessionModel,
  FileModel,
  ShareableFileModel,
  SharingGrantModel,
} from "@app/lib/resources/storage/models/files";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { copyContent } from "@app/lib/utils/files";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import type {
  FileShareScope,
  FileType,
  FileTypeWithMetadata,
  FileTypeWithUploadUrl,
  FileUseCase,
  FileUseCaseMetadata,
  SharingGrantType,
} from "@app/types/files";
import {
  ALL_FILE_FORMATS,
  isConversationFileUseCase,
  isInteractiveContentType,
} from "@app/types/files";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import type {
  LightWorkspaceType,
  UserType,
  WorkspaceSharingPolicy,
} from "@app/types/user";
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
    const r = await this.fetchByShareToken(token);
    if (r.isErr()) {
      return null;
    }

    const { file, shareScope, workspace } = r.value;
    const content = await file.getFileContent(workspace, "original");
    if (!content) {
      return null;
    }

    return {
      file,
      content,
      shareScope,
    };
  }

  static async fetchByShareToken(token: string): Promise<
    Result<
      {
        file: FileResource;
        shareScope: FileShareScope;
        shareableFileId: ModelId;
        workspace: LightWorkspaceType;
      },
      DustError
    >
  > {
    if (!validate(token)) {
      return new Err(new DustError("invalid_id", "Invalid share token"));
    }

    const shareableFile = await this.shareableFileModel.findOne({
      where: { token },
      // WORKSPACE_ISOLATION_BYPASS: Used when a frame is accessed through a public token, at this
      // point we don't know the workspaceId.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });
    if (!shareableFile) {
      return new Err(new DustError("file_not_found", "Share not found"));
    }

    const [workspace] = await WorkspaceResource.fetchByModelIds([
      shareableFile.workspaceId,
    ]);
    if (!workspace) {
      return new Err(new DustError("internal_error", "Workspace not found"));
    }

    const file = await this.model.findOne({
      where: {
        id: shareableFile.fileId,
        workspaceId: workspace.id,
      },
    });

    const fileRes = file ? new this(this.model, file.get()) : null;
    if (!fileRes) {
      return new Err(new DustError("file_not_found", "File not found"));
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
        return new Err(
          new DustError("conversation_not_found", "Conversation not found")
        );
      }
    }

    return new Ok({
      file: fileRes,
      workspace: renderLightWorkspaceType({ workspace }),
      shareScope: shareableFile.shareScope,
      shareableFileId: shareableFile.id,
    });
  }

  static async getActiveGrantForEmail(
    workspace: LightWorkspaceType | WorkspaceResource,
    {
      email,
      shareableFileId,
    }: {
      email: string;
      shareableFileId: ModelId;
    }
  ): Promise<SharingGrantType | null> {
    // Note: expiresAt is not enforced here because it cannot be set yet.
    // When grant expiration is implemented, add query clause + index
    // expiresAt: { [Op.or]: [null, { [Op.gt]: new Date() }] }
    const grant = await SharingGrantModel.findOne({
      where: {
        workspaceId: workspace.id,
        shareableFileId,
        email: email.toLowerCase(),
        revokedAt: null,
      },
    });

    if (!grant) {
      return null;
    }

    const usersById: Map<ModelId, UserResource> = new Map();
    if (grant?.grantedBy) {
      const user = await UserResource.fetchByModelId(grant.grantedBy);
      if (user) {
        usersById.set(grant.grantedBy, user);
      }
    }

    return renderSharingGrant(grant, usersById);
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

  static async fetchByMountFilePaths(
    auth: Authenticator,
    mountFilePaths: string[]
  ): Promise<FileResource[]> {
    if (mountFilePaths.length === 0) {
      return [];
    }

    const owner = auth.getNonNullableWorkspace();
    const files = await this.model.findAll({
      where: {
        workspaceId: owner.id,
        mountFilePath: { [Op.in]: mountFilePaths },
      },
    });

    return files.map((f) => new this(this.model, f.get()));
  }

  static async deleteAllForWorkspace(auth: Authenticator) {
    const workspaceId = auth.getNonNullableWorkspace().id;

    // Delete external viewer sessions before shareable files (FK constraint).
    await ExternalViewerSessionModel.destroy({
      where: { workspaceId },
    });

    // Delete sharing grants before shareable files (FK constraint).
    await SharingGrantModel.destroy({
      where: { workspaceId },
    });

    // Delete all shareable file records.
    await this.shareableFileModel.destroy({
      where: { workspaceId },
    });

    return this.model.destroy({
      where: { workspaceId },
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
        await maybeDeleteCoreArtifactsForIndexedFile(auth, this);

        // Delete mount file copies if set.
        await this.deleteMountFileCopies();

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

        // Delete sharing grants before shareable file (FK constraint).
        const shareableFile = await FileResource.shareableFileModel.findOne({
          where: { fileId: this.id, workspaceId: this.workspaceId },
        });
        if (shareableFile) {
          await SharingGrantModel.destroy({
            where: {
              shareableFileId: shareableFile.id,
              workspaceId: this.workspaceId,
            },
          });
        }

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

  async markAsReady(auth: Authenticator) {
    // Early return if the file is already ready.
    if (this.status === "ready") {
      return;
    }

    const updateResult = await this.update({ status: "ready" });

    // For Interactive Content conversation files, automatically create a ShareableFileModel with
    // a default scope based on the workspace sharing policy.
    if (this.isInteractiveContent) {
      const defaultScope = getDefaultFrameShareScope(
        auth.getNonNullableWorkspace().sharingPolicy
      );

      await FileResource.shareableFileModel.upsert({
        fileId: this.id,
        shareScope: defaultScope,
        sharedBy: this.userId ?? null,
        workspaceId: this.workspaceId,
        sharedAt: new Date(),
        token: crypto.randomUUID(),
      });
    }

    await this.resolveAndSetMountFilePath(auth);

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
    return isInteractiveContentType(this.contentType);
  }

  // Content access logic.
  //
  // Files may have a "processed" version (text extraction, image resize, audio transcription) or
  // only the "original". These methods abstract the version selection so callers never deal with
  // versions directly.

  /**
   * Returns the file version to read for "best available" content.
   */
  private getContentVersion(): FileVersion {
    return hasProcessedVersion(this.contentType) ? "processed" : "original";
  }

  /**
   * Read stream for the best available content.
   */
  getContentReadStream(auth: Authenticator): Readable {
    return this.getReadStream({ auth, version: this.getContentVersion() });
  }

  /**
   * Bucket name and GCS path for the best available content. Used by CoreAPI callers that need
   * to pass bucket + path for CSV validation / upsert.
   */
  getContentBucketAndPath(auth: Authenticator): {
    bucket: string;
    path: string;
  } {
    const version = this.getContentVersion();

    return {
      bucket: this.getBucketForVersion(version).name,
      path: this.getCloudStoragePath(auth, version),
    };
  }

  // Cloud storage logic.

  getPrivateUrl(auth: Authenticator): string {
    const owner = auth.getNonNullableWorkspace();

    return `${config.getApiBaseUrl()}/api/w/${owner.sId}/files/${this.sId}`;
  }

  getPublicUrl(auth: Authenticator): string {
    const owner = auth.getNonNullableWorkspace();

    return `${config.getApiBaseUrl()}/api/v1/w/${owner.sId}/files/${this.sId}`;
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

    // Update metadata before copy.
    await this.setUseCaseMetadata(auth, {
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
        resumable: true,
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

    // TEMPORARY DUAL WRITE: Write to mount path as well if set (e.g., frame edits). Once all
    // conversation frames have a mount path, the canonical path write above should be removed.
    // The mount path becomes the sole live version, and the canonical path stays as the immutable
    // original.
    if (this.mountFilePath) {
      await getPrivateUploadBucket().uploadRawContentToBucket({
        content,
        contentType: this.contentType,
        filePath: this.mountFilePath,
      });
    }

    // Increment version after successful upload and mark as ready
    await this.incrementVersion();
    await this.markAsReady(auth);
  }

  async setUseCaseMetadata(auth: Authenticator, metadata: FileUseCaseMetadata) {
    const result = await this.update({ useCaseMetadata: metadata });
    await this.resolveAndSetMountFilePath(auth);
    return result;
  }

  // Mount file path logic.
  //
  // Files used in conversations are copied to a gcsfuse-mountable GCS path so sandboxes can access
  // them as a flat, human-readable filesystem:
  //   w/{wId}/conversations/{cId}/files/{fileName}
  //
  // The canonical path (files/w/{wId}/{fileId}/{version}) remains the immutable original. The mount
  // path is the mutable "live" version. Initial copy from canonical, then frame edits write
  // directly here (see uploadContent dual write).
  //
  // Resolution is triggered automatically by markAsReady() and setUseCaseMetadata(). Callers never
  // interact with mount paths directly.

  /**
   * Single entry point for mount path resolution and persistence.
   *
   * Examines the file's use case and metadata to determine whether a mount path should be created.
   * Branches internally by use case:
   * - conversation / tool_output: mounts under w/{wId}/conversations/{cId}/files/
   * - (future use cases can be added here)
   *
   * No-ops if the file already has a mountFilePath or conditions aren't met.
   */
  private async resolveAndSetMountFilePath(auth: Authenticator): Promise<void> {
    if (this.mountFilePath) {
      return;
    }

    const { useCase, useCaseMetadata } = this;

    let resolvedPath: string | null = null;

    if (isConversationFileUseCase(useCase) && useCaseMetadata?.conversationId) {
      resolvedPath = await this.resolveConversationMountPath(auth, {
        conversationId: useCaseMetadata.conversationId,
      });
    }

    // TODO(2026-03-09 SANDBOX): Add support for project context.

    if (resolvedPath) {
      await this.setMountFilePath(auth, resolvedPath);
    }
  }

  /**
   * Resolve the mount path for a conversation file. Checks for collisions via the unique index on
   * mountFilePath and disambiguates with the file's sId if needed.
   */
  private async resolveConversationMountPath(
    auth: Authenticator,
    { conversationId }: { conversationId: string }
  ): Promise<string> {
    const owner = auth.getNonNullableWorkspace();

    const desiredPath = getConversationFilePath({
      workspaceId: owner.sId,
      conversationId,
      fileName: this.fileName,
    });

    const isTaken = await this.isMountFilePathTaken(desiredPath);

    return isTaken
      ? getConversationFilePath({
          workspaceId: owner.sId,
          conversationId,
          fileName: disambiguateFileName(this),
        })
      : desiredPath;
  }

  /**
   * Set the mount file path and copy the file's original (and processed if exists) versions to the
   * conversation-level GCS path for gcsfuse mounting.
   *
   * This is a one-time operation: copies from the canonical path to the mount path. Subsequent
   * edits (frames) write directly to the mount path.
   */
  private async setMountFilePath(
    auth: Authenticator,
    mountFilePath: string
  ): Promise<void> {
    const bucket = getPrivateUploadBucket();

    const srcOriginalPath = this.getCloudStoragePath(auth, "original");
    await bucket.copyFile(srcOriginalPath, mountFilePath);

    // Copy processed version only if this file type has real processing.
    if (this.getContentVersion() === "processed") {
      const srcProcessedPath = this.getCloudStoragePath(auth, "processed");
      const processedMountPath = makeProcessedMountFileName({
        mountFilePath,
        processedContentType: getProcessedContentType(this.contentType),
      });
      await bucket.copyFile(srcProcessedPath, processedMountPath);
    }

    await this.update({ mountFilePath });
  }

  private async isMountFilePathTaken(mountFilePath: string): Promise<boolean> {
    const existing = await FileResource.model.findOne({
      attributes: ["id"],
      where: { workspaceId: this.workspaceId, mountFilePath },
    });
    return existing !== null;
  }

  private async deleteMountFileCopies(): Promise<void> {
    if (!this.mountFilePath) {
      return;
    }

    const bucket = getPrivateUploadBucket();
    await bucket.delete(this.mountFilePath, { ignoreNotFound: true });

    // Only delete processed mount file if this file type has real processing.
    const processedMountPath = makeProcessedMountFileName({
      mountFilePath: this.mountFilePath,
      processedContentType: getProcessedContentType(this.contentType),
    });
    await bucket.delete(processedMountPath, { ignoreNotFound: true });
  }

  static async bulkSetUseCaseMetadata(
    auth: Authenticator,
    files: FileResource[],
    metadata: FileUseCaseMetadata
  ): Promise<void> {
    if (files.length === 0) {
      return;
    }
    const workspace = auth.getNonNullableWorkspace();
    await this.model.update(
      { useCaseMetadata: metadata },
      {
        where: {
          id: { [Op.in]: files.map((f) => f.id) },
          workspaceId: workspace.id,
        },
      }
    );
  }

  async updateUseCase(
    auth: Authenticator,
    useCase: FileUseCase,
    metadata: FileUseCaseMetadata
  ) {
    if (this.useCase === useCase) {
      return;
    }

    // Eg: for a conversation file, we need to cleanup the core artifacts.
    await maybeDeleteCoreArtifactsForIndexedFile(auth, this);

    const mergedMetadata: FileUseCaseMetadata = {
      ...(this.useCaseMetadata ?? {}),
      ...metadata,
    };

    await this.update({
      useCase,
      useCaseMetadata: mergedMetadata,
      userId: auth.getNonNullableUser().id ?? null,
    });
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

    if (isInteractiveContentType(this.contentType)) {
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

  static async revokePublicSharingInWorkspace(
    auth: Authenticator,
    { newPolicy }: { newPolicy: WorkspaceSharingPolicy }
  ) {
    const fallbackScope = getDefaultFrameShareScope(newPolicy);

    return FileResource.shareableFileModel.update(
      {
        shareScope: fallbackScope,
      },
      {
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          shareScope: "public",
        },
      }
    );
  }

  // Sharing grants logic.

  private async getShareableFileId(): Promise<ModelId> {
    assert(
      this.isInteractiveContent,
      `Sharing grants are only supported for interactive content files (file: ${this.sId})`
    );

    const shareableFile = await FileResource.shareableFileModel.findOne({
      where: { fileId: this.id, workspaceId: this.workspaceId },
    });

    assert(
      shareableFile,
      `ShareableFileModel record not found for file ${this.sId}`
    );

    return shareableFile.id;
  }

  async addSharingGrants(
    auth: Authenticator,
    { emails }: { emails: string[] }
  ): Promise<SharingGrantType[]> {
    assert(
      this.isInteractiveContent,
      "addSharingGrants requires interactive content file"
    );
    const user = auth.getNonNullableUser();
    const shareableFileId = await this.getShareableFileId();

    const normalizedEmails = emails.map((e) => e.toLowerCase().trim());

    // Find existing active grants for these emails.
    const existingGrants = await SharingGrantModel.findAll({
      where: {
        workspaceId: this.workspaceId,
        shareableFileId,
        email: { [Op.in]: normalizedEmails },
        revokedAt: null,
      },
    });

    const existingEmails = new Set(existingGrants.map((g) => g.email));

    const newEmails = normalizedEmails.filter((e) => !existingEmails.has(e));

    if (newEmails.length > 0) {
      await SharingGrantModel.bulkCreate(
        newEmails.map((email) => ({
          workspaceId: this.workspaceId,
          shareableFileId,
          email,
          grantedBy: user.id,
          grantedAt: new Date(),
        }))
      );

      const shareInfo = await this.getShareInfo();
      if (shareInfo) {
        const sharedByName = user.toJSON().fullName;
        const frameUrl = shareInfo.shareUrl;
        const shareToken = frameUrl.split("/").at(-1) ?? "";

        // Fire-and-forget: don't block grant creation on email delivery.
        // TODO: Consider moving email delivery to a dedicated worker/queue  to avoid unbounded
        // parallelism and improve reliability/retry handling.
        void Promise.all(
          newEmails.map((email) =>
            sendFrameSharedEmail({
              to: email,
              sharedByName,
              frameUrl,
              shareToken,
            }).catch(() => {
              // Silently ignore, email failures should not affect grant creation.
              logger.info(
                {
                  email,
                  fileId: this.sId,
                  workspaceId: this.workspaceId,
                },
                "Failed to send sharing notification email"
              );
            })
          )
        );
      }
    }

    return this.listActiveSharingGrants();
  }

  async revokeSharingGrant({
    grantId,
  }: {
    grantId: ModelId;
  }): Promise<Result<undefined, DustError>> {
    assert(
      this.isInteractiveContent,
      "revokeSharingGrant requires interactive content file"
    );
    const shareableFileId = await this.getShareableFileId();

    const grant = await SharingGrantModel.findOne({
      where: {
        id: grantId,
        workspaceId: this.workspaceId,
        shareableFileId,
        revokedAt: null,
      },
    });

    if (!grant) {
      return new Err(
        new DustError("file_not_found", "Sharing grant not found")
      );
    }

    await grant.update({ revokedAt: new Date() });

    return new Ok(undefined);
  }

  static async recordGrantView(
    workspace: WorkspaceResource,
    {
      email,
      shareableFileId,
    }: {
      email: string;
      shareableFileId: ModelId;
    }
  ): Promise<void> {
    await SharingGrantModel.update(
      { lastViewedAt: new Date() },
      {
        where: {
          shareableFileId,
          email: email.toLowerCase(),
          revokedAt: null,
          workspaceId: workspace.id,
        },
      }
    );
  }

  async listActiveSharingGrants(): Promise<SharingGrantType[]> {
    assert(
      this.isInteractiveContent,
      "listActiveSharingGrants requires interactive content file"
    );
    const shareableFileId = await this.getShareableFileId();

    const grants = await SharingGrantModel.findAll({
      where: {
        workspaceId: this.workspaceId,
        shareableFileId,
        revokedAt: null,
      },
      order: [["grantedAt", "DESC"]],
    });

    const userIds = removeNulls(grants.map((g) => g.grantedBy));
    const users = await UserResource.fetchByModelIds(userIds);
    const usersById = new Map(users.map((u) => [u.id, u]));

    return grants.map((grant) => renderSharingGrant(grant, usersById));
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

      await copyContent(auth, sourceFile, newFile);

      // Mark the new file as ready.
      await newFile.markAsReady(auth);

      return new Ok(newFile);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }
}

function isBenignCoreIndexedFileDeleteError(code: string): boolean {
  return (
    code === "data_source_document_not_found" || code === "table_not_found"
  );
}

/**
 * Best-effort: remove Core tables (including `generatedTables` and `file.sId`) and the
 * document `file.sId` from the given data source. Wrong-type deletes return benign errors.
 */
async function deleteCoreFileArtifactsFromDataSource(
  auth: Authenticator,
  dataSource: DataSourceResource,
  file: FileResource
): Promise<void> {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const projectId = dataSource.dustAPIProjectId;
  const dataSourceId = dataSource.dustAPIDataSourceId;
  const logCtx = {
    workspaceId: auth.workspace()?.sId,
    fileId: file.sId,
    dataSourceSId: dataSource.sId,
  };

  const tableIds = new Set<string>([
    ...(file.useCaseMetadata?.generatedTables ?? []),
    file.sId,
  ]);

  for (const tableId of tableIds) {
    const delTableRes = await coreAPI.deleteTable({
      projectId,
      dataSourceId,
      tableId,
    });
    if (
      delTableRes.isErr() &&
      !isBenignCoreIndexedFileDeleteError(delTableRes.error.code)
    ) {
      logger.warn(
        { ...logCtx, tableId, error: delTableRes.error },
        "File delete: failed to remove table from Core data source."
      );
    }
  }

  const delDocRes = await coreAPI.deleteDataSourceDocument({
    projectId,
    dataSourceId,
    documentId: file.sId,
  });
  if (
    delDocRes.isErr() &&
    !isBenignCoreIndexedFileDeleteError(delDocRes.error.code)
  ) {
    logger.warn(
      { ...logCtx, error: delDocRes.error },
      "File delete: failed to remove document from Core data source."
    );
  }
}

async function maybeDeleteCoreArtifactsForIndexedFile(
  auth: Authenticator,
  file: FileResource
): Promise<void> {
  if (file.useCase === "project_context") {
    const spaceSId = file.useCaseMetadata?.spaceId;
    if (!spaceSId) {
      return;
    }
    const space = await SpaceResource.fetchById(auth, spaceSId);
    if (!space) {
      logger.warn(
        {
          workspaceId: auth.workspace()?.sId,
          fileId: file.sId,
          spaceSId,
        },
        "File delete: project space not found; skipping Core cleanup."
      );
      return;
    }
    const dsRes = await fetchProjectDataSource(auth, space);
    if (dsRes.isErr()) {
      logger.warn(
        {
          workspaceId: auth.workspace()?.sId,
          fileId: file.sId,
          spaceSId,
          error: dsRes.error,
        },
        "File delete: project dust_project data source not found; skipping Core cleanup."
      );
      return;
    }
    await deleteCoreFileArtifactsFromDataSource(auth, dsRes.value, file);
    return;
  }

  if (file.useCase === "conversation") {
    const conversationSId = file.useCaseMetadata?.conversationId;
    if (!conversationSId) {
      return;
    }
    const cRes = await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationSId
    );
    if (cRes.isErr()) {
      logger.warn(
        {
          workspaceId: auth.workspace()?.sId,
          fileId: file.sId,
          conversationSId,
        },
        "File delete: conversation not found; skipping Core cleanup."
      );
      return;
    }
    const dataSource = await DataSourceResource.fetchByConversation(
      auth,
      cRes.value
    );
    if (!dataSource) {
      logger.warn(
        {
          workspaceId: auth.workspace()?.sId,
          fileId: file.sId,
          conversationSId,
        },
        "File delete: conversation data source not found; skipping Core cleanup."
      );
      return;
    }
    await deleteCoreFileArtifactsFromDataSource(auth, dataSource, file);
  }
}

function renderSharingGrant(
  grant: SharingGrantModel,
  usersById: Map<ModelId, UserResource>
): SharingGrantType {
  const user = grant.grantedBy ? usersById.get(grant.grantedBy) : null;

  return {
    id: grant.id,
    email: grant.email,
    grantedAt: grant.grantedAt,
    grantedBy: user?.toJSON() ?? null,
    expiresAt: grant.expiresAt,
    lastViewedAt: grant.lastViewedAt,
  };
}

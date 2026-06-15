import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import config from "@app/lib/api/config";
import { GCSMountDirectoryAlreadyExistsError } from "@app/lib/api/files/gcs_mount/errors";
import {
  getConversationFilesBasePath,
  getPodFilesBasePath,
  getProjectFilesBasePath,
  toProjectMountFilePath,
} from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { FileUseCase, FileUseCaseMetadata } from "@app/types/files";
import {
  isSupportedImageContentType,
  stripMimeParameters,
} from "@app/types/files";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";

const GCS_MOUNT_COPY_CONCURRENCY = 4;
const GCS_MOUNT_COPY_MAX_FILES = 5000;

type GCSMountEntryBase = {
  fileName: string;
  /** Scoped path, e.g. `pod/report.pdf` or `conversation/.tool_outputs/chart.png`. */
  path: string;
  sizeBytes: number;
  lastModifiedMs: number;
};

export type GCSMountDirectoryEntry = GCSMountEntryBase & {
  isDirectory: true;
};

export type GCSMountFileEntry = GCSMountEntryBase & {
  isDirectory: false;
  contentType: string;
  fileId: string | null;
  thumbnailUrl: string | null;
  /** Present when the listing endpoint adds read-signed URLs (e.g. system pod_files API). */
  signedDownloadUrl?: string | null;
};

export type GCSMountEntry = GCSMountDirectoryEntry | GCSMountFileEntry;

export type GCSMountPoint =
  | { useCase: "conversation"; conversationId: string }
  | { useCase: "pod"; podId: string };

function resolvePrefix(
  owner: LightWorkspaceType,
  scope: GCSMountPoint
): string {
  switch (scope.useCase) {
    case "conversation":
      return getConversationFilesBasePath({
        workspaceId: owner.sId,
        conversationId: scope.conversationId,
      });

    case "pod":
      return getPodFilesBasePath({
        workspaceId: owner.sId,
        podId: scope.podId,
      });

    default:
      assertNever(scope);
  }
}

/**
 * Resolve a scoped path (e.g. `conversation/folder/file.txt`) to a full GCS object path.
 * Returns null if the scoped path does not belong to the given use case.
 */
export function getGCSPathFromScopedPath({
  prefix,
  scopedPath,
  useCase,
}: {
  prefix: string;
  scopedPath: string;
  useCase: GCSMountPoint["useCase"];
}): string | null {
  const scopePrefix = `${useCase}/`;
  if (!scopedPath.startsWith(scopePrefix)) {
    return null;
  }

  return prefix + scopedPath.slice(scopePrefix.length);
}

/**
 * Inverse of `getGCSPathFromScopedPath`: full GCS object path to scoped listing path
 * (e.g. `w/.../files/report.pdf` → `project/report.pdf`).
 */
export function getScopedPathFromGCSPath({
  prefix,
  gcsPath,
  useCase,
}: {
  prefix: string;
  gcsPath: string;
  useCase: GCSMountPoint["useCase"];
}): string | null {
  if (!gcsPath.startsWith(prefix)) {
    return null;
  }

  return `${useCase}/${gcsPath.slice(prefix.length)}`;
}

function makeFileEntry(
  {
    fileName,
    relativeFilePath,
    sizeBytes,
    contentType: rawContentType,
    lastModifiedMs,
    fileId,
  }: {
    fileName: string;
    relativeFilePath: string;
    sizeBytes: number;
    contentType: string;
    lastModifiedMs: number;
    fileId: string | null;
  },
  scope: GCSMountPoint,
  workspaceId: string
): GCSMountFileEntry {
  // GCS metadata commonly carries MIME parameters (e.g. `text/csv; charset=utf-8`).
  // Strip them at the module boundary so every downstream consumer sees a clean type
  // that matches our content-type lookup tables exactly.
  const contentType = stripMimeParameters(rawContentType);
  return {
    isDirectory: false,
    fileName,
    path: `${scope.useCase}/${relativeFilePath}`,
    sizeBytes,
    contentType,
    lastModifiedMs,
    fileId,
    thumbnailUrl: makeThumbnailUrl({
      contentType,
      relativeFilePath,
      scope,
      workspaceId,
    }),
  };
}

function makeThumbnailUrl({
  contentType,
  relativeFilePath,
  scope,
  workspaceId,
}: {
  contentType: string;
  relativeFilePath: string;
  scope: GCSMountPoint;
  workspaceId: string;
}): string | null {
  if (!isSupportedImageContentType(contentType)) {
    return null;
  }

  switch (scope.useCase) {
    case "conversation":
      return `${config.getApiBaseUrl()}/api/w/${workspaceId}/assistant/conversations/${scope.conversationId}/files/thumbnail?filePath=${encodeURIComponent(`${scope.useCase}/${relativeFilePath}`)}`;

    case "pod":
      // TODO(2026-05-10: FILE SYSTEM) Expose a Pod files thumbnail endpoint.
      return null;

    default:
      assertNever(scope);
  }
}

/**
 * Rename (move) a file within a GCS mount point — pure GCS primitive.
 * Does not touch FileResource records; callers are responsible for any DB sync.
 * Returns the new GCS path on success so callers can update linked records.
 */
export async function renameGCSMountFile(
  auth: Authenticator,
  scope: GCSMountPoint,
  {
    relativeFilePath,
    newFileName,
  }: { relativeFilePath: string; newFileName: string }
): Promise<Result<{ newGcsPath: string }, Error>> {
  const owner = auth.getNonNullableWorkspace();
  const prefix = resolvePrefix(owner, scope);

  const oldGcsPath = `${prefix}${relativeFilePath}`;
  const lastSlash = relativeFilePath.lastIndexOf("/");
  const dir = lastSlash >= 0 ? relativeFilePath.slice(0, lastSlash + 1) : "";
  const newGcsPath = `${prefix}${dir}${newFileName}`;

  const bucket = getPrivateUploadBucket();

  try {
    await bucket.copyFile(oldGcsPath, newGcsPath);
    await bucket.delete(oldGcsPath);

    // Mirror the rename on the projects/ side for pod files. We copy from the new canonical
    // pods/ path (instead of an old projects/ path that may not exist).
    if (scope.useCase === "pod") {
      const projectsPrefix = getProjectFilesBasePath({
        workspaceId: owner.sId,
        projectId: scope.podId,
      });
      const oldProjectsPath = `${projectsPrefix}${relativeFilePath}`;
      const newProjectsPath = `${projectsPrefix}${dir}${newFileName}`;
      await bucket.copyFile(newGcsPath, newProjectsPath);
      await bucket.delete(oldProjectsPath, { ignoreNotFound: true });
    }

    return new Ok({ newGcsPath });
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

/**
 * Rename a folder within a GCS mount point by moving all objects under its prefix.
 * Does not touch FileResource records; callers are responsible for any DB sync.
 */
export async function renameGCSMountDirectory(
  auth: Authenticator,
  scope: GCSMountPoint,
  {
    relativeDirPath,
    newFolderName,
  }: { relativeDirPath: string; newFolderName: string }
): Promise<Result<{ newRelativeDirPath: string }, Error>> {
  const owner = auth.getNonNullableWorkspace();
  const prefix = resolvePrefix(owner, scope);
  const normalized = relativeDirPath.replace(/^\/+|\/+$/g, "");
  const lastSlash = normalized.lastIndexOf("/");
  const parentDir = lastSlash >= 0 ? normalized.slice(0, lastSlash) : "";
  const newRelativeDirPath = parentDir
    ? `${parentDir}/${newFolderName}`
    : newFolderName;

  if (normalized === newRelativeDirPath) {
    return new Ok({ newRelativeDirPath });
  }

  const oldDirPrefix = `${prefix}${normalized}/`;
  const newDirPrefix = `${prefix}${newRelativeDirPath}/`;

  const bucket = getPrivateUploadBucket();
  const [newDirExists] = await bucket.file(newDirPrefix).exists();
  if (newDirExists) {
    return new Err(new GCSMountDirectoryAlreadyExistsError());
  }

  const { files: objects } = await bucket.getAllFilesByPrefix({
    prefix: oldDirPrefix,
  });

  try {
    for (const obj of objects) {
      const destPath = obj.name.replace(oldDirPrefix, newDirPrefix);
      if (destPath === obj.name) {
        continue;
      }
      await bucket.copyFile(obj.name, destPath);
    }
    await bucket.deleteByPrefix(oldDirPrefix);

    if (scope.useCase === "pod") {
      const projectsPrefix = getProjectFilesBasePath({
        workspaceId: owner.sId,
        projectId: scope.podId,
      });
      const oldProjectsDirPrefix = `${projectsPrefix}${normalized}/`;
      for (const obj of objects) {
        const newPodsPath = obj.name.replace(oldDirPrefix, newDirPrefix);
        const newProjectsPath = toProjectMountFilePath(newPodsPath);
        if (newProjectsPath) {
          await bucket.copyFile(newPodsPath, newProjectsPath);
        }
      }
      await bucket.deleteByPrefix(oldProjectsDirPrefix);
    }

    return new Ok({ newRelativeDirPath });
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

/**
 * Generate a short-lived signed URL for a GCS mount file.
 * Validates that the path belongs to the expected scope before signing.
 */
export async function getConversationFileMountSignedUrl(
  auth: Authenticator,
  scope: GCSMountPoint,
  gcsPath: string
): Promise<Ok<string> | Err<Error>> {
  const owner = auth.getNonNullableWorkspace();
  const prefix = resolvePrefix(owner, scope);
  if (!gcsPath.startsWith(prefix)) {
    return new Err(
      new Error(`GCS path does not belong to the expected mount point.`)
    );
  }
  try {
    const url = await getPrivateUploadBucket().getSignedUrl(gcsPath);
    return new Ok(url);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

/**
 * Write a file into a GCS mount point.
 * Returns the entry as it would appear in listGCSMountFiles.
 */
export async function createGCSMountFile(
  auth: Authenticator,
  scope: GCSMountPoint,
  {
    relativeFilePath,
    content,
    contentType,
  }: {
    relativeFilePath: string;
    content: Buffer;
    contentType: string;
  }
): Promise<Result<GCSMountFileEntry, Error>> {
  const owner = auth.getNonNullableWorkspace();
  const prefix = resolvePrefix(owner, scope);

  const gcsPath = `${prefix}${relativeFilePath}`;
  const bucket = getPrivateUploadBucket();
  try {
    await bucket.file(gcsPath).save(content, { contentType });

    // Mirror the write on the projects/ side for pod files.
    if (scope.useCase === "pod") {
      const projectsPrefix = getProjectFilesBasePath({
        workspaceId: owner.sId,
        projectId: scope.podId,
      });
      const projectsGcsPath = `${projectsPrefix}${relativeFilePath}`;
      await bucket.file(projectsGcsPath).save(content, { contentType });
    }
  } catch (error) {
    return new Err(normalizeError(error));
  }

  const fileName = relativeFilePath.split("/").pop() ?? relativeFilePath;
  return new Ok(
    makeFileEntry(
      {
        fileName,
        relativeFilePath,
        sizeBytes: content.length,
        contentType,
        lastModifiedMs: Date.now(),
        fileId: null,
      },
      scope,
      owner.sId
    )
  );
}

/**
 * Delete a file from a GCS mount point — pure GCS primitive.
 * Does not touch FileResource records; callers are responsible for any DB cleanup.
 */
export async function deleteGCSMountFile(
  auth: Authenticator,
  scope: GCSMountPoint,
  { relativeFilePath }: { relativeFilePath: string }
): Promise<Result<void, Error>> {
  const owner = auth.getNonNullableWorkspace();
  const prefix = resolvePrefix(owner, scope);
  const normalized = relativeFilePath.replace(/^\/+|\/+$/g, "");
  const gcsPath = `${prefix}${normalized}`;
  const dirGcsPrefix = `${prefix}${normalized}/`;

  const bucket = getPrivateUploadBucket();
  try {
    const [fileExists] = await bucket.file(gcsPath).exists();
    if (!fileExists) {
      const [dirPlaceholderExists] = await bucket.file(dirGcsPrefix).exists();
      const { files: dirContents } = await bucket.getAllFilesByPrefix({
        prefix: dirGcsPrefix,
        pageSize: 1,
      });
      const isDirectoryDelete = dirPlaceholderExists || dirContents.length > 0;

      if (isDirectoryDelete) {
        await bucket.deleteByPrefix(dirGcsPrefix);

        if (scope.useCase === "pod") {
          const projectPrefix = getProjectFilesBasePath({
            workspaceId: owner.sId,
            projectId: scope.podId,
          });
          await bucket.deleteByPrefix(`${projectPrefix}${normalized}/`);
        }

        return new Ok(undefined);
      }
    }

    await bucket.delete(gcsPath, { ignoreNotFound: true });

    // Mirror delete on the projects/ side for pod files.
    if (scope.useCase === "pod") {
      const projectsPrefix = getProjectFilesBasePath({
        workspaceId: owner.sId,
        projectId: scope.podId,
      });
      const projectsGcsPath = `${projectsPrefix}${normalized}`;
      await bucket.delete(projectsGcsPath, { ignoreNotFound: true });
    }

    return new Ok(undefined);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

/**
 * Copy a single file from one mount to another, preserving the relative file path on both sides.
 */
export async function copyMountFile(
  auth: Authenticator,
  {
    source,
    dest,
  }: {
    source: { scope: GCSMountPoint; relativeFilePath: string };
    dest: { scope: GCSMountPoint; relativeFilePath: string };
  }
): Promise<Result<void, Error>> {
  const owner = auth.getNonNullableWorkspace();
  const sourceGcsPath = `${resolvePrefix(owner, source.scope)}${source.relativeFilePath}`;
  const destGcsPath = `${resolvePrefix(owner, dest.scope)}${dest.relativeFilePath}`;

  const bucket = getPrivateUploadBucket();

  try {
    await bucket.copyFile(sourceGcsPath, destGcsPath);

    // Mirror the destination write on the projects/ side for pod files (double-write counterpart).
    if (dest.scope.useCase === "pod") {
      const projectsPrefix = getProjectFilesBasePath({
        workspaceId: owner.sId,
        projectId: dest.scope.podId,
      });
      const destProjectsPath = `${projectsPrefix}${dest.relativeFilePath}`;
      await bucket.copyFile(sourceGcsPath, destProjectsPath);
    }

    return new Ok(undefined);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

export async function copyConversationGCSMount(
  auth: Authenticator,
  {
    source,
    dest,
    sourceTimestampMs,
  }: {
    source: ConversationResource;
    dest: ConversationResource;
    // When set, only copy file versions that existed at or before this timestamp.
    // Used when branching from a specific mid-conversation message.
    sourceTimestampMs?: number;
  }
): Promise<Result<{ copiedCount: number }, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const sourcePrefix = resolvePrefix(owner, {
    useCase: "conversation",
    conversationId: source.sId,
  });
  const destPrefix = resolvePrefix(owner, {
    useCase: "conversation",
    conversationId: dest.sId,
  });

  if (sourcePrefix === destPrefix) {
    return new Ok({ copiedCount: 0 });
  }

  const bucket = getPrivateUploadBucket();

  try {
    const currentFiles = await bucket.getFiles({
      prefix: sourcePrefix,
      maxResults: GCS_MOUNT_COPY_MAX_FILES,
    });

    if (currentFiles.length >= GCS_MOUNT_COPY_MAX_FILES) {
      logger.warn(
        {
          workspaceId: owner.sId,
          sourceConversationId: source.sId,
          destConversationId: dest.sId,
          maxFiles: GCS_MOUNT_COPY_MAX_FILES,
        },
        "GCS mount copy hit the max files cap; some files may not be copied."
      );

      // TODO(2026-05-11 CONVERSATION BRANCHING): Flag error state on the conversation.
      throw new Error("GCS mount copy hit the max files cap");
    }

    // Single path for both cases. Using `Date.now()` as the cutoff when no
    // timestamp is given means every live file predates it, so all pass the
    // `isUnchanged` check and are copied directly — no version lookups needed.
    // When branching from a specific message, files unchanged since the fork
    // are copied directly while modified files get a per-file version lookup.
    const forkTimestampMs = sourceTimestampMs ?? Date.now();
    let copiedCount = 0;

    await concurrentExecutor(
      currentFiles,
      async (gcsFile) => {
        const relativePath = gcsFile.name.slice(sourcePrefix.length);
        const destPath = `${destPrefix}${relativePath}`;

        const isUnchanged =
          isString(gcsFile.metadata.updated) &&
          new Date(gcsFile.metadata.updated).getTime() <= forkTimestampMs;

        if (isUnchanged) {
          await bucket.copyFile(gcsFile.name, destPath);
          copiedCount++;
          return;
        }

        const versionsResult = await bucket.getSortedFileVersions({
          filePath: gcsFile.name,
        });
        if (versionsResult.isErr()) {
          throw versionsResult.error;
        }
        const preFork = versionsResult.value.find((v) => {
          if (
            !isString(v.metadata.updated) ||
            !isString(v.metadata.generation)
          ) {
            logger.warn(
              {
                workspaceId: owner.sId,
                sourceConversationId: source.sId,
                fileName: gcsFile.name,
              },
              "GCS mount versioned copy: skipping file version with missing metadata."
            );
            return false;
          }
          return new Date(v.metadata.updated).getTime() <= forkTimestampMs;
        });
        if (!preFork) {
          return; // file didn't exist before the fork point
        }
        await bucket.copyFile(gcsFile.name, destPath, undefined, {
          sourceGeneration: String(preFork.metadata.generation),
        });
        copiedCount++;
      },
      { concurrency: GCS_MOUNT_COPY_CONCURRENCY }
    );

    return new Ok({ copiedCount });
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

// GCS has no native rename/move, so we copy then delete. This is not atomic: if the delete
// fails the source survives alongside the copy. The destination is already the authoritative
// copy at that point, so we log and move on rather than surfacing an error.
async function moveGCSMountFile({
  sourceGcsPath,
  destGcsPath,
}: {
  sourceGcsPath: string;
  destGcsPath: string;
}): Promise<Result<void, Error>> {
  const bucket = getPrivateUploadBucket();
  try {
    await bucket.copyFile(sourceGcsPath, destGcsPath);
  } catch (err) {
    return new Err(normalizeError(err));
  }
  try {
    await bucket.delete(sourceGcsPath);
  } catch (err) {
    logger.error(
      { sourceGcsPath, destGcsPath, err: normalizeError(err) },
      "moveGCSMountFile: source delete failed after successful copy"
    );
  }
  return new Ok(undefined);
}

async function emitGCSMountFileMovedAuditLog(
  auth: Authenticator,
  scope: GCSMountPoint,
  {
    relativeFilePath,
    parentRelativePath,
  }: {
    relativeFilePath: string;
    parentRelativePath: string;
  }
): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();

  // file.moved emits a single shape: [workspace, space, conversation]. When a
  // given move only has one of space/conversation, the other gets an "unknown"
  // placeholder so the emit always matches the schema's declared targets (no
  // subset emits). Same pattern as user.login_failed.
  const UNKNOWN_TARGET = { sId: "unknown", name: "unknown" };
  let spaceData: { sId: string; name: string } = UNKNOWN_TARGET;
  let conversationData: { sId: string; name: string } = UNKNOWN_TARGET;

  switch (scope.useCase) {
    case "pod": {
      const space = await SpaceResource.fetchById(auth, scope.podId);
      if (!space) {
        return;
      }
      spaceData = { sId: space.sId, name: space.name };
      break;
    }
    case "conversation": {
      const conversation = await ConversationResource.fetchById(
        auth,
        scope.conversationId
      );
      if (!conversation) {
        return;
      }
      conversationData = {
        sId: conversation.sId,
        name: conversation.title ?? "",
      };
      break;
    }
    default:
      return assertNever(scope);
  }

  void emitAuditLogEvent({
    auth,
    action: "file.moved",
    targets: [
      buildAuditLogTarget("workspace", workspace),
      buildAuditLogTarget("space", spaceData),
      buildAuditLogTarget("conversation", conversationData),
    ],
    context: getAuditLogContext(auth),
    metadata: {
      relative_file_path: relativeFilePath,
      parent_relative_path: parentRelativePath,
      space_id: spaceData.sId,
      conversation_id: conversationData.sId,
    },
  });
}

/**
 * Move a file in GCS and, when a FileResource is provided, keep its DB record in sync.
 * The DB update is skipped for plain GCS objects that have no FileResource record.
 */
export async function moveFile(
  auth: Authenticator,
  {
    file,
    sourceGcsPath,
    destScope,
    destRelativeFilePath,
    destFileName,
    destUseCase,
    destUseCaseMetadata,
  }: {
    file?: FileResource;
    sourceGcsPath: string;
    destScope: GCSMountPoint;
    destRelativeFilePath: string;
    destFileName: string;
    destUseCase: FileUseCase;
    destUseCaseMetadata?: FileUseCaseMetadata;
  }
): Promise<Result<void, Error>> {
  const destGcsPath = `${resolvePrefix(auth.getNonNullableWorkspace(), destScope)}${destRelativeFilePath}`;

  // Normalize legacy `projects/` source paths to their `pods/` counterpart. The GSC migration guarantees the `pods/` copy exists for all files, so this ensures the move works regardless of whether the source path has been backfilled.
  const normalizedSourceGcsPath = sourceGcsPath.replace("/projects/", "/pods/");

  const moveRes = await moveGCSMountFile({
    sourceGcsPath: normalizedSourceGcsPath,
    destGcsPath,
  });
  if (moveRes.isErr()) {
    return moveRes;
  }

  // Dual-write to the projects/ side. Copy from the new canonical so this works even when
  // the source had no pre-existing projects/ mirror.
  const bucket = getPrivateUploadBucket();
  if (destScope.useCase === "pod") {
    const projectsPrefix = getProjectFilesBasePath({
      workspaceId: auth.getNonNullableWorkspace().sId,
      projectId: destScope.podId,
    });
    const destProjectsPath = `${projectsPrefix}${destRelativeFilePath}`;
    try {
      await bucket.copyFile(destGcsPath, destProjectsPath);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  // Clean up the projects/ mirror of the source if the source was a pod mount path.
  const sourceProjectsPath = toProjectMountFilePath(normalizedSourceGcsPath);
  if (sourceProjectsPath) {
    try {
      await bucket.delete(sourceProjectsPath, { ignoreNotFound: true });
    } catch (err) {
      logger.error(
        { sourceProjectsPath, err: normalizeError(err) },
        "moveFile: source projects/ mirror delete failed after successful move"
      );
    }
  }

  if (file) {
    await file.updateMount({
      destFileName,
      destMountFilePath: destGcsPath,
      destUseCase,
      destUseCaseMetadata,
    });
  }

  const prefix = resolvePrefix(auth.getNonNullableWorkspace(), destScope);
  const relativeFilePath = sourceGcsPath.startsWith(prefix)
    ? sourceGcsPath.slice(prefix.length)
    : destRelativeFilePath;
  const lastSlash = destRelativeFilePath.lastIndexOf("/");
  const parentRelativePath =
    lastSlash >= 0 ? destRelativeFilePath.slice(0, lastSlash) : "";

  void emitGCSMountFileMovedAuditLog(auth, destScope, {
    relativeFilePath,
    parentRelativePath,
  });

  return new Ok(undefined);
}

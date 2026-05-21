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
  TOOL_OUTPUTS_FOLDER_NAME,
  toPodMountFilePath,
} from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
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
  /** Scoped path, e.g. `project/report.pdf` or `conversation/.tool_outputs/chart.png`. */
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
  /** Present when the listing endpoint adds read-signed URLs (e.g. system project_files API). */
  signedDownloadUrl?: string | null;
};

export type GCSMountEntry = GCSMountDirectoryEntry | GCSMountFileEntry;

export type GCSMountPoint =
  | { useCase: "conversation"; conversationId: string }
  | { useCase: "project"; projectId: string };

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

    case "project":
      return getProjectFilesBasePath({
        workspaceId: owner.sId,
        projectId: scope.projectId,
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

function makeDirectoryEntry(
  {
    fileName,
    relativeFilePath,
    sizeBytes,
    lastModifiedMs,
  }: {
    fileName: string;
    relativeFilePath: string;
    sizeBytes: number;
    lastModifiedMs: number;
  },
  scope: GCSMountPoint
): GCSMountDirectoryEntry {
  return {
    isDirectory: true,
    fileName,
    path: `${scope.useCase}/${relativeFilePath}`,
    sizeBytes,
    lastModifiedMs,
  };
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

    case "project":
      // TODO(2026-05-10: FILE SYSTEM) Expose a project files thumbnail endpoint.
      return null;

    default:
      assertNever(scope);
  }
}

/**
 * List files from a GCS mount point (mounted bucket as source of truth).
 *
 * `.processed.<ext>` siblings are filtered out by default — they are
 * auto-generated artifacts (resized images, transcripts, extracted text) and
 * the UI file panel should not surface them. The MCP `files__list` tool opts
 * in via `includeProcessed: true` so the agent can read them directly.
 */
export async function listGCSMountFiles(
  auth: Authenticator,
  scope: GCSMountPoint,
  { includeProcessed = false }: { includeProcessed?: boolean } = {}
): Promise<GCSMountEntry[]> {
  const owner = auth.getNonNullableWorkspace();
  const prefix = resolvePrefix(owner, scope);

  const bucket = getPrivateUploadBucket();
  const { files: gcsFiles, pageFetchCount } = await bucket.getAllFilesByPrefix({
    prefix,
    pageSize: 200,
  });

  if (pageFetchCount > 1) {
    logger.warn(
      {
        workspaceId: owner.sId,
        prefix,
        scope,
        pageFetchCount,
        objectCount: gcsFiles.length,
      },
      "GCS mount file listing required multiple list requests; prefix has many objects."
    );
  }

  // GCS folder placeholders are zero-byte objects whose path ends with "/".
  const folderPlaceholders = gcsFiles.filter((f) => f.name.endsWith("/"));
  const regularFiles = gcsFiles.filter((f) => {
    if (f.name.endsWith("/")) {
      return false;
    }

    if (includeProcessed) {
      return true;
    }

    const name = f.name.split("/").pop() ?? "";
    return !name.includes(".processed.");
  });

  const mountPaths = regularFiles.map((f) => f.name);
  const fileResources = await FileResource.fetchByMountFilePaths(
    auth,
    mountPaths
  );
  const fileResourceByMountPath = new Map<string, FileResource>();
  for (const r of fileResources) {
    if (r.mountFilePath) {
      fileResourceByMountPath.set(r.mountFilePath, r);
    }
  }

  const folderEntries: GCSMountDirectoryEntry[] = folderPlaceholders.flatMap(
    (f) => {
      const trimmed = f.name.replace(/\/$/, "");
      const name = trimmed.split("/").pop() ?? "";
      // Skip hidden folders (name starting with "."), except the tool outputs folder which is
      // surfaced to users despite its dot prefix.
      if (
        !name ||
        (name.startsWith(".") && name !== TOOL_OUTPUTS_FOLDER_NAME)
      ) {
        return [];
      }

      return [
        makeDirectoryEntry(
          {
            fileName: name,
            relativeFilePath: trimmed.slice(prefix.length),
            sizeBytes: 0,
            lastModifiedMs: isString(f.metadata.updated)
              ? new Date(f.metadata.updated).getTime()
              : 0,
          },
          scope
        ),
      ];
    }
  );

  const fileEntries: GCSMountFileEntry[] = regularFiles.map((gcsFile) => {
    const metadata = gcsFile.metadata;
    const contentType = isString(metadata.contentType)
      ? metadata.contentType
      : "application/octet-stream";
    const fileResource = fileResourceByMountPath.get(gcsFile.name) ?? null;

    return makeFileEntry(
      {
        fileName: gcsFile.name.split("/").pop() ?? gcsFile.name,
        relativeFilePath: gcsFile.name.slice(prefix.length),
        sizeBytes: Number(metadata.size ?? 0),
        contentType,
        lastModifiedMs: isString(metadata.updated)
          ? new Date(metadata.updated).getTime()
          : 0,
        fileId: fileResource?.sId ?? null,
      },
      scope,
      owner.sId
    );
  });

  return [...folderEntries, ...fileEntries];
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

    // Mirror the rename on the pods/ side for project files. We copy from the new canonical
    // projects/ path (instead of an old pods/ path that may not exist for files predating the
    // dual-write) — this also opportunistically backfills the pods/ side as files get renamed.
    if (scope.useCase === "project") {
      const podsPrefix = getPodFilesBasePath({
        workspaceId: owner.sId,
        projectId: scope.projectId,
      });
      const oldPodsPath = `${podsPrefix}${relativeFilePath}`;
      const newPodsPath = `${podsPrefix}${dir}${newFileName}`;
      await bucket.copyFile(newGcsPath, newPodsPath);
      await bucket.delete(oldPodsPath, { ignoreNotFound: true });
    }

    return new Ok({ newGcsPath });
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

    // Mirror the write on the pods/ side for project files
    if (scope.useCase === "project") {
      const podsPrefix = getPodFilesBasePath({
        workspaceId: owner.sId,
        projectId: scope.projectId,
      });
      const podsGcsPath = `${podsPrefix}${relativeFilePath}`;
      await bucket.file(podsGcsPath).save(content, { contentType });
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
 * Create an empty folder in a GCS mount point via a zero-byte object whose name ends with "/".
 * Returns the entry as it would appear in listGCSMountFiles.
 */
export async function createGCSMountDirectory(
  auth: Authenticator,
  scope: GCSMountPoint,
  { relativeDirPath }: { relativeDirPath: string }
): Promise<Result<GCSMountDirectoryEntry, Error>> {
  const owner = auth.getNonNullableWorkspace();
  const prefix = resolvePrefix(owner, scope);

  const normalized = relativeDirPath.replace(/^\/+|\/+$/g, "");
  if (!normalized) {
    return new Err(new Error("relativeDirPath is required."));
  }

  const gcsPath = `${prefix}${normalized}/`;
  const bucket = getPrivateUploadBucket();
  try {
    const [exists] = await bucket.file(gcsPath).exists();
    if (exists) {
      return new Err(new GCSMountDirectoryAlreadyExistsError());
    }

    await bucket.file(gcsPath).save(Buffer.alloc(0), {
      contentType: "application/x-directory",
    });
  } catch (error) {
    return new Err(normalizeError(error));
  }

  const fileName = normalized.split("/").pop() ?? normalized;
  return new Ok(
    makeDirectoryEntry(
      {
        fileName,
        relativeFilePath: normalized,
        sizeBytes: 0,
        lastModifiedMs: Date.now(),
      },
      scope
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
  const gcsPath = `${prefix}${relativeFilePath}`;

  const bucket = getPrivateUploadBucket();
  try {
    await bucket.delete(gcsPath, { ignoreNotFound: true });

    // Mirror delete on the pods/ side for project files
    if (scope.useCase === "project") {
      const podsPrefix = getPodFilesBasePath({
        workspaceId: owner.sId,
        projectId: scope.projectId,
      });
      const podsGcsPath = `${podsPrefix}${relativeFilePath}`;
      await bucket.delete(podsGcsPath, { ignoreNotFound: true });
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

    // Mirror the destination write on the pods/ side for project files (double-write counterpart).
    if (dest.scope.useCase === "project") {
      const podsPrefix = getPodFilesBasePath({
        workspaceId: owner.sId,
        projectId: dest.scope.projectId,
      });
      const destPodsPath = `${podsPrefix}${dest.relativeFilePath}`;
      await bucket.copyFile(sourceGcsPath, destPodsPath);
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

        const versions = await bucket.getSortedFileVersions({
          filePath: gcsFile.name,
        });
        const preFork = versions.find((v) => {
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
  const targets = [buildAuditLogTarget("workspace", workspace)];
  const metadata: Record<string, string> = {
    relative_file_path: relativeFilePath,
    parent_relative_path: parentRelativePath,
    space_id: "",
    conversation_id: "",
  };

  switch (scope.useCase) {
    case "project": {
      const space = await SpaceResource.fetchById(auth, scope.projectId);
      if (!space) {
        return;
      }
      targets.push(buildAuditLogTarget("space", space));
      metadata.space_id = space.sId;
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
      targets.push(
        buildAuditLogTarget("conversation", {
          sId: conversation.sId,
          name: conversation.title ?? "",
        })
      );
      metadata.conversation_id = conversation.sId;
      break;
    }
    default:
      return assertNever(scope);
  }

  void emitAuditLogEvent({
    auth,
    action: "file.moved",
    targets,
    context: getAuditLogContext(auth),
    metadata,
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

  const moveRes = await moveGCSMountFile({ sourceGcsPath, destGcsPath });
  if (moveRes.isErr()) {
    return moveRes;
  }

  // Dual-write to the pods/ side. Copy from the new canonical so this works even when the
  // source was a non-project file (no pre-existing pods/ source to copy from).
  const bucket = getPrivateUploadBucket();
  if (destScope.useCase === "project") {
    const podsPrefix = getPodFilesBasePath({
      workspaceId: auth.getNonNullableWorkspace().sId,
      projectId: destScope.projectId,
    });
    const destPodsPath = `${podsPrefix}${destRelativeFilePath}`;
    try {
      await bucket.copyFile(destGcsPath, destPodsPath);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  // Clean up the pods/ mirror of the source if the source was a project mount path.
  const sourcePodsPath = toPodMountFilePath(sourceGcsPath);
  if (sourcePodsPath) {
    try {
      await bucket.delete(sourcePodsPath, { ignoreNotFound: true });
    } catch (err) {
      logger.error(
        { sourcePodsPath, err: normalizeError(err) },
        "moveFile: source pods/ mirror delete failed after successful move"
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

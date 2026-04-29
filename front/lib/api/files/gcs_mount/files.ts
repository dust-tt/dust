import config from "@app/lib/api/config";
import { getConversationFilesBasePath } from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { isSupportedImageContentType } from "@app/types/files";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";

type GCSMountEntryBase = {
  fileName: string;
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
};

export type GCSMountEntry = GCSMountDirectoryEntry | GCSMountFileEntry;

type GCSMountPoint = {
  useCase: "conversation";
  conversationId: string;
};

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
    contentType,
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
  return {
    isDirectory: false,
    fileName,
    path: `${scope.useCase}/${relativeFilePath}`,
    sizeBytes,
    contentType,
    lastModifiedMs,
    fileId,
    thumbnailUrl: isSupportedImageContentType(contentType)
      ? `${config.getClientFacingUrl()}/api/w/${workspaceId}/assistant/conversations/${scope.conversationId}/files/thumbnail?filePath=${encodeURIComponent(`${scope.useCase}/${relativeFilePath}`)}`
      : null,
  };
}

/**
 * List files from a GCS mount point (mounted bucket as source of truth).
 */
export async function listGCSMountFiles(
  auth: Authenticator,
  scope: GCSMountPoint
): Promise<GCSMountEntry[]> {
  const owner = auth.getNonNullableWorkspace();

  let prefix: string;
  switch (scope.useCase) {
    case "conversation":
      prefix = getConversationFilesBasePath({
        workspaceId: owner.sId,
        conversationId: scope.conversationId,
      });
      break;
    default:
      assertNever(scope.useCase);
  }

  const bucket = getPrivateUploadBucket();
  const gcsFiles = await bucket.getFiles({ prefix, maxResults: 200 });

  // GCS folder placeholders are zero-byte objects whose path ends with "/".
  const folderPlaceholders = gcsFiles.filter((f) => f.name.endsWith("/"));
  const regularFiles = gcsFiles.filter((f) => {
    if (f.name.endsWith("/")) {
      return false;
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
      // Skip hidden folders (name starting with ".").
      if (!name || name.startsWith(".")) {
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
 * Write a file into a GCS mount point.
 * Returns the entry as it would appear in listGCSMountFiles.
 */
export async function createGCSMountFile(
  auth: Authenticator,
  scope: GCSMountPoint,
  {
    fileName,
    content,
    contentType,
  }: {
    fileName: string;
    content: Buffer;
    contentType: string;
  }
): Promise<GCSMountFileEntry> {
  const owner = auth.getNonNullableWorkspace();

  let prefix: string;
  switch (scope.useCase) {
    case "conversation":
      prefix = getConversationFilesBasePath({
        workspaceId: owner.sId,
        conversationId: scope.conversationId,
      });
      break;
    default:
      assertNever(scope.useCase);
  }

  const gcsPath = `${prefix}${fileName}`;
  const bucket = getPrivateUploadBucket();
  await bucket.file(gcsPath).save(content, { contentType });

  return makeFileEntry(
    {
      fileName,
      relativeFilePath: fileName,
      sizeBytes: content.length,
      contentType,
      lastModifiedMs: Date.now(),
      fileId: null,
    },
    scope,
    owner.sId
  );
}

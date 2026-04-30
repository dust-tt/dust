import config from "@app/lib/api/config";
import { getConversationFilesBasePath } from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { isSupportedImageContentType } from "@app/types/files";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import { Err, Ok } from "@app/types/shared/result";

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

export type GCSMountPoint = {
  useCase: "conversation";
  conversationId: string;
};

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

    default:
      assertNever(scope.useCase);
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
  const prefix = resolvePrefix(owner, scope);

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
      new Error(`GCS path does not belong to the expected conversation file system.`)
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
): Promise<GCSMountFileEntry> {
  const owner = auth.getNonNullableWorkspace();
  const prefix = resolvePrefix(owner, scope);

  const gcsPath = `${prefix}${relativeFilePath}`;
  const bucket = getPrivateUploadBucket();
  await bucket.file(gcsPath).save(content, { contentType });

  const fileName = relativeFilePath.split("/").pop() ?? relativeFilePath;
  return makeFileEntry(
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
  );
}

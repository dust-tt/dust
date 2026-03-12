import { getConversationFilesBasePath } from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import { FILE_FORMATS } from "@app/types/files";

const SANDBOX_WORKING_DIRECTORY = "/tmp";

// Reverse lookup: extension -> content type, built from FILE_FORMATS.
const EXTENSION_TO_CONTENT_TYPE = new Map<string, string>();
for (const [contentType, format] of Object.entries(FILE_FORMATS)) {
  for (const ext of format.exts) {
    EXTENSION_TO_CONTENT_TYPE.set(ext, contentType);
  }
}

function contentTypeFromExtension(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  return EXTENSION_TO_CONTENT_TYPE.get(ext) ?? "application/octet-stream";
}

export type SandboxFileEntry = {
  fileName: string;
  path: string;
  sizeBytes: number;
  contentType: string;
  lastModifiedMs: number;
  fileId: string | null;
  isDirectory: boolean;
};

/**
 * List sandbox files by querying the E2B sandbox filesystem directly.
 */
export async function listSandboxFilesFromProvider(
  sandbox: SandboxResource
): Promise<SandboxFileEntry[]> {
  const result = await sandbox.listFiles(SANDBOX_WORKING_DIRECTORY, {
    recursive: true,
  });
  if (result.isErr()) {
    logger.warn(
      { sandboxId: sandbox.sId, error: result.error.message },
      "Failed to list sandbox files from provider"
    );
    return [];
  }

  const entries: SandboxFileEntry[] = [];

  for (const entry of result.value) {
    // Make the path relative to the working directory.
    // E2B returns paths like "/tmp/scripts" or "tmp/scripts" when listing "/tmp".
    let relativePath = entry.path;
    // Strip leading slash for uniform handling.
    relativePath = relativePath.replace(/^\//, "");
    // Strip working directory prefix (e.g. "tmp/").
    const wdName = SANDBOX_WORKING_DIRECTORY.replace(/^\//, "");
    if (relativePath === wdName) {
      // Skip the working directory entry itself.
      continue;
    }
    if (relativePath.startsWith(`${wdName}/`)) {
      relativePath = relativePath.slice(wdName.length + 1);
    }

    // Skip empty paths (shouldn't happen, but be safe).
    if (!relativePath) {
      continue;
    }

    const name = relativePath.split("/").pop() ?? "";
    // Hide hidden files/dirs (dot-prefixed) and systemd artifacts.
    if (name.startsWith(".") || relativePath.includes("systemd-private-")) {
      continue;
    }

    entries.push({
      fileName: name,
      path: relativePath,
      sizeBytes: entry.size,
      contentType: entry.isDirectory
        ? "inode/directory"
        : contentTypeFromExtension(name),
      lastModifiedMs: 0,
      fileId: null,
      isDirectory: entry.isDirectory,
    });
  }

  return entries;
}

/**
 * List sandbox files from GCS mount path (fallback for deleted sandboxes).
 */
export async function listSandboxFilesFromGCS(
  auth: Authenticator,
  conversationId: string
): Promise<SandboxFileEntry[]> {
  const owner = auth.getNonNullableWorkspace();
  const prefix = getConversationFilesBasePath({
    workspaceId: owner.sId,
    conversationId,
  });

  const bucket = getPrivateUploadBucket();
  const gcsFiles = await bucket.getFiles({ prefix, maxResults: 200 });

  // Filter out .processed.* files (internal processing artifacts).
  const filteredFiles = gcsFiles.filter((f) => {
    const name = f.name.split("/").pop() ?? "";
    return !name.includes(".processed.");
  });

  const mountPaths = filteredFiles.map((f) => f.name);
  const mountPathToFileResource = await FileResource.fetchByMountFilePaths(
    auth,
    mountPaths
  );

  return filteredFiles.map((gcsFile) => {
    const fileName = gcsFile.name.split("/").pop() ?? gcsFile.name;
    const metadata = gcsFile.metadata;
    const fileResource = mountPathToFileResource.get(gcsFile.name) ?? null;

    return {
      fileName,
      path: gcsFile.name,
      sizeBytes: Number(metadata.size ?? 0),
      contentType:
        (metadata.contentType as string) ?? "application/octet-stream",
      lastModifiedMs: metadata.updated
        ? new Date(metadata.updated as string).getTime()
        : 0,
      fileId: fileResource?.sId ?? null,
      isDirectory: false,
    };
  });
}

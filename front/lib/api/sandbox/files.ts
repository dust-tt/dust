import { getConversationFilesBasePath } from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { isString } from "@app/types/shared/utils/general";

export type SandboxFileEntry = {
  fileName: string;
  path: string;
  sizeBytes: number;
  contentType: string;
  lastModifiedMs: number;
  fileId: string | null;
};

/**
 * List sandbox files from GCS (mounted bucket as source of truth).
 */
export async function listSandboxFiles(
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

  return filteredFiles.map((gcsFile) => {
    const fileName = gcsFile.name.split("/").pop() ?? gcsFile.name;
    const metadata = gcsFile.metadata;
    const fileResource = fileResourceByMountPath.get(gcsFile.name) ?? null;

    return {
      fileName,
      path: gcsFile.name,
      sizeBytes: Number(metadata.size ?? 0),
      contentType: isString(metadata.contentType)
        ? metadata.contentType
        : "application/octet-stream",
      lastModifiedMs: isString(metadata.updated)
        ? new Date(metadata.updated).getTime()
        : 0,
      fileId: fileResource?.sId ?? null,
    };
  });
}

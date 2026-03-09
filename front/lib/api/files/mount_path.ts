import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { isConversationFileUseCase } from "@app/types/files";

// Path helpers for conversation file mount paths (gcsfuse sandbox mounting).

export function getBaseMountPathForWorkspace({
  workspaceId,
}: {
  workspaceId: string;
}): string {
  return `w/${workspaceId}/`;
}

export function getConversationFilesBasePath({
  workspaceId,
  conversationId,
}: {
  workspaceId: string;
  conversationId: string;
}): string {
  return `${getBaseMountPathForWorkspace({ workspaceId })}conversations/${conversationId}/files/`;
}

function getConversationFilePath({
  workspaceId,
  conversationId,
  fileName,
}: {
  workspaceId: string;
  conversationId: string;
  fileName: string;
}): string {
  return `${getConversationFilesBasePath({ workspaceId, conversationId })}${fileName}`;
}

/**
 * Given a mount file path like "w/.../files/report.pdf",
 * returns "w/.../files/report.processed.pdf".
 * For files without extension: "w/.../files/Makefile" → "w/.../files/Makefile.processed".
 */
export function makeProcessedMountFileName(mountFilePath: string): string {
  const lastSlash = mountFilePath.lastIndexOf("/");
  const dirPart = mountFilePath.substring(0, lastSlash + 1);
  const fileName = mountFilePath.substring(lastSlash + 1);

  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) {
    return `${dirPart}${fileName}.processed`;
  }

  const basename = fileName.substring(0, lastDot);
  const ext = fileName.substring(lastDot);
  return `${dirPart}${basename}.processed${ext}`;
}

/**
 * Disambiguate a filename by inserting the file's sId before the extension.
 * "report.pdf" + "fil_abc" → "report_fil_abc.pdf"
 * "Makefile" + "fil_abc" → "Makefile_fil_abc"
 */
function disambiguateFileName(fileName: string, sId: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) {
    return `${fileName}_${sId}`;
  }

  const basename = fileName.substring(0, lastDot);
  const ext = fileName.substring(lastDot);
  return `${basename}_${sId}${ext}`;
}

/**
 * Single entry point for mount path resolution.
 *
 * Examines the file's use case and metadata to determine whether a mount path should be created.
 * Branches internally by use case:
 * - conversation / tool_output: mounts under w/{wId}/conversations/{cId}/files/
 * - (future use cases can be added here)
 *
 * No-ops if the file already has a mountFilePath or conditions aren't met.
 */
export async function maybeResolveMountPath(
  auth: Authenticator,
  file: FileResource
): Promise<void> {
  // Skip if already resolved.
  if (file.mountFilePath) {
    return;
  }

  const { useCase, useCaseMetadata } = file;

  if (isConversationFileUseCase(useCase) && useCaseMetadata?.conversationId) {
    await resolveConversationMountPath(auth, file, {
      conversationId: useCaseMetadata.conversationId,
    });
    return;
  }

  // TODO(2026-03-09 SANDBOX): Add support for project context.
}

/**
 * Resolve the mount path for a conversation file.
 *
 * Checks if the desired path is already taken via the unique index on mountFilePath. If taken,
 * disambiguates with the file's sId.
 *
 * Then calls file.setMountFilePath to persist and copy to GCS.
 */
async function resolveConversationMountPath(
  auth: Authenticator,
  file: FileResource,
  { conversationId }: { conversationId: string }
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  const desiredPath = getConversationFilePath({
    workspaceId: owner.sId,
    conversationId,
    fileName: file.fileName,
  });

  // Check if the desired path is already taken (unique index lookup).
  const existing = await FileModel.findOne({
    attributes: ["id"],
    where: { mountFilePath: desiredPath },
  });

  const mountFilePath = existing
    ? getConversationFilePath({
        workspaceId: owner.sId,
        conversationId,
        fileName: disambiguateFileName(file.fileName, file.sId),
      })
    : desiredPath;

  await file.setMountFilePath(auth, mountFilePath);
}

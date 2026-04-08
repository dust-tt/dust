// Pure path helpers for conversation file mount paths (gcsfuse sandbox mounting).

import type { FileResource } from "@app/lib/resources/file_resource";
import type { AllSupportedFileContentType } from "@app/types/files";
import { extensionsForContentType } from "@app/types/files";

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

export function getConversationToolOutputsBasePath({
  workspaceId,
  conversationId,
}: {
  workspaceId: string;
  conversationId: string;
}): string {
  return `${getConversationFilesBasePath({ workspaceId, conversationId })}tool_outputs/`;
}

export function getConversationFilePath({
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
 * For files without extension: "w/.../files/Makefile" -> "w/.../files/Makefile.processed".
 *
 * When processedContentType is provided and differs from the original extension, the extension is
 * swapped to match the processed content type:
 *   "report.pdf" + "text/plain" -> "report.processed.txt"
 */
export function makeProcessedMountFileName({
  mountFilePath,
  processedContentType,
}: {
  mountFilePath: string;
  processedContentType?: AllSupportedFileContentType;
}): string {
  const lastSlash = mountFilePath.lastIndexOf("/");
  const dirPart = mountFilePath.substring(0, lastSlash + 1);
  const fileName = mountFilePath.substring(lastSlash + 1);

  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) {
    return `${dirPart}${fileName}.processed`;
  }

  const basename = fileName.substring(0, lastDot);
  const ext = processedContentType
    ? (extensionsForContentType(processedContentType)[0] ??
      fileName.substring(lastDot))
    : fileName.substring(lastDot);

  return `${dirPart}${basename}.processed${ext}`;
}

/**
 * Disambiguate a filename by inserting the file's sId before the extension.
 * "report.pdf" + "fil_abc" → "report_fil_abc.pdf"
 * "Makefile" + "fil_abc" → "Makefile_fil_abc"
 */
export function disambiguateFileName(file: FileResource): string {
  const { fileName, sId } = file;

  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) {
    return `${fileName}_${sId}`;
  }

  const basename = fileName.substring(0, lastDot);
  const ext = fileName.substring(lastDot);
  return `${basename}_${sId}${ext}`;
}

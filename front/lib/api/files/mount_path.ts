// Pure path helpers for conversation file mount paths (gcsfuse sandbox mounting).

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
export function disambiguateFileName(fileName: string, sId: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) {
    return `${fileName}_${sId}`;
  }

  const basename = fileName.substring(0, lastDot);
  const ext = fileName.substring(lastDot);
  return `${basename}_${sId}${ext}`;
}

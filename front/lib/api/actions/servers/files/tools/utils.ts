import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getGCSPathFromScopedPath } from "@app/lib/api/files/gcs_mount/files";
import { getConversationFilesBasePath } from "@app/lib/api/files/mount_path";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { stripMimeParameters } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import type { File as GCSFile } from "@google-cloud/storage";

type ResolvedFile = { file: GCSFile; mimeType: string; sizeBytes: number };

export async function resolveConversationFile(
  path: string,
  {
    auth,
    agentLoopContext,
  }: Pick<ToolHandlerExtra, "auth" | "agentLoopContext">
): Promise<Ok<ResolvedFile> | Err<MCPError>> {
  const conversation = agentLoopContext?.runContext?.conversation;
  if (!conversation) {
    return new Err(new MCPError("No conversation context available."));
  }

  const owner = auth.getNonNullableWorkspace();
  const prefix = getConversationFilesBasePath({
    workspaceId: owner.sId,
    conversationId: conversation.sId,
  });
  const gcsPath = getGCSPathFromScopedPath({
    prefix,
    scopedPath: path,
    useCase: "conversation",
  });
  if (!gcsPath) {
    return new Err(
      new MCPError(
        `Invalid path: \`${path}\` does not belong to the conversation file system.`,
        { tracked: false }
      )
    );
  }

  const bucket = getPrivateUploadBucket();
  const file = bucket.file(gcsPath);

  try {
    const [metadata] = await file.getMetadata();
    const rawContentType = isString(metadata.contentType)
      ? metadata.contentType
      : "application/octet-stream";
    return new Ok({
      file,
      mimeType: stripMimeParameters(rawContentType),
      sizeBytes: Number(metadata.size ?? 0),
    });
  } catch (err) {
    return new Err(
      new MCPError(
        `File not found: \`${path}\`. Error: ${normalizeError(err).message}`,
        { tracked: false }
      )
    );
  }
}

// TODO(20260429 FILE SYSTEM): Find a more exhaustive approach to cover more files.
export function isReadableAsText(contentType: string): boolean {
  const mime = stripMimeParameters(contentType);
  return (
    mime.startsWith("text/") ||
    [
      "application/json",
      "application/yaml",
      "application/xml",
      "application/x-ndjson",
      "application/javascript",
      "application/typescript",
    ].includes(mime)
  );
}

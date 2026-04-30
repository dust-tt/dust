import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  type GCSMountPoint,
  getGCSPathFromScopedPath,
} from "@app/lib/api/files/gcs_mount/files";
import { getConversationFilesBasePath } from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import type { ConversationType } from "@app/types/assistant/conversation";
import { stripMimeParameters } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import type { File as GCSFile } from "@google-cloud/storage";

type ResolvedFile = { file: GCSFile; mimeType: string; sizeBytes: number };

type MountPoint = { scope: GCSMountPoint; prefix: string };

export function resolveMountPoint(
  auth: Authenticator,
  conversation: ConversationType | null | undefined
): Result<MountPoint, MCPError> {
  if (!conversation) {
    return new Err(new MCPError("No conversation context available."));
  }

  const owner = auth.getNonNullableWorkspace();
  const scope: GCSMountPoint = {
    useCase: "conversation",
    conversationId: conversation.sId,
  };

  const prefix = getConversationFilesBasePath({
    workspaceId: owner.sId,
    conversationId: conversation.sId,
  });

  return new Ok({ scope, prefix });
}

export async function resolveConversationFile(
  auth: Authenticator,
  conversation: ConversationType | undefined,
  path: string
): Promise<Result<ResolvedFile, MCPError>> {
  const mountRes = resolveMountPoint(auth, conversation);
  if (mountRes.isErr()) {
    return mountRes;
  }

  const { scope, prefix } = mountRes.value;

  const gcsPath = getGCSPathFromScopedPath({
    prefix,
    scopedPath: path,
    useCase: scope.useCase,
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

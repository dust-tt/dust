import { MCPError } from "@app/lib/actions/mcp_errors";
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  FILES_CREATE_ACTION_NAME,
  FILES_LIST_ACTION_NAME,
  FILES_SERVER_NAME,
} from "@app/lib/api/actions/servers/files/metadata";
import {
  CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  INTERACTIVE_CONTENT_SERVER_NAME,
} from "@app/lib/api/actions/servers/interactive_content/metadata";
import { getGCSPathFromScopedPath } from "@app/lib/api/files/gcs_mount/files";
import {
  getConversationFilesBasePath,
  getPodFilesBasePath,
  parseScopedFilePath,
} from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isPodConversation } from "@app/types/assistant/conversation";
import { stripMimeParameters } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import type { File as GCSFile } from "@google-cloud/storage";

interface ResolvedFile {
  file: GCSFile;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Resolve a GCS file from a scoped path.
 *
 * @deprecated Callers should migrate to DustFileSystem.forConversation(auth, conversation)
 * followed by fs.stat() and fs.read().
 */
export async function resolveFile(
  auth: Authenticator,
  conversation: ConversationWithoutContentType,
  path: string
): Promise<Result<ResolvedFile, MCPError>> {
  const parsed = parseScopedFilePath(path);
  if (!parsed) {
    return new Err(
      new MCPError(
        `Invalid path: \`${path}\` must start with \`conversation/\` or \`pod/\`.`,
        { tracked: false }
      )
    );
  }

  const owner = auth.getNonNullableWorkspace();
  let prefix: string;

  if (parsed.prefix === "conversation") {
    prefix = getConversationFilesBasePath({
      workspaceId: owner.sId,
      conversationId: conversation.sId,
    });
  } else {
    if (!isPodConversation(conversation)) {
      return new Err(
        new MCPError(
          "Pod file paths are only available in Pod conversations.",
          {
            tracked: false,
          }
        )
      );
    }
    const space = await SpaceResource.fetchById(auth, conversation.spaceId);
    if (!space || !space.canRead(auth)) {
      return new Err(
        new MCPError("You do not have read permissions for this pod.", {
          tracked: false,
        })
      );
    }
    prefix = getPodFilesBasePath({ workspaceId: owner.sId, podId: space.sId });
  }

  const gcsPath = getGCSPathFromScopedPath({
    prefix,
    scopedPath: path,
    useCase: parsed.prefix,
  });
  if (!gcsPath) {
    return new Err(
      new MCPError(
        `Invalid path: \`${path}\` does not match the resolved mount point.`,
        { tracked: false }
      )
    );
  }

  const bucket = getPrivateUploadBucket();

  // GCS object names are byte-exact. Pre-NFC-normalization rollout, some objects were stored in
  // NFD (e.g. macOS uploads) while LLMs typically echo paths back as NFC, causing 404s on visually
  // identical paths. Try the path as-is first, then NFC, then NFD.
  // TODO(2026-05-11 FILE SYSTEM): Remove the NFC/NFD fallbacks once legacy non-NFC objects have
  // been re-keyed or aged out. Uploads are now normalized to NFC at FileResource.makeNew.
  const nfc = gcsPath.normalize("NFC");
  const nfd = gcsPath.normalize("NFD");
  const candidates = [gcsPath];

  if (nfc !== gcsPath) {
    candidates.push(nfc);
  }

  if (nfd !== gcsPath && nfd !== nfc) {
    candidates.push(nfd);
  }

  let lastError: unknown = null;
  for (const candidate of candidates) {
    const file = bucket.file(candidate);

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
      lastError = err;
    }
  }

  return new Err(
    new MCPError(
      `File not found: \`${path}\`. Error: ${normalizeError(lastError).message}`,
      { tracked: false }
    )
  );
}

export function frameFileCreateRejectedError(): MCPError {
  return new MCPError(
    `Frame files cannot be created with \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_CREATE_ACTION_NAME)}\`. ` +
      `Use \`${getPrefixedToolName(INTERACTIVE_CONTENT_SERVER_NAME, CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME)}\` instead.`,
    { tracked: false }
  );
}

export function frameFileEditRejectedError(): MCPError {
  return new MCPError(
    `Frame files cannot be edited with \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_CREATE_ACTION_NAME)}\`. ` +
      `Use \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_LIST_ACTION_NAME)}\` to get the file id, ` +
      `then \`${getPrefixedToolName(INTERACTIVE_CONTENT_SERVER_NAME, EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME)}\` to update it.`,
    { tracked: false }
  );
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

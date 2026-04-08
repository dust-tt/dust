import { makeFileName } from "@app/lib/api/files/action_output_fs/naming";
import {
  resolveResourceOutput,
  shouldOffloadTextBlock,
} from "@app/lib/api/files/action_output_fs/registry";
import { getConversationToolOutputsBasePath } from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { AllSupportedFileContentType } from "@app/types/files";
import { slugify } from "@app/types/shared/utils/string_utils";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Action output file system.
//
// Writes qualifying tool output blocks to the conversation's tool_outputs GCS path as a side effect
// of processToolResults. Files are conversation-scoped and are not tracked in the database. They
// are cleaned up when the conversation is scrubbed.
//
// Two cases are handled:
//   1. Resource blocks whose mimeType is registered in resolveResourceOutput.
//   2. Plain text blocks that exceed FILE_OFFLOAD_TEXT_SIZE_BYTES (with JSON sniffing for a better
//      file extension).

export interface PersistedToolOutput {
  // Filename within tool_outputs/ — what the model and sandbox use.
  fileName: string;
}

/**
 * Attempts to persist a tool output block to the conversation's tool_outputs GCS path.
 * Returns null if the block does not qualify for persistence.
 *
 * Call this as a side effect from processToolResults.
 */
export async function persistToolOutput(
  auth: Authenticator,
  conversation: ConversationType,
  block: CallToolResult["content"][number],
  { toolName }: { toolName: string }
): Promise<PersistedToolOutput | null> {
  const owner = auth.getNonNullableWorkspace();
  const basePath = getConversationToolOutputsBasePath({
    workspaceId: owner.sId,
    conversationId: conversation.sId,
  });

  // Resource blocks (registered mimeTypes).
  const resolved = resolveResourceOutput(block);
  if (resolved) {
    const { fileName: rawName, content, storageContentType } = resolved;
    const ext = storageContentType === "application/json" ? ".json" : ".md";
    const fileName = makeFileName({ name: rawName, ext });

    await getPrivateUploadBucket().uploadRawContentToBucket({
      content,
      contentType: storageContentType,
      filePath: `${basePath}${fileName}`,
    });

    return { fileName };
  }

  // Text blocks above the offload threshold.
  if (shouldOffloadTextBlock(block)) {
    const { fileName, contentType } = inferTextFileMetadata(
      block.text,
      toolName
    );

    await getPrivateUploadBucket().uploadRawContentToBucket({
      content: block.text,
      contentType,
      filePath: `${basePath}${fileName}`,
    });

    return { fileName };
  }

  return null;
}

/**
 * Infers filename and content-type for a plain text block.
 * Sniffs for JSON to assign a .json extension; falls back to .txt.
 */
function inferTextFileMetadata(
  text: string,
  toolName: string
): { fileName: string; contentType: AllSupportedFileContentType } {
  const trimmed = text.trimStart();
  const isJson =
    (trimmed.startsWith("{") || trimmed.startsWith("[")) &&
    (() => {
      try {
        JSON.parse(text);
        return true;
      } catch {
        return false;
      }
    })();

  const slug = slugify(toolName) || "output";
  return isJson
    ? {
        fileName: makeFileName({ name: slug, ext: ".json" }),
        contentType: "application/json",
      }
    : {
        fileName: makeFileName({ name: slug, ext: ".txt" }),
        contentType: "text/plain",
      };
}

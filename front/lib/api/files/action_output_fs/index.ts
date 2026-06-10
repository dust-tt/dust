import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { SCOPED_PREFIX_CONVERSATION } from "@app/lib/api/file_system/types";
import { makeFileName } from "@app/lib/api/files/action_output_fs/naming";
import {
  resolveResourceOutput,
  shouldOffloadTextBlock,
} from "@app/lib/api/files/action_output_fs/registry";
import { TOOL_OUTPUTS_FOLDER_NAME } from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { AllSupportedFileContentType } from "@app/types/files";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { slugify } from "@app/types/shared/utils/string_utils";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface PersistedToolOutput {
  contentType: AllSupportedFileContentType;
  fileName: string;
  scopedPath: string;
}

/**
 * Writes content to the conversation's .tool_outputs folder via DustFileSystem.
 * Returns the scoped path (e.g. "conversation-{cId}/.tool_outputs/{fileName}") on success.
 */
export async function writeToToolOutputsFolder(
  auth: Authenticator,
  conversation: ConversationType,
  {
    fileName,
    content,
    contentType,
  }: {
    fileName: string;
    content: string | Buffer;
    contentType: AllSupportedFileContentType;
  }
): Promise<Result<string, Error>> {
  const fsResult = await DustFileSystem.forConversation(auth, conversation);
  if (fsResult.isErr()) {
    return new Err(new Error(fsResult.error.message));
  }

  const scopedPath = `${SCOPED_PREFIX_CONVERSATION}${conversation.sId}/${TOOL_OUTPUTS_FOLDER_NAME}/${fileName}`;
  const writeResult = await fsResult.value.write(
    scopedPath,
    content,
    contentType
  );
  if (writeResult.isErr()) {
    return new Err(new Error(writeResult.error.message));
  }

  return new Ok(scopedPath);
}

/**
 * Attempts to persist a tool output block to the conversation's .tool_outputs folder via
 * DustFileSystem. Returns null if the block does not qualify for persistence.
 *
 * Call this as a side effect from processToolResults.
 */
export async function persistToolOutput(
  auth: Authenticator,
  conversation: ConversationType,
  block: CallToolResult["content"][number],
  { toolName, serverName }: { toolName: string; serverName: string }
): Promise<Result<PersistedToolOutput | null, Error>> {
  // Resource blocks (registered mimeTypes).
  const resolved = resolveResourceOutput(block);
  if (resolved) {
    const { fileName: rawName, content, storageContentType } = resolved;
    const ext = storageContentType === "application/json" ? ".json" : ".md";
    const fileName = makeFileName({ name: rawName, ext });

    const result = await writeToToolOutputsFolder(auth, conversation, {
      fileName,
      content,
      contentType: storageContentType,
    });
    if (result.isErr()) {
      return result;
    }

    return new Ok({
      fileName,
      scopedPath: result.value,
      contentType: storageContentType,
    });
  }

  // Text blocks above the offload threshold.
  if (shouldOffloadTextBlock(block, { serverName })) {
    const { fileName, contentType } = inferTextFileMetadata(
      block.text,
      toolName
    );

    const result = await writeToToolOutputsFolder(auth, conversation, {
      fileName,
      content: block.text,
      contentType,
    });
    if (result.isErr()) {
      return result;
    }

    return new Ok({ fileName, scopedPath: result.value, contentType });
  }

  return new Ok(null);
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

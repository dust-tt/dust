import { FILE_OFFLOAD_TEXT_SIZE_BYTES } from "@app/lib/actions/action_output_limits";
import { isResourceContentWithText } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { ToolRunContext } from "@app/lib/actions/types";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { makeFileName } from "@app/lib/api/files/action_output_fs/naming";
import {
  resolveResourceOutput,
  shouldOffloadTextBlock,
} from "@app/lib/api/files/action_output_fs/registry";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { conversationScopedPath, podScopedPath } from "@app/types/file_system";
import type { AllSupportedFileContentType } from "@app/types/files";
import { TOOL_OUTPUTS_FOLDER_NAME } from "@app/types/mount_path";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { slugify } from "@app/types/shared/utils/string_utils";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface PersistedToolOutput {
  contentType: AllSupportedFileContentType;
  fileName: string;
  scopedPath: string;
  // Byte size of the persisted content, surfaced in the offload descriptor attached to the
  // replacement snippet block.
  totalBytes: number;
}

/**
 * Builds the DustFileSystem associated with a tool run context: the conversation file system when
 * running in an agent loop, the pod (project space) file system when running in a sandbox
 * function invocation.
 */
async function getDustFileSystemForRunContext(
  auth: Authenticator,
  runContext: ToolRunContext
): Promise<Result<DustFileSystem, Error>> {
  switch (runContext.contextType) {
    case "agent_loop":
      return DustFileSystem.forConversation(auth, runContext.conversation);
    case "sandbox_function":
      return DustFileSystem.forPod(
        auth,
        runContext.invocation.sandboxFunction.space
      );
    default:
      return assertNever(runContext);
  }
}

function getToolOutputsScopedPath(
  runContext: ToolRunContext,
  fileName: string
): string {
  switch (runContext.contextType) {
    case "agent_loop":
      return conversationScopedPath({
        conversationId: runContext.conversation.sId,
        rel: `${TOOL_OUTPUTS_FOLDER_NAME}/${fileName}`,
      });
    case "sandbox_function":
      // Scoped by function slug (unique within the pod): a pod outlives its functions, so a
      // flat folder would mix outputs across functions. The slug is preferred over the
      // invocation sId as it is shorter and less error-prone for the model to reference. The
      // folder is visible in-sandbox at /files/pod-{pId}/.tool_outputs/{slug}/.
      return podScopedPath(
        runContext.invocation.sandboxFunction.space.sId,
        `${TOOL_OUTPUTS_FOLDER_NAME}/${runContext.invocation.sandboxFunction.slug}/${fileName}`
      );
    default:
      return assertNever(runContext);
  }
}

/**
 * Writes content to the conversation root via DustFileSystem.
 * Returns the scoped path (e.g. "conversation-{cId}/{fileName}") on success.
 * Use for user-facing generated files (PDFs, audio, etc.) that should be visible at the top level.
 * Use writeToToolOutputsFolder for internal outputs the model reads back during execution.
 */
export async function writeToConversationFolder(
  auth: Authenticator,
  conversation: ConversationWithoutContentType,
  {
    content,
    contentType,
    fileName,
  }: {
    content: string | Buffer;
    contentType: string;
    fileName: string;
  }
): Promise<Result<string, Error>> {
  const fsResult = await DustFileSystem.forConversation(auth, conversation);
  if (fsResult.isErr()) {
    return new Err(new Error(fsResult.error.message));
  }

  const scopedPath = conversationScopedPath({
    conversationId: conversation.sId,
    rel: fileName,
  });
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
 * Writes content to the pod (project space) root via DustFileSystem.
 * Returns the scoped path (e.g. "pod-{spaceId}/{fileName}") on success.
 * Use for user-facing generated files (PDFs, audio, etc.) that should be visible at the top level.
 * Use writeToToolOutputsFolder for internal outputs the model reads back during execution.
 */
export async function writeToPodFolder(
  auth: Authenticator,
  space: SpaceResource,
  {
    content,
    contentType,
    fileName,
  }: {
    content: string | Buffer;
    contentType: string;
    fileName: string;
  }
): Promise<Result<string, Error>> {
  const fsResult = await DustFileSystem.forPod(auth, space);
  if (fsResult.isErr()) {
    return new Err(new Error(fsResult.error.message));
  }

  const scopedPath = podScopedPath(space.sId, fileName);
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
 * Writes content to the .tool_outputs folder of the file system associated with the tool run
 * context (conversation in an agent loop, pod in a sandbox function invocation) via
 * DustFileSystem. Returns the scoped path (e.g. "conversation-{cId}/.tool_outputs/{fileName}" or
 * "pod-{pId}/.tool_outputs/{fileName}") on success.
 */
export async function writeToToolOutputsFolder(
  auth: Authenticator,
  runContext: ToolRunContext,
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
  const fsResult = await getDustFileSystemForRunContext(auth, runContext);
  if (fsResult.isErr()) {
    return new Err(new Error(fsResult.error.message));
  }

  const scopedPath = getToolOutputsScopedPath(runContext, fileName);

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
 * Attempts to persist a tool output block to the run context's .tool_outputs folder via
 * DustFileSystem. Returns null if the block does not qualify for persistence.
 *
 * Call this as a side effect from processToolResults.
 */
export async function persistToolOutput(
  auth: Authenticator,
  runContext: ToolRunContext,
  block: CallToolResult["content"][number],
  { toolName, serverName }: { toolName: string; serverName: string }
): Promise<Result<PersistedToolOutput | null, Error>> {
  // Resource blocks (registered mimeTypes).
  const resolved = resolveResourceOutput(block);
  if (resolved) {
    const { fileName: rawName, content, storageContentType } = resolved;
    const ext = storageContentType === "application/json" ? ".json" : ".md";
    const fileName = makeFileName({ name: rawName, ext });

    const result = await writeToToolOutputsFolder(auth, runContext, {
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
      totalBytes: Buffer.byteLength(content, "utf8"),
    });
  }

  // Text blocks above the offload threshold.
  if (shouldOffloadTextBlock(block, { serverName })) {
    const { fileName, contentType } = inferTextFileMetadata(
      block.text,
      toolName
    );

    const result = await writeToToolOutputsFolder(auth, runContext, {
      fileName,
      content: block.text,
      contentType,
    });
    if (result.isErr()) {
      return result;
    }

    return new Ok({
      fileName,
      scopedPath: result.value,
      contentType,
      totalBytes: Buffer.byteLength(block.text, "utf8"),
    });
  }

  // Resource blocks whose text exceeds the offload threshold.
  if (
    isResourceContentWithText(block) &&
    Buffer.byteLength(block.resource.text, "utf8") >
      FILE_OFFLOAD_TEXT_SIZE_BYTES
  ) {
    const text = block.resource.text;
    const { fileName, contentType } = inferTextFileMetadata(text, toolName);

    const result = await writeToToolOutputsFolder(auth, runContext, {
      fileName,
      content: text,
      contentType,
    });
    if (result.isErr()) {
      return result;
    }

    return new Ok({
      fileName,
      scopedPath: result.value,
      contentType,
      totalBytes: Buffer.byteLength(text, "utf8"),
    });
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

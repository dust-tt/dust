// All mime types are okay to use from the public API.

import {
  FILE_OFFLOAD_FILE_SIZE_BYTES,
  FILE_OFFLOAD_IMAGE_SIZE_BYTES,
} from "@app/lib/actions/action_output_limits";
import type {
  ToolGeneratedFilePathType,
  ToolGeneratedFileType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  isRunAgentQueryResourceType,
  isSearchResultResourceType,
  isToolGeneratedFile,
  isToolMarkerResourceType,
  TOOL_GENERATED_FILE_MIME_TYPE,
  TOOL_GENERATED_FILE_PATH_MIME_TYPE,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { ToolContext } from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { isEnableSkillResultOutput } from "@app/lib/api/actions/servers/skill_management/rendering";
import {
  attachmentUsageHintsFor,
  makeFileAttachment,
  renderAttachmentXml,
} from "@app/lib/api/assistant/conversation/attachments";
import {
  writeToConversationFolder,
  writeToPodFolder,
} from "@app/lib/api/files/action_output_fs";
import { makeFileName } from "@app/lib/api/files/action_output_fs/naming";
import type { ProcessAndStoreFileError } from "@app/lib/api/files/processing";
import { uploadBase64ImageToFileStorage } from "@app/lib/api/files/upload";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import type { FileModel } from "@app/lib/resources/storage/models/files";
import logger from "@app/logger/logger";
import type { AttachmentCapabilityContext } from "@app/types/api/assistant/conversation/attachments";
import type { SupportedImageContentType } from "@app/types/files";
import { isSupportedFileContentType } from "@app/types/files";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { hasNullUnicodeCharacter } from "@app/types/shared/utils/string_utils";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { isSupportedImageContentType } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";
import { basename, extname } from "path";

type ResourceInfo =
  | { type: "image"; contentType: SupportedImageContentType }
  | { type: "file"; contentType: string };

function getResourceInfo(mimeType: string): ResourceInfo {
  if (isSupportedImageContentType(mimeType)) {
    return { type: "image", contentType: mimeType };
  }
  return { type: "file", contentType: mimeType };
}

export function hideFileFromActionOutput({
  file,
  fileId,
  content,
  workspaceId,
}: {
  file: FileModel | null;
  fileId: ModelId | null;
  content: CallToolResult["content"][number] | null;
  workspaceId: ModelId;
}): CallToolResult["content"][number] | null {
  // For tool-generated files and non-file content, we keep the resource as is.
  if (!fileId || isToolGeneratedFile(content) || !content) {
    return content;
  }
  // We want to hide the original file url from the model.
  const sid = FileResource.modelIdToSId({
    id: fileId,
    workspaceId,
  });
  let contentType;
  switch (content.type) {
    case "text":
      contentType = "text/plain";
      break;
    case "image":
      contentType = content.mimeType;
      break;
    case "resource":
      contentType = content.resource.mimeType ?? "unknown";
      break;
    default:
      contentType = "unknown";
      break;
  }
  const snippet = file?.snippet ?? null;
  return {
    type: "text",
    text: `A file of type ${contentType} with id ${sid} was generated successfully and made available to the conversation. The user is presented with a button to download it, do not attempt to generate a link to it. ${snippet ? `\n\nSnippet:\n ${snippet}` : ""}`,
  };
}

export function rewriteContentForModel(
  content: CallToolResult["content"][number],
  capabilities: AttachmentCapabilityContext
): CallToolResult["content"][number] | null {
  // Only render tool generated files that are supported.
  if (
    isToolGeneratedFile(content) &&
    isSupportedFileContentType(content.resource.contentType)
  ) {
    const attachment = makeFileAttachment({
      fileId: content.resource.fileId,
      source: "agent",
      contentType: content.resource.contentType,
      title: content.resource.title,
      snippet: content.resource.snippet,
      isInProjectContext: content.resource.isInProjectContext ?? false,
      hideFromUser: false, // Model do not care.
      capabilities,
    });
    const xml = renderAttachmentXml({
      attachment,
      usage: attachmentUsageHintsFor(capabilities),
    });
    let text = content.resource.text;
    if (text) {
      text += `\n`;
    }

    text += xml;
    return {
      type: "text",
      text,
    };
  }

  if (isEnableSkillResultOutput(content)) {
    return {
      type: "text",
      text: content.resource.text,
    };
  }

  if (
    isToolMarkerResourceType(content) ||
    isRunAgentQueryResourceType(content)
  ) {
    return null;
  }

  if (isSearchResultResourceType(content)) {
    let text = `Search result: ${content.resource.text}\n`;
    text += `id: ${content.resource.id}\n`;
    text += `url: ${content.resource.uri}\n`;
    text += `ref: ${content.resource.ref}\n`;
    // We don't show the source provider, as it's redundant with the URL.

    if (content.resource.tags.length > 0) {
      text += `tags: ${content.resource.tags.join(", ")}\n`;
    }
    if (content.resource.chunks.length > 0) {
      text += `retrieved chunks:\n-----------\n${content.resource.chunks.join("------------")}`;
    }

    return {
      type: "text",
      text,
    };
  }

  return content;
}

/**
 * Validates tool inputs for Unicode characters that could cause issues.
 * Returns Result indicating success or validation error.
 */
export function validateToolInputs(
  rawInputs: Record<string, unknown>
): Result<void, Error> {
  for (const value of Object.values(rawInputs)) {
    if (typeof value === "string" && hasNullUnicodeCharacter(value)) {
      return new Err(
        new Error("Invalid Unicode character in inputs, please retry.")
      );
    }
  }

  return new Ok(undefined);
}

export async function handleBase64Upload(
  auth: Authenticator,
  {
    base64Data,
    fileName,
    mimeType,
    toolContext,
  }: {
    base64Data: string;
    mimeType: string;
    fileName: string;
    toolContext: ToolContext;
  }
): Promise<{
  content: CallToolResult["content"][number];
  file: FileResource | null;
}> {
  const { runContext } = toolContext;
  assert(runContext, "handleBase64Upload requires a tool run context.");

  const resourceInfo = getResourceInfo(mimeType);

  const maxUploadSizeBytes =
    resourceInfo.type === "image"
      ? FILE_OFFLOAD_IMAGE_SIZE_BYTES
      : FILE_OFFLOAD_FILE_SIZE_BYTES;

  if (base64Data.length > maxUploadSizeBytes) {
    return {
      content: {
        type: "text",
        text: `The generated ${resourceInfo.type} was too large to be stored.`,
      },
      file: null,
    };
  }

  // Images stay on FileResource so they go through the resize pipeline. Tool-generated images can
  // be fed back to the model for vision tasks, so correct sizing matters. Outside of a conversation
  // (sandbox function) they fall through to the plain file-system write below like any other file.
  if (resourceInfo.type === "image" && isAgentLoopRunContext(runContext)) {
    const uploadResult: Result<FileResource, ProcessAndStoreFileError> =
      await uploadBase64ImageToFileStorage(auth, {
        base64: base64Data,
        contentType: resourceInfo.contentType,
        fileName,
        useCase: "conversation",
        useCaseMetadata: { conversationId: runContext.conversation.sId },
      });

    if (uploadResult.isErr()) {
      logger.error(
        {
          action: "mcp_tool",
          tool: "generate_image",
          workspaceId: auth.getNonNullableWorkspace().sId,
          error: uploadResult.error,
        },
        "Failed to save the generated image."
      );
      return {
        content: { type: "text", text: "Failed to save the generated image." },
        file: null,
      };
    }

    const resource: ToolGeneratedFileType = {
      mimeType: TOOL_GENERATED_FILE_MIME_TYPE,
      uri: `file://${uploadResult.value.sId}`,
      fileId: uploadResult.value.sId,
      title: fileName,
      contentType: resourceInfo.contentType,
      snippet: uploadResult.value.snippet,
      text: `Generated image: ${fileName}`,
    };

    return {
      content: {
        type: "resource",
        resource,
      },
      file: uploadResult.value,
    };
  }

  const ext = extname(fileName);
  const uniqueFileName = makeFileName({ name: basename(fileName, ext), ext });

  const writeArgs = {
    fileName: uniqueFileName,
    content: Buffer.from(base64Data, "base64"),
    contentType: resourceInfo.contentType,
  };

  let writeResult: Result<string, Error>;
  switch (runContext.contextType) {
    case "agent_loop":
      writeResult = await writeToConversationFolder(
        auth,
        runContext.conversation,
        writeArgs
      );
      break;
    case "sandbox_function":
      writeResult = await writeToPodFolder(
        auth,
        runContext.invocation.sandboxFunction.space,
        writeArgs
      );
      break;
    default:
      assertNever(runContext);
  }

  if (writeResult.isErr()) {
    logger.error(
      {
        action: "mcp_tool",
        tool: "generate_file",
        workspaceId: auth.getNonNullableWorkspace().sId,
        error: writeResult.error,
      },
      "Failed to save the generated file."
    );
    return {
      content: { type: "text", text: "Failed to save the generated file." },
      file: null,
    };
  }

  const resource: ToolGeneratedFilePathType = {
    mimeType: TOOL_GENERATED_FILE_PATH_MIME_TYPE,
    uri: writeResult.value,
    path: writeResult.value,
    title: uniqueFileName,
    contentType: resourceInfo.contentType,
    text: `Generated file: ${uniqueFileName}`,
  };

  return {
    content: { type: "resource", resource },
    file: null,
  };
}

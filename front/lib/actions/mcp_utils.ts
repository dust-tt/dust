// All mime types are okay to use from the public API.
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { isSupportedImageContentType } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { MAX_RESOURCE_CONTENT_SIZE } from "@app/lib/actions/action_output_limits";
import {
  isBlobResource,
  isIncludeQueryResourceType,
  isRunAgentQueryResourceType,
  isSearchQueryResourceType,
  isToolGeneratedFile,
  isToolMarkerResourceType,
  isWebsearchQueryResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  getAttachmentFromToolOutput,
  renderAttachmentXml,
} from "@app/lib/api/assistant/conversation/attachments";
import {
  uploadBase64DataToFileStorage,
  uploadBase64ImageToFileStorage,
} from "@app/lib/api/files/upload";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMCPActionOutputItem } from "@app/lib/models/assistant/actions/mcp";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import type {
  FileUseCase,
  FileUseCaseMetadata,
  Result,
  SupportedFileContentType,
  SupportedImageContentType,
} from "@app/types";
import {
  Err,
  hasNullUnicodeCharacter,
  isSupportedFileContentType,
  Ok,
} from "@app/types";

export function hideFileFromActionOutput({
  file,
  fileId,
  content,
  workspaceId,
}: AgentMCPActionOutputItem): CallToolResult["content"][number] | null {
  // For tool-generated files and non-file content, we keep the resource as is.
  if (!fileId || isToolGeneratedFile(content)) {
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
  content: CallToolResult["content"][number]
): CallToolResult["content"][number] | null {
  // Only render tool generated files that are supported.
  if (
    isToolGeneratedFile(content) &&
    isSupportedFileContentType(content.resource.contentType)
  ) {
    const attachment = getAttachmentFromToolOutput({
      fileId: content.resource.fileId,
      contentType: content.resource.contentType,
      title: content.resource.title,
      snippet: content.resource.snippet,
    });
    const xml = renderAttachmentXml({ attachment });
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

  if (
    isToolMarkerResourceType(content) ||
    isSearchQueryResourceType(content) ||
    isIncludeQueryResourceType(content) ||
    isWebsearchQueryResourceType(content) ||
    isRunAgentQueryResourceType(content)
  ) {
    return null;
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
    block,
    mimeType,
    fileUseCase,
    fileUseCaseMetadata,
  }: {
    base64Data: string;
    mimeType: string;
    fileName: string;
    block: CallToolResult["content"][number];
    fileUseCase: FileUseCase;
    fileUseCaseMetadata: FileUseCaseMetadata;
  }
): Promise<{
  content: CallToolResult["content"][number];
  file: FileResource | null;
}> {
  const resourceType = isSupportedFileContentType(mimeType)
    ? "file"
    : isSupportedImageContentType(mimeType)
      ? "image"
      : null;

  if (!resourceType) {
    return {
      content: {
        type: "text",
        text: `The mime type of the generated resource (${mimeType}) is not supported.`,
      },
      file: null,
    };
  }

  if (base64Data.length > MAX_RESOURCE_CONTENT_SIZE) {
    return {
      content: {
        type: "text",
        text: `The generated ${resourceType} was too large to be stored.`,
      },
      file: null,
    };
  }

  try {
    const uploadResult =
      resourceType === "image"
        ? await uploadBase64ImageToFileStorage(auth, {
            base64: base64Data,
            // Cast is valid because of the previous check.
            contentType: mimeType as SupportedImageContentType,
            fileName,
            useCase: fileUseCase,
            useCaseMetadata: fileUseCaseMetadata,
          })
        : await uploadBase64DataToFileStorage(auth, {
            base64: base64Data,
            // Cast is valid because of the previous check.
            contentType: mimeType as SupportedFileContentType,
            fileName,
            useCase: fileUseCase,
            useCaseMetadata: fileUseCaseMetadata,
          });

    if (uploadResult.isErr()) {
      logger.error(
        { error: uploadResult.error },
        `Error upserting ${resourceType} from base64`
      );
      return {
        content: {
          type: "text",
          text: `Failed to upsert the generated ${resourceType} as a file.`,
        },
        file: null,
      };
    }

    return {
      content: {
        ...block,
        // Remove the data from the block to avoid storing it in the database.
        ...(block.type === "image" ? { data: "" } : {}),
        ...(isBlobResource(block)
          ? { resource: { ...block.resource, blob: "" } }
          : {}),
      },
      file: uploadResult.value,
    };
  } catch (error) {
    logger.error(
      {
        action: "mcp_tool",
        tool: `generate_${resourceType}`,
        workspaceId: auth.getNonNullableWorkspace().sId,
        error,
      },
      `Failed to save the generated ${resourceType}.`
    );

    return {
      content: {
        type: "text",
        text: `Failed to save the generated ${resourceType}.`,
      },
      file: null,
    };
  }
}

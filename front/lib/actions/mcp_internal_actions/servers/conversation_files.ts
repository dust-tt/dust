import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { conversationAttachmentId } from "@app/lib/api/assistant/conversation/attachments";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import {
  CONTENT_OUTDATED_MSG,
  getContentFragmentFromAttachmentFile,
} from "@app/lib/resources/content_fragment_resource";
import type {
  ConversationType,
  ImageContent,
  ModelConfigurationType,
  Result,
  TextContent,
} from "@app/types";
import { Err, isImageContent, isTextContent, Ok } from "@app/types";

/**
 * MCP server for handling conversation file operations.
 *
 * This server is designed to replace the legacy conversation_include_file action
 * when JIT actions are migrated to use MCP. Currently, JIT actions still use
 * the legacy action system, but this server provides the MCP implementation
 * for future migration.
 */
const serverInfo: InternalMCPServerDefinitionType = {
  name: "conversation_files",
  version: "1.0.0",
  description: "Include files from conversation attachments",
  icon: "ActionDocumentTextIcon",
  authorization: null,
  documentationUrl: null,
};

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = new McpServer(serverInfo);

  server.tool(
    "include_file",
    "Include the content of a file from the conversation attachments. Use this to access the full content of files that have been attached to the conversation.",
    {
      fileId: z
        .string()
        .describe(
          "The fileId of the attachment to include, as returned by the conversation_list_files action"
        ),
    },
    async ({ fileId }) => {
      if (!agentLoopContext?.runContext) {
        return makeMCPToolTextError("No conversation context available");
      }

      const conversation = agentLoopContext.runContext.conversation;

      const model = getSupportedModelConfig(
        agentLoopContext.runContext.agentConfiguration.model
      );

      const fileRes = await getFileFromConversation(
        auth,
        fileId,
        conversation,
        model
      );

      if (fileRes.isErr()) {
        return makeMCPToolTextError(fileRes.error);
      }

      const { content, title } = fileRes.value;

      // Get the file metadata to extract the actual content type
      const attachments = listAttachments(conversation);
      const attachment = attachments.find(
        (a) => conversationAttachmentId(a) === fileId
      );

      if (isTextContent(content)) {
        return {
          isError: false,
          content: [
            {
              type: "text",
              text: content.text,
            },
          ],
        };
      } else if (isImageContent(content)) {
        // For images, we return the URL as a resource with the correct MIME type
        return {
          isError: false,
          content: [
            {
              type: "resource",
              resource: {
                uri: content.image_url.url,
                mimeType: attachment?.contentType || "application/octet-stream",
                text: `Image: ${title}`,
              },
            },
          ],
        };
      }

      return makeMCPToolTextError(
        `File ${attachment?.title || fileId} of type ${attachment?.contentType || "unknown"} has no text or image content`
      );
    }
  );

  return server;
}

export async function getFileFromConversation(
  auth: Authenticator,
  fileId: string,
  conversation: ConversationType,
  model: ModelConfigurationType
): Promise<
  Result<
    { fileId: string; title: string; content: ImageContent | TextContent },
    string
  >
> {
  // Note on `contentFragmentVersion`: two content fragment versions are created with different
  // fileIds. So we accept here rendering content fragments that are superseded. This will mean
  // that past actions on a previous version of a content fragment will correctly render the
  // content as being superseded, showing the model that a new version is available. The fileId of
  // this new version will be different, but the title will likely be the same and the model should
  // be able to understand the state of affairs. We use content.flat() to consider all versions of
  // messages here (to support rendering a file that was part of an old version of a previous
  // message).
  const attachments = listAttachments(conversation);
  const attachment = attachments.find(
    (a) => conversationAttachmentId(a) === fileId
  );
  if (!attachment || !attachment.isIncludable) {
    return new Err(`File \`${fileId}\` not found in conversation`);
  }
  if (attachment.contentFragmentVersion === "superseded") {
    return new Ok({
      fileId,
      title: attachment.title,
      content: {
        type: "text",
        text: CONTENT_OUTDATED_MSG,
      },
    });
  }
  const r = await getContentFragmentFromAttachmentFile(auth, {
    attachment,
    excludeImages: false,
    model,
  });

  if (r.isErr()) {
    return new Err(`Error including conversation file: ${r.error}`);
  }

  if (
    !isTextContent(r.value.content[0]) &&
    !isImageContent(r.value.content[0])
  ) {
    return new Err(`File \`${fileId}\` has no text or image content`);
  }

  return new Ok({
    fileId,
    title: attachment.title,
    content: r.value.content[0],
  });
}

export default createServer;

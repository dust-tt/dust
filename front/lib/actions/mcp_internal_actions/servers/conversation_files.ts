import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ConversationIncludeFileActionType } from "@app/lib/actions/conversation/include_file";
import { conversationAttachmentId } from "@app/lib/actions/conversation/list_files";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { listFiles } from "@app/lib/api/assistant/jit_utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { isImageContent, isTextContent } from "@app/types";

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

      const fileRes =
        await ConversationIncludeFileActionType.fileFromConversation(
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
      const files = listFiles(conversation);
      const file = files.find((f) => conversationAttachmentId(f) === fileId);

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
                mimeType: file?.contentType || "application/octet-stream",
                text: `Image: ${title}`,
              },
            },
          ],
        };
      }

      return makeMCPToolTextError(
        `File ${file?.title || fileId} of type ${file?.contentType || "unknown"} has no text or image content`
      );
    }
  );

  return server;
}

export default createServer;

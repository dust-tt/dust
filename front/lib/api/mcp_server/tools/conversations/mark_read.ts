import { clearActionRequiredIfNoBlockedActions } from "@app/lib/api/assistant/conversation/blocked_actions";
import { registerDustMcpTool } from "@app/lib/api/mcp_server/tools/register";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mcpError, mcpJsonResponse } from "../response";

const inputSchema = {
  conversationId: z
    .string()
    .describe("ID of the conversation to mark as read or unread."),
  read: z
    .boolean()
    .describe("true = mark as read (clear unread); false = mark as unread"),
};

export function registerConversationsMarkReadTool(server: McpServer) {
  registerDustMcpTool(
    server,
    "mark_conversation_read",
    {
      description:
        "Mark a conversation as read or unread for the authenticated user. " +
        "Acts on that user's read state only. Use when triaging the inbox or " +
        "when the user asks to mark a conversation read or unread.",
      inputSchema,
    },
    async (auth, { conversationId, read }) => {
      const conversationRes =
        // biome-ignore lint/plugin/noExpensiveConversationFetch: need unread + actionRequired
        await ConversationResource.fetchConversationWithParticipantState(
          auth,
          conversationId
        );
      if (conversationRes.isErr()) {
        return mcpError("Conversation not found");
      }

      const conversation = conversationRes.value;

      if (read) {
        // Mirror the PATCH conversation API: skip the write when already read
        // so future-dated lastReadAt stamps are preserved.
        if (conversation.unread) {
          const markRes = await ConversationResource.markAsReadForAuthUser(
            auth,
            { conversation }
          );
          if (markRes.isErr()) {
            return mcpError(markRes.error.message);
          }
        }

        if (conversation.actionRequired) {
          await clearActionRequiredIfNoBlockedActions(auth, {
            conversationId: conversation.sId,
          });
        }
      } else {
        const markRes = await ConversationResource.markAsUnreadForAuthUser(
          auth,
          { conversation }
        );
        if (markRes.isErr()) {
          return mcpError(markRes.error.message);
        }
      }

      return mcpJsonResponse({
        success: true,
        conversationId: conversation.sId,
        read,
      });
    }
  );
}

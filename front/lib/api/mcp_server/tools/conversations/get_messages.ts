import { getLightConversation } from "@app/lib/api/assistant/conversation/fetch";
import { getConversationApiError } from "@app/lib/api/assistant/conversation/helper";
import { renderConversationAsText } from "@app/lib/api/assistant/conversation/render_as_text";
import { getAuthenticatorFromMcpContext } from "@app/lib/api/mcp_server/context";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mcpJsonResponse } from "../response";

const GET_CONVERSATION_MESSAGES_PAGE_SIZE = 25;

const inputSchema = {
  conversationId: z
    .string()
    .describe("ID of the conversation to fetch messages from."),
  lastValue: z
    .number()
    .int()
    .optional()
    .describe(
      "Cursor from a previous response's lastValue field (message rank) for the next page."
    ),
};

export function registerConversationsGetMessagesTool(server: McpServer) {
  server.registerTool(
    "get_conversation_messages",
    {
      description:
        "Fetch a paginated page of messages from a conversation (25 per page, most recent first). Returns human-readable message text. Use lastValue to load older messages.",
      inputSchema,
    },
    async ({ conversationId, lastValue }) => {
      const auth = getAuthenticatorFromMcpContext();

      const conversationRes = await getLightConversation(
        auth,
        conversationId,
        false,
        null,
        null,
        {
          limit: GET_CONVERSATION_MESSAGES_PAGE_SIZE,
          lastRank: lastValue ?? null,
        }
      );

      if (conversationRes.isErr()) {
        const apiError = getConversationApiError(conversationRes.error);
        return {
          content: [
            {
              type: "text" as const,
              text: apiError.api_error.message,
            },
          ],
          isError: true as const,
        };
      }

      const conversation = conversationRes.value;

      return mcpJsonResponse({
        conversationId: conversation.sId,
        title: conversation.title,
        messages: renderConversationAsText(conversation, {
          includeTimestamps: true,
          includeEmail: true,
          includeUnread: true,
        }),
        hasMore: conversation.hasMore ?? false,
        lastValue: conversation.lastValue ?? null,
      });
    }
  );
}

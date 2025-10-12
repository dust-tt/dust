import { isEmailValid, normalizeError } from "@app/shared/lib/utils";
import type { WebViewContext } from "@frontapp/plugin-sdk/dist/webViewSdkTypes";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const DEFAULT_HISTORY_LIMIT = 10;

// Schema for the get past conversations tool arguments.
export const GetPastConversationsToolArgsSchema = z.object({
  limit: z
    .number()
    .optional()
    .describe(
      `Maximum number of past conversations to return (default ${DEFAULT_HISTORY_LIMIT}).`
    ),
});

/**
 * Registers the get past conversations tool with the MCP server
 * @param server The MCP server to register the tool with
 * @param frontContext The Front context for searching conversations
 */
export function registerGetPastConversationsTool(
  server: McpServer,
  frontContext: WebViewContext | null
): void {
  server.tool(
    "front-get-past-conversations",
    "Retrieves past conversations with the current conversation's customer.",
    {
      searchParams: GetPastConversationsToolArgsSchema,
    },
    async ({ searchParams }) => {
      if (!frontContext || frontContext.type !== "singleConversation") {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Front context not available or no conversation is currently selected",
            },
          ],
        };
      }

      try {
        const { limit = DEFAULT_HISTORY_LIMIT } = searchParams;

        // Extract customer email from conversation recipient
        const conversation = frontContext.conversation;
        const customerEmail =
          "handle" in conversation.recipient
            ? conversation.recipient.handle
            : null;

        if (!customerEmail) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "Could not extract customer email from current conversation",
              },
            ],
          };
        }

        // Validate email format to prevent injection
        if (!isEmailValid(customerEmail)) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "Invalid customer email format",
              },
            ],
          };
        }

        // SECURITY: Sanitize email and wrap in quotes to prevent search injection
        // Escape quotes and backslashes in the email address
        const sanitizedEmail = customerEmail.replace(/["\\']/g, "\\$&");

        // SECURITY: Only search for conversations from the current customer
        // Wrapping in quotes treats the email as a literal string
        const results = await frontContext.search(`from:"${sanitizedEmail}"`);

        if (!results.conversations || results.conversations.length === 0) {
          return {
            isError: false,
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    customerEmail,
                    totalResults: 0,
                    conversations: [],
                    message: "No past conversations found with this customer.",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // Filter out the current conversation and format results
        const currentConversationId = frontContext.conversation.id;
        const pastConversations = results.conversations
          .filter((conv) => conv.id !== currentConversationId)
          .slice(0, limit)
          .map((conv, idx) => ({
            index: idx + 1,
            id: conv.id,
            subject: conv.subject || "(No subject)",
            date: conv.createdAt.toISOString(),
            status: conv.status,
          }));

        return {
          isError: false,
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  customerEmail,
                  totalResults: results.conversations.length - 1, // Exclude current
                  showing: pastConversations.length,
                  conversations: pastConversations,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        console.error("Error getting past conversations from Front:", error);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error getting past conversations: ${normalizeError(error)}`,
            },
          ],
        };
      }
    }
  );
}

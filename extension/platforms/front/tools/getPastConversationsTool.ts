import { normalizeError } from "@app/shared/lib/utils";
import type { WebViewContext } from "@frontapp/plugin-sdk/dist/webViewSdkTypes";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Schema for the get past conversations tool arguments.
export const GetPastConversationsToolArgsSchema = z.object({
  limit: z
    .number()
    .optional()
    .describe("Maximum number of past conversations to return (default 5)."),
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
    "Retrieves past conversations with the current conversation's customer. SECURITY: Only searches\n" +
      "for conversations from the customer email in the current conversation - cannot search arbitrary\n" +
      "email addresses. Returns conversation IDs, subjects, dates, and status. Useful for understanding\n" +
      "conversation history with the current customer.",
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
        const { limit = 5 } = searchParams;

        // Get the current conversation's messages to extract the customer email
        const messages = await frontContext.listMessages();

        if (!messages.results || messages.results.length === 0) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "No messages found in current conversation",
              },
            ],
          };
        }

        // Find the first inbound message to get the customer's email
        const inboundMessage = messages.results.find(
          (msg) => msg.status === "inbound"
        );

        if (!inboundMessage || !inboundMessage.from) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "Could not identify customer email from current conversation",
              },
            ],
          };
        }

        // Extract the customer's email (handle property contains the email)
        const customerEmail =
          "handle" in inboundMessage.from
            ? inboundMessage.from.handle
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

        // SECURITY: Only search for conversations from the current customer
        const results = await frontContext.search(`from:${customerEmail}`);

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

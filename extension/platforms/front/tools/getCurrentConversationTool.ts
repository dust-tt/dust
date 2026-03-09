import { getCurrentConversationTimeline } from "@extension/platforms/front/tools/utils";
import { normalizeError } from "@extension/shared/lib/utils";
import type { WebViewContext } from "@frontapp/plugin-sdk/dist/webViewSdkTypes";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Registers the get current conversation tool with the MCP server
 * @param server The MCP server to register the tool with
 * @param frontContext The Front context for sending comments
 */
export function registerGetCurrentConversationTool(
  server: McpServer,
  frontContext: WebViewContext | null
): void {
  server.tool(
    "front-get-current-conversation",
    "Retrieves the currently selected/opened conversation from Front email client. This tool\n" +
      "returns the conversation details including its ID, subject, participants, and content.\n" +
      "It's useful for getting context about the current conversation being viewed.",
    async () => {
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
        const conversationTimelineRes =
          await getCurrentConversationTimeline(frontContext);

        if (conversationTimelineRes.isErr()) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text:
                  `Error retrieving current conversation timeline: ` +
                  `${conversationTimelineRes.error.message}`,
              },
            ],
          };
        }

        return {
          isError: false,
          content: [
            {
              type: "text",
              text: JSON.stringify(conversationTimelineRes.value),
            },
          ],
        };
      } catch (error) {
        console.error(
          "Error retrieving current conversation from Front:",
          error
        );

        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error retrieving current conversation: ${normalizeError(error)}`,
            },
          ],
        };
      }
    }
  );
}

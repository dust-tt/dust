import type {
  GetActiveTabBackgroundMessage,
  GetActiveTabBackgroundResponse,
} from "@extension/platforms/chrome/messages";
import type { BrowserMessagingService } from "@extension/shared/services/platform";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Registers the get-current-page tool with the MCP server.
 * Retrieves the title, URL, and text content of the active browser tab.
 */
export function registerGetCurrentPageTool(
  server: McpServer,
  messaging: BrowserMessagingService | null
): void {
  server.tool(
    "get-current-page",
    "Retrieves the title, URL, and text content of the active browser tab. " +
      "Use this to understand what page the user is currently viewing.",
    {},
    async () => {
      if (!messaging) {
        return {
          content: [{ type: "text", text: "Messaging service not available." }],
        };
      }

      try {
        const response = await messaging.sendMessage<
          GetActiveTabBackgroundMessage,
          GetActiveTabBackgroundResponse
        >({
          type: "GET_ACTIVE_TAB",
          includeContent: true,
          includeCapture: false,
        });

        if (!response) {
          return {
            content: [
              {
                type: "text",
                text: "No response received from background script.",
              },
            ],
          };
        }

        if (response.error) {
          return {
            content: [{ type: "text", text: `Error: ${response.error}` }],
          };
        }

        const parts = [`Title: ${response.title}`, `URL: ${response.url}`];
        if (response.content) {
          parts.push(`Content:\n${response.content}`);
        }

        return {
          content: [{ type: "text", text: parts.join("\n") }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to get current page: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}

import { sendListTabsMessage } from "@extension/platforms/chrome/messages";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Registers the list-browser-tabs tool with the MCP server.
 * Lists all open tabs in the current browser window.
 */
export function registerListTabsTool(server: McpServer): void {
  server.tool(
    "list-browser-tabs",
    "Lists all open tabs in the current browser window with their tab ID, title, URL, and whether they are active. " +
      "Use this to discover which tabs the user has open. " +
      "Tab IDs can be passed to get-current-browser-page or get-current-browser-page-screenshot to read a specific tab.",
    {},
    async () => {
      try {
        const result = await sendListTabsMessage();
        const tabs = result.tabs ?? [];

        if (!tabs || tabs.length === 0) {
          return {
            content: [{ type: "text", text: "No tabs found." }],
          };
        }

        const lines = tabs.map(
          (t) => `${t.active ? "* " : "  "}[${t.tabId}] ${t.title} — ${t.url}`
        );

        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to list tabs: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}

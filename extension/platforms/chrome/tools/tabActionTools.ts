import { sendTabActionMessage } from "@extension/platforms/chrome/messages";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Registers tab manipulation tools with the MCP server.
 */
export function registerTabActionTools(server: McpServer): void {
  server.tool(
    "activate-browser-tab",
    "Switches to the specified browser tab, making it the active tab. " +
      "Use list-browser-tabs to discover tab IDs.",
    {
      tabId: z.number().describe("The tab ID to activate."),
    },
    async ({ tabId }) => {
      try {
        const result = await sendTabActionMessage({
          type: "ACTIVATE_TAB",
          tabId,
        });
        if (!result.success) {
          return {
            content: [
              { type: "text", text: `Error: ${result.error ?? "Unknown"}` },
            ],
          };
        }
        return {
          content: [{ type: "text", text: `Activated tab ${tabId}.` }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to activate tab: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "close-browser-tab",
    "Closes the specified browser tab. Use list-browser-tabs to discover tab IDs.",
    {
      tabId: z.number().describe("The tab ID to close."),
    },
    async ({ tabId }) => {
      try {
        const result = await sendTabActionMessage({
          type: "CLOSE_TAB",
          tabId,
        });
        if (!result.success) {
          return {
            content: [
              { type: "text", text: `Error: ${result.error ?? "Unknown"}` },
            ],
          };
        }
        return {
          content: [{ type: "text", text: `Closed tab ${tabId}.` }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to close tab: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "open-browser-tab",
    "Opens a new browser tab with the specified URL.",
    {
      url: z.string().url().describe("The URL to open in a new tab."),
    },
    async ({ url }) => {
      try {
        const result = await sendTabActionMessage({ type: "OPEN_TAB", url });
        if (!result.success) {
          return {
            content: [
              { type: "text", text: `Error: ${result.error ?? "Unknown"}` },
            ],
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `Opened new tab${result.tabId ? ` (ID: ${result.tabId})` : ""} with URL: ${url}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to open tab: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "move-browser-tab",
    "Moves a browser tab to a new position (index) in the tab bar. " +
      "Use list-browser-tabs to discover tab IDs and current order.",
    {
      tabId: z.number().describe("The tab ID to move."),
      index: z
        .number()
        .describe(
          "The zero-based position to move the tab to. Use -1 to move to the end."
        ),
    },
    async ({ tabId, index }) => {
      try {
        const result = await sendTabActionMessage({
          type: "MOVE_TAB",
          tabId,
          index,
        });
        if (!result.success) {
          return {
            content: [
              { type: "text", text: `Error: ${result.error ?? "Unknown"}` },
            ],
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `Moved tab ${tabId} to position ${index}.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to move tab: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}

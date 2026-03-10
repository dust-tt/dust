import type { CaptureService } from "@extension/shared/services/capture";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Registers the get-current-browser-page tool with the MCP server.
 * Extracts the text content of a browser tab.
 */
export function registerGetCurrentPageTool(
  server: McpServer,
  captureService: CaptureService | null
): void {
  server.tool(
    "get-current-browser-page",
    "Extracts the title, URL, and text content of a browser tab. " +
      "Use this to read and understand what the user is viewing. " +
      "For non-text pages (PDFs, images, etc.), prefer get-current-browser-page-screenshot. " +
      "Use list-browser-tabs to discover tab IDs.",
    {
      tabId: z
        .number()
        .optional()
        .describe(
          "The tab ID to read. If omitted, reads the active tab. Use list-browser-tabs to get tab IDs."
        ),
    },
    async ({ tabId }) => {
      if (!captureService) {
        return {
          content: [{ type: "text", text: "Capture service not available." }],
        };
      }

      try {
        const result = await captureService.handleOperation(
          "capture-page-content",
          { includeContent: true, includeCapture: false, tabId }
        );

        if (result.isErr()) {
          return {
            content: [{ type: "text", text: `Error: ${result.error.message}` }],
          };
        }

        const { title, url, content } = result.value;
        const parts = [`Title: ${title}`, `URL: ${url}`];
        if (content) {
          parts.push(`Content:\n${content}`);
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

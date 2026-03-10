import type { CaptureService } from "@extension/shared/services/capture";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Registers the get-current-browser-page-view tool with the MCP server.
 * Captures a screenshot or attaches the file content of a browser tab.
 */
export function registerGetPageViewTool(
  server: McpServer,
  captureService: CaptureService | null
): void {
  server.tool(
    "get-current-browser-page-view",
    "Captures or attaches the content of a browser tab. " +
      "For PDF and image pages, attaches the actual file so you can read or analyze its full content. " +
      "If the file cannot be attached (too large or access denied), falls back to a screenshot. " +
      "Also use this for HTML pages when you need to visually inspect the layout (Drive canvas, etc.)." +
      "Use list-browser-tabs to discover tab IDs.",
    {},
    async ({ tabId }) => {
      if (!captureService) {
        return {
          content: [{ type: "text", text: "Capture service not available." }],
        };
      }

      try {
        const result = await captureService.handleOperation(
          "capture-page-content",
          { includeContent: false, includeCapture: true, tabId }
        );

        if (result.isErr()) {
          return {
            content: [{ type: "text", text: `Error: ${result.error.message}` }],
          };
        }

        const { captures, fileData } = result.value;

        if (fileData) {
          const { base64, mimeType, url } = fileData;
          if (mimeType.startsWith("image/")) {
            return {
              content: [{ type: "image" as const, data: base64, mimeType }],
            };
          }
          return {
            content: [
              {
                type: "resource" as const,
                resource: { uri: url, mimeType, blob: base64 },
              },
            ],
          };
        }

        if (!captures || captures.length === 0) {
          return {
            content: [{ type: "text", text: "No screenshot captured." }],
          };
        }

        return {
          content: captures.map((dataUrl) => {
            const [header, data] = dataUrl.split(",");
            const mimeType = header.replace("data:", "").replace(";base64", "");
            return { type: "image" as const, data, mimeType };
          }),
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to capture screenshot: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}

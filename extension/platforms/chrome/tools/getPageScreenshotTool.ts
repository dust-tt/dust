import type { CaptureService } from "@extension/shared/services/capture";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Registers the get-current-browser-page-screenshot tool with the MCP server.
 * Captures a screenshot of the active browser tab.
 */
export function registerGetPageScreenshotTool(
  server: McpServer,
  captureService: CaptureService | null
): void {
  server.tool(
    "get-current-browser-page-screenshot",
    "Captures a screenshot of the active browser tab. " +
      "Use this when you need to visually inspect the page layout, " +
      "or when the page contains non-text content (PDFs, images, Drive canvas, etc.).",
    {},
    async () => {
      if (!captureService) {
        return {
          content: [{ type: "text", text: "Capture service not available." }],
        };
      }

      try {
        const result = await captureService.handleOperation(
          "capture-page-content",
          { includeContent: false, includeCapture: true }
        );

        if (result.isErr()) {
          return {
            content: [{ type: "text", text: `Error: ${result.error.message}` }],
          };
        }

        const { captures } = result.value;
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

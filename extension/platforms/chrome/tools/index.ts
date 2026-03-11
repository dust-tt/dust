import { registerGetCurrentPageTool } from "@extension/platforms/chrome/tools/getCurrentPageTool";
import { registerGetPageScreenshotTool } from "@extension/platforms/chrome/tools/getPageScreenshotTool";
import { registerListTabsTool } from "@extension/platforms/chrome/tools/listTabsTool";
import { registerTabActionTools } from "@extension/platforms/chrome/tools/tabActionTools";
import type { CaptureService } from "@extension/shared/services/capture";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Registers all Chrome MCP tools with the server
 * @param server The MCP server to register tools with
 * @param captureService The capture service for retrieving page content
 */
export function registerAllTools(
  server: McpServer,
  captureService: CaptureService | null
): void {
  registerListTabsTool(server);
  registerTabActionTools(server);
  registerGetCurrentPageTool(server, captureService);
  registerGetPageScreenshotTool(server, captureService);
}

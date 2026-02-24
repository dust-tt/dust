import type { BrowserMessagingService } from "@extension/shared/services/platform";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Registers all Chrome MCP tools with the server
 * @param server The MCP server to register tools with
 * @param messaging The browser messaging service for communicating with the background script
 */
export function registerAllTools(
  server: McpServer,
  messaging: BrowserMessagingService | null
): void {
  // Register Chrome-specific tools here.
}

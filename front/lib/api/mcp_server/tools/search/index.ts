import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSearchTool } from "./search";

export function registerSearchTools(server: McpServer) {
  registerSearchTool(server);
}

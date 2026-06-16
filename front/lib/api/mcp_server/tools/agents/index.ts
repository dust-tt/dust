import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAgentsListTool } from "./list";

export function registerAgentsTools(server: McpServer) {
  registerAgentsListTool(server);
}

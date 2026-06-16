import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPodsGetTool } from "./get";
import { registerPodsGetTasksTool } from "./get_tasks";
import { registerPodsListTool } from "./list";

export function registerPodsTools(server: McpServer) {
  registerPodsListTool(server);
  registerPodsGetTool(server);
  registerPodsGetTasksTool(server);
}

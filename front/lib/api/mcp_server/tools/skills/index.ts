import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSkillsCreateTool } from "./create";

export function registerSkillsTools(server: McpServer) {
  registerSkillsCreateTool(server);
}

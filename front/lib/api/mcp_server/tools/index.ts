import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAgentsTools } from "./agents";
import { registerConversationsTools } from "./conversations";
import { registerFilesTools } from "./files";
import { registerIdentityTool } from "./identity";
import { registerPodsTools } from "./pods";
import { registerSearchTools } from "./search";

export function registerDustMcpTools(server: McpServer) {
  registerIdentityTool(server);
  registerAgentsTools(server);
  registerConversationsTools(server);
  registerPodsTools(server);
  registerSearchTools(server);
  registerFilesTools(server);
}

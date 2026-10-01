import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerConversationsCreateTool } from "./create";
import { registerConversationsCreateMessageTool } from "./create_message";
import { registerConversationsGetMessagesTool } from "./get_messages";
import { registerConversationsListTool } from "./list";
import { registerConversationsMarkReadTool } from "./mark_read";

export function registerConversationsTools(server: McpServer) {
  registerConversationsListTool(server);
  registerConversationsCreateTool(server);
  registerConversationsCreateMessageTool(server);
  registerConversationsGetMessagesTool(server);
  registerConversationsMarkReadTool(server);
}

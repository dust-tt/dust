import { registerEmailDraftTool } from "@app/platforms/front/tools/emailDraftTool";
import { registerGetCurrentConversationTool } from "@app/platforms/front/tools/getCurrentConversationTool";
import { registerGetPastConversationsTool } from "@app/platforms/front/tools/getPastConversationsTool";
import { registerNewConversationDraftTool } from "@app/platforms/front/tools/newConversationDraftTool";
import { registerUpdateDraftTool } from "@app/platforms/front/tools/updateDraftTool";
import type { WebViewContext } from "@frontapp/plugin-sdk/dist/webViewSdkTypes";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Registers all tools with the MCP server
 * @param server The MCP server to register tools with
 * @param frontContext The Front context for sending comments
 */
export function registerAllTools(
  server: McpServer,
  frontContext: WebViewContext | null
): void {
  // Register email draft tool (for replying to existing conversations).
  registerEmailDraftTool(server, frontContext);

  // Register new conversation draft tool.
  registerNewConversationDraftTool(server, frontContext);

  // Register update draft tool.
  registerUpdateDraftTool(server, frontContext);

  // Register get current conversation id tool.
  registerGetCurrentConversationTool(server, frontContext);

  // Register get past conversations tool.
  registerGetPastConversationsTool(server, frontContext);
}

import { MCPError } from "@app/lib/actions/mcp_errors";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  CLARI_COPILOT_SERVER,
  CLARI_COPILOT_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/clari_copilot/metadata";
import type { Authenticator } from "@app/lib/auth";
import { Err } from "@app/types/shared/result";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const TOOLS = buildTools(CLARI_COPILOT_TOOLS_METADATA, {
  search_calls: async () =>
    new Err(new MCPError("Not implemented", { tracked: false })),
  get_call_details: async () =>
    new Err(new MCPError("Not implemented", { tracked: false })),
});

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("clari_copilot");

  for (const tool of TOOLS) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: "clari_copilot",
    });
  }

  return server;
}

export { CLARI_COPILOT_SERVER };

export default createServer;

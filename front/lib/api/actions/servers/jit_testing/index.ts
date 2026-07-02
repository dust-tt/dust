import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { ToolContextType } from "@app/lib/actions/types";
import { JIT_TESTING_TOOL_NAME } from "@app/lib/api/actions/servers/jit_testing/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/jit_testing/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  toolContext?: ToolContextType
): McpServer {
  const server = makeInternalMCPServer(JIT_TESTING_TOOL_NAME);

  for (const tool of TOOLS) {
    registerTool(auth, toolContext, server, tool, {
      monitoringName: JIT_TESTING_TOOL_NAME,
    });
  }

  return server;
}

export default createServer;

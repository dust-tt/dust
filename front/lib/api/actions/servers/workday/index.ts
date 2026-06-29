import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { TOOLS } from "@app/lib/api/actions/servers/workday/tools";
import type { Authenticator } from "@app/lib/auth";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
) {
  const server = makeInternalMCPServer("workday");

  for (const tool of TOOLS) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: "workday",
    });
  }

  return server;
}

export default createServer;

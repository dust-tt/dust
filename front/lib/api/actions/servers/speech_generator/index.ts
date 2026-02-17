import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { registerTool } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { SPEECH_GENERATOR_SERVER_NAME } from "@app/lib/api/actions/servers/speech_generator/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/speech_generator/tools";
import type { Authenticator } from "@app/lib/auth";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(SPEECH_GENERATOR_SERVER_NAME);

  for (const tool of TOOLS) {
    registerTool(auth, agentLoopContext, server, tool, {
      monitoringName: SPEECH_GENERATOR_SERVER_NAME,
    });
  }

  return server;
}

export default createServer;

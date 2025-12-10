import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { DEFAULT_ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";

import { SKILL_MANAGEMENT_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(SKILL_MANAGEMENT_SERVER_NAME);

  server.tool(
    DEFAULT_ENABLE_SKILL_TOOL_NAME,
    "List all files attached to the conversation.",
    {},
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: DEFAULT_ENABLE_SKILL_TOOL_NAME,
        agentLoopContext,
      },
      async () => {
        // Implementation will be added later.
        throw new Error("Not implemented");
      }
    )
  );

  return server;
}

export default createServer;

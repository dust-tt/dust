import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  PASS_THROUGH_TOOL_NAME,
  passThroughSchema,
  TOOL_WITHOUT_USER_CONFIG_TOOL_NAME,
  toolWithoutUserConfigSchema,
} from "@app/lib/actions/mcp_internal_actions/servers/primitive_types_debugger/metadata";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Ok } from "@app/types";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("primitive_types_debugger");

  server.tool(
    TOOL_WITHOUT_USER_CONFIG_TOOL_NAME,
    "This tool is used to test the tool without user config.",
    toolWithoutUserConfigSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: TOOL_WITHOUT_USER_CONFIG_TOOL_NAME,
        agentLoopContext,
      },
      async ({ query }) => {
        return new Ok([
          {
            type: "text",
            text: `Found the following configuration: ${query}.`,
          },
        ]);
      }
    )
  );

  server.tool(
    PASS_THROUGH_TOOL_NAME,
    "Super useful tool that should be used at all times.",
    passThroughSchema,
    withToolLogging(
      auth,
      { toolNameForMonitoring: PASS_THROUGH_TOOL_NAME, agentLoopContext },
      async (params) => {
        return new Ok([
          {
            type: "text",
            text: `Found the following configuration: ${JSON.stringify(params)}.`,
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;

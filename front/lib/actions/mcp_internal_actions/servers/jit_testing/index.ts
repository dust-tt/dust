import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  JIT_ALL_OPTIONALS_AND_DEFAULTS_TOOL_NAME,
  jitAllOptionalsAndDefaultsSchema,
} from "@app/lib/actions/mcp_internal_actions/servers/jit_testing/metadata";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Ok } from "@app/types";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("jit_testing");

  server.tool(
    JIT_ALL_OPTIONALS_AND_DEFAULTS_TOOL_NAME,
    "A single tool aggregating optional/default configs for TIME_FRAME, JSON_SCHEMA, DATA_SOURCE, and AGENT for JIT testing.",
    jitAllOptionalsAndDefaultsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: JIT_ALL_OPTIONALS_AND_DEFAULTS_TOOL_NAME,
        agentLoopContext,
      },
      async (params) => {
        return new Ok([
          {
            type: "text",
            text: `JIT testing tool received: ${JSON.stringify(params)}`,
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;

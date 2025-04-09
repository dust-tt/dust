import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  CHILD_AGENT_CONFIGURATION_URI_PATTERN,
  ConfigurableToolInputSchemas,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";
import type { MCPToolResult } from "@app/lib/actions/mcp_actions";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "ask_agent",
  version: "1.0.0",
  description: "Query another agent.",
  icon: "robot",
  authorization: null,
};

function parseAgentConfigurationUri(uri: string): Result<string, Error> {
  const match = uri.match(CHILD_AGENT_CONFIGURATION_URI_PATTERN);
  if (!match) {
    return new Err(
      new Error(`Invalid URI for a child agent configuration: ${uri}`)
    );
  }
  // Safe to do this because the inputs are already checked against the zod schema here.
  return new Ok(match[2]);
}

function createServer(
  auth: Authenticator,
  runAgent?: (
    auth: Authenticator,
    { agentId, query }: { agentId: string; query: string }
  ) => Promise<MCPToolResult>
): McpServer {
  const server = new McpServer(serverInfo);

  server.tool(
    "ask_agent",
    // TODO(mcp): we most likely want to configure this description based on the agent configuration.
    "Ask a query to an agent.",
    {
      query: z.string().describe("The query to ask to the child agent."),
      childAgent:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.CONFIGURATION.CHILD_AGENT
        ],
    },
    async ({ query, childAgent: { uri } }) => {
      if (!runAgent) {
        return makeMCPToolTextError(
          "Unreachable: calling ask_agent tool without a runAgent callback."
        );
      }

      // Parse the child agent ID from the URI
      const childAgentIdRes = parseAgentConfigurationUri(uri);
      if (childAgentIdRes.isErr()) {
        return makeMCPToolTextError(childAgentIdRes.error.message);
      }

      return runAgent(auth, { agentId: childAgentIdRes.value, query });
    }
  );

  return server;
}

export default createServer;

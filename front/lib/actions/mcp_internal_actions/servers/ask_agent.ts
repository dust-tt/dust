import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  CHILD_AGENT_CONFIGURATION_URI_PATTERN,
  ConfigurableToolInputSchemas,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "ask_agent",
  version: "1.0.0",
  description: "Demo server showing a basic interaction with a child agent.",
  visual: "robot",
  authorization: null,
};

function parseAgentConfigurationUri(uri: string): Result<string | null, Error> {
  const match = uri.match(CHILD_AGENT_CONFIGURATION_URI_PATTERN);
  if (!match) {
    return new Err(
      new Error(`Invalid URI for a child agent configuration: ${uri}`)
    );
  }
  // Safe to do this because the inputs are already checked against the zod schema here.
  return new Ok(match[2]);
}

function createServer(): McpServer {
  const server = new McpServer(serverInfo);

  server.tool(
    "pass_through",
    "Super useful tool that should be used at all time.",
    {
      query: z.string(),
      childAgent:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.CONFIGURATION.CHILD_AGENT
        ],
    },
    async ({ childAgent: { uri } }) => {
      const childAgentIdRes = parseAgentConfigurationUri(uri);
      if (childAgentIdRes.isErr()) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: childAgentIdRes.error.message,
            },
          ],
        };
      }
      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `Found the child agent configuration ${childAgentIdRes.value}.`,
          },
        ],
      };
    }
  );

  return server;
}

export default createServer;

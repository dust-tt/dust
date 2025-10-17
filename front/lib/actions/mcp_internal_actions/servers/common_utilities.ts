import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Ok } from "@app/types";

const RANDOM_INTEGER_DEFAULT_MAX = 1_000_000;

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("common_utilities");

  server.tool(
    "generate_random_number",
    "Generate a random positive number between 1 and the provided maximum (inclusive).",
    {
      max: z
        .number()
        .int()
        .positive()
        .describe(
          `Upper bound for the generated integer. Defaults to ${RANDOM_INTEGER_DEFAULT_MAX}.`
        )
        .optional(),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "generate_random_number",
        agentLoopContext,
      },
      async ({ max }) => {
        const upperBound = max ?? RANDOM_INTEGER_DEFAULT_MAX;
        const value = Math.floor(Math.random() * upperBound) + 1;

        return new Ok([
          {
            type: "text",
            text: `Random number (1-${upperBound}): ${value}`,
          },
        ]);
      }
    )
  );

  server.tool(
    "generate_random_float",
    "Generate a random floating point number between 0 (inclusive) and 1 (exclusive).",
    {},
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "generate_random_float",
        agentLoopContext,
      },
      async () => {
        const value = Math.random();

        return new Ok([
          {
            type: "text",
            text: `Random float: ${value}`,
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;

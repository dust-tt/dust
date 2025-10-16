import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { getGraphClient } from "@app/lib/actions/mcp_internal_actions/servers/microsoft/utils";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("microsoft_teams");

  server.tool(
    "search_messages",
    "Search for messages in Microsoft Teams chats and channels. Returns the results in relevance order.",
    {
      query: z
        .string()
        .describe("Search query to find relevant messages in Teams."),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "microsoft_teams", agentLoopContext },
      async ({ query }, { authInfo }) => {
        const client = await getGraphClient(authInfo);
        if (!client) {
          return new Err(
            new MCPError("Failed to authenticate with Microsoft Graph")
          );
        }

        try {
          const endpoint = `/search/query`;

          const requestBody = {
            requests: [
              {
                entityTypes: ["chatMessage"],
                query: {
                  queryString: query,
                },
                enableTopResults: true,
              },
            ],
          };

          const response = await client.api(endpoint).post(requestBody);

          return new Ok([
            {
              type: "text" as const,
              text: JSON.stringify(response.value[0].hitsContainers, null, 2),
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to search Teams messages"
            )
          );
        }
      }
    )
  );

  return server;
}

export default createServer;

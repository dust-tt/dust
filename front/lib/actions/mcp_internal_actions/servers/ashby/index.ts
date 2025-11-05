import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  AshbyClient,
  getAshbyApiKey,
} from "@app/lib/actions/mcp_internal_actions/servers/ashby/client";
import { renderCandidateList } from "@app/lib/actions/mcp_internal_actions/servers/ashby/rendering";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";

const DEFAULT_SEARCH_LIMIT = 20;

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("ashby");

  server.tool(
    "search_candidates",
    "Search for candidates in Ashby ATS by name and/or email. " +
      `Returns up to ${DEFAULT_SEARCH_LIMIT} matching candidates by default.`,
    {
      email: z
        .string()
        .optional()
        .describe("Email address to search for (partial matches supported)."),
      name: z
        .string()
        .optional()
        .describe("Name to search for (partial matches supported)."),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "ashby_search_candidates", agentLoopContext },
      async ({ email, name }) => {
        if (!email && !name) {
          return new Err(
            new MCPError(
              "At least one search parameter (email or name) must be provided."
            )
          );
        }

        const apiKeyResult = await getAshbyApiKey(auth, agentLoopContext);
        if (apiKeyResult.isErr()) {
          return new Err(apiKeyResult.error);
        }

        const client = new AshbyClient(apiKeyResult.value);
        const result = await client.searchCandidates({ email, name });

        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to search candidates: ${result.error.message}`)
          );
        }

        const response = result.value;

        if (response.results.length === 0) {
          return new Ok([
            {
              type: "text" as const,
              text: "No candidates found matching the search criteria.",
            },
          ]);
        }

        const candidatesText = renderCandidateList(response.results);
        const searchParams = [
          email ? `email: ${email}` : null,
          name ? `name: ${name}` : null,
        ]
          .filter(Boolean)
          .join(", ");

        const resultText = `Found ${response.results.length} candidate(s) matching search (${searchParams}):\n\n${candidatesText}`;

        if (response.results.length === DEFAULT_SEARCH_LIMIT) {
          return new Ok([
            {
              type: "text" as const,
              text:
                resultText +
                `\n\nNote: Results are limited to ${DEFAULT_SEARCH_LIMIT} candidates. ` +
                "Consider refining your search if you need more specific results.",
            },
          ]);
        }

        return new Ok([
          {
            type: "text" as const,
            text: resultText,
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;

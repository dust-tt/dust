import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getAuthenticatorFromMcpContext } from "@app/lib/api/mcp_server/context";
import { filterAndSortAgents } from "@app/lib/utils";
import { compareAgentsForSort } from "@app/types/assistant/assistant";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mcpJsonResponse } from "../response";

const LIST_AGENTS_PAGE_SIZE = 25;

const inputSchema = {
  name: z
    .string()
    .optional()
    .describe("Optional filter on agent name (fuzzy match)."),
  lastValue: z
    .string()
    .optional()
    .describe(
      "Cursor from a previous response's lastValue field (agent id) for the next page."
    ),
};

export function registerAgentsListTool(server: McpServer) {
  server.registerTool(
    "list_agents",
    {
      description:
        "List agents accessible to the authenticated user in the current workspace (25 per page). Supports cursor pagination via lastValue. Optionally filter by agent name.",
      inputSchema,
    },
    async ({ name, lastValue }) => {
      const auth = getAuthenticatorFromMcpContext();

      const agents = await getAgentConfigurationsForView({
        auth,
        agentsGetView: "list",
        variant: "extra_light",
        omitInstructions: true,
      });

      const accessibleAgents = agents.filter((agent) => agent.canRead);

      const sortedAgents = name
        ? filterAndSortAgents(accessibleAgents, name)
        : [...accessibleAgents].sort(compareAgentsForSort);

      let startIndex = 0;
      if (lastValue) {
        const cursorIndex = sortedAgents.findIndex(
          (agent) => agent.sId === lastValue
        );
        startIndex = cursorIndex === -1 ? sortedAgents.length : cursorIndex + 1;
      }

      const pageAgents = sortedAgents.slice(
        startIndex,
        startIndex + LIST_AGENTS_PAGE_SIZE
      );
      const hasMore = startIndex + LIST_AGENTS_PAGE_SIZE < sortedAgents.length;
      const nextLastValue =
        hasMore && pageAgents.length > 0
          ? pageAgents[pageAgents.length - 1].sId
          : null;

      return mcpJsonResponse({
        agents: pageAgents.map((agent) => ({
          id: agent.sId,
          name: agent.name,
          description: agent.description,
          pictureUrl: agent.pictureUrl,
          scope: agent.scope,
        })),
        hasMore,
        lastValue: nextLastValue,
      });
    }
  );
}

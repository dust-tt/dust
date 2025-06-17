import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getTicket } from "@app/lib/actions/mcp_internal_actions/servers/jira/jira_api_helper";
import {
  ERROR_MESSAGES,
  withAuth,
} from "@app/lib/actions/mcp_internal_actions/servers/jira/jira_utils";
import {
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "jira",
  version: "1.0.0",
  description:
    "Provides access to JIRA tickets, allowing you to retrieve ticket information using the JIRA REST API.",
  authorization: {
    provider: "jira" as const,
    supported_use_cases: ["platform_actions"] as const,
  },
  icon: "JiraLogo",
  documentationUrl:
    "https://developer.atlassian.com/server/jira/platform/rest/v10007/intro/",
};

const createServer = (): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "get_tickets",
    "Retrieves a single JIRA ticket by its key (e.g., 'PROJ-123').",
    {
      ticketKey: z.string().describe("The JIRA ticket key (e.g., 'PROJ-123')"),
    },
    async ({ ticketKey }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const ticket = await getTicket(baseUrl, accessToken, ticketKey);
          if (!ticket) {
            return makeMCPToolTextError(ERROR_MESSAGES.TICKET_NOT_FOUND);
          }
          return makeMCPToolJSONSuccess({
            message: "Ticket retrieved successfully",
            result: ticket,
          });
        },
        authInfo,
        params: { ticketKey },
      });
    }
  );

  return server;
};

export default createServer;
export { serverInfo };

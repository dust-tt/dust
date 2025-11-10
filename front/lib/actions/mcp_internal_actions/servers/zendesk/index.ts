import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { ZendeskClient } from "@app/lib/actions/mcp_internal_actions/servers/zendesk/client";
import { renderTicket } from "@app/lib/actions/mcp_internal_actions/servers/zendesk/rendering";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Err, isString, Ok } from "@app/types";

const ZENDESK_TOOL_NAME = "zendesk";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("zendesk");

  server.tool(
    "get_ticket",
    "Retrieve a Zendesk ticket by its ID. Returns the ticket details including subject, description, status, priority, assignee, and other metadata.",
    {
      ticketId: z
        .number()
        .int()
        .positive()
        .describe("The ID of the Zendesk ticket to retrieve."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: ZENDESK_TOOL_NAME,
        agentLoopContext,
      },
      async ({ ticketId }, { authInfo }) => {
        const accessToken = authInfo?.token;
        if (!accessToken) {
          return new Err(
            new MCPError(
              "No access token found. Please connect your Zendesk account."
            )
          );
        }

        const subdomain = authInfo?.extra?.zendesk_subdomain;
        if (!isString(subdomain)) {
          return new Err(
            new MCPError(
              "Zendesk subdomain not found in connection metadata. Please reconnect your Zendesk account."
            )
          );
        }

        const client = new ZendeskClient(subdomain, accessToken);
        const result = await client.getTicket(ticketId);

        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to retrieve ticket: ${result.error.message}`)
          );
        }

        const ticket = result.value;
        const ticketText = renderTicket(ticket);

        return new Ok([
          {
            type: "text" as const,
            text: ticketText,
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;

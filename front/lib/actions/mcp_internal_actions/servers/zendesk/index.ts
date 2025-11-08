import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ZendeskClient } from "@app/lib/actions/mcp_internal_actions/servers/zendesk/client";
import { renderTicket } from "@app/lib/actions/mcp_internal_actions/servers/zendesk/rendering";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";

const ERROR_MESSAGES = {
  NO_ACCESS_TOKEN: "No access token found. Please connect your Zendesk account.",
  NO_SUBDOMAIN:
    "Zendesk subdomain not found in connection metadata. Please reconnect your Zendesk account.",
} as const;

function createServer(): McpServer {
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
    async ({ ticketId }, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return {
          isError: true,
          content: [{ type: "text", text: ERROR_MESSAGES.NO_ACCESS_TOKEN }],
        };
      }

      const subdomain = authInfo?.extra?.zendesk_subdomain as
        | string
        | undefined;
      if (!subdomain) {
        return {
          isError: true,
          content: [{ type: "text", text: ERROR_MESSAGES.NO_SUBDOMAIN }],
        };
      }

      const client = new ZendeskClient(subdomain, accessToken);
      const result = await client.getTicket(ticketId);

      if (result.isErr()) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to retrieve ticket: ${result.error.message}`,
            },
          ],
        };
      }

      const ticket = result.value;
      const ticketText = renderTicket(ticket);

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: ticketText,
          },
        ],
      };
    }
  );

  return server;
}

export default createServer;

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
    "Retrieve a Zendesk ticket by its ID. Returns the ticket details including subject, " +
      "description, status, priority, assignee, and other metadata.",
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

  server.tool(
    "search_tickets",
    "Search for Zendesk tickets using query syntax. Returns a list of matching tickets with their " +
      "details. You can search by status, priority, assignee, tags, and other fields. Query " +
      "examples: 'status:open', 'priority:high', 'status:open priority:urgent', 'assignee:me', " +
      "'tags:bug'.",
    {
      query: z
        .string()
        .describe(
          "The search query using Zendesk query syntax. Examples: 'status:open', 'priority:high " +
            "status:pending', 'assignee:123', 'tags:bug tags:critical'." +
            "Do not include 'type:ticket'  as it is automatically added."
        ),
      sortBy: z
        .enum(["updated_at", "created_at", "priority", "status", "ticket_type"])
        .optional()
        .describe(
          "Field to sort results by. Defaults to relevance if not specified."
        ),
      sortOrder: z
        .enum(["asc", "desc"])
        .optional()
        .describe("Sort order. Defaults to 'desc' if not specified."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: ZENDESK_TOOL_NAME,
        agentLoopContext,
      },
      async ({ query, sortBy, sortOrder }, { authInfo }) => {
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
        const result = await client.searchTickets(query, sortBy, sortOrder);

        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to search tickets: ${result.error.message}`)
          );
        }

        const { results, count, next_page } = result.value;

        if (results.length === 0) {
          return new Ok([
            {
              type: "text" as const,
              text: "No tickets found matching the search criteria.",
            },
          ]);
        }

        const ticketsText = results
          .map((ticket) => {
            return ["---", renderTicket(ticket)].join("\n");
          })
          .join("\n\n");

        const paginationInfo = next_page
          ? "\n\nNote: There are more tickets available."
          : "";

        return new Ok([
          {
            type: "text" as const,
            text: `Found ${count} ticket(s):\n\n${ticketsText}${paginationInfo}`,
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;

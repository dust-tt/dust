import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getUniqueCustomFieldIds,
  getZendeskClient,
} from "@app/lib/actions/mcp_internal_actions/servers/zendesk/client";
import {
  renderTicket,
  renderTicketComments,
  renderTicketMetrics,
} from "@app/lib/actions/mcp_internal_actions/servers/zendesk/rendering";
import type { ZendeskUser } from "@app/lib/actions/mcp_internal_actions/servers/zendesk/types";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { Err, Ok } from "@app/types";

const ZENDESK_TOOL_NAME = "zendesk";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("zendesk");

  server.tool(
    "get_ticket",
    "Retrieve a Zendesk ticket by its ID. Returns the ticket details including subject, " +
      "description, status, priority, assignee, and other metadata. Optionally include ticket metrics " +
      "such as resolution times, wait times, and reply counts. Optionally include the full conversation " +
      "with all comments.",
    {
      ticketId: z
        .number()
        .int()
        .positive()
        .describe("The ID of the Zendesk ticket to retrieve."),
      includeMetrics: z
        .boolean()
        .optional()
        .describe(
          "Whether to include ticket metrics (resolution times, wait times, reopens, replies, etc.). Defaults to false."
        ),
      includeConversation: z
        .boolean()
        .optional()
        .describe(
          "Whether to include the full conversation (all comments) for the ticket. Defaults to false."
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: ZENDESK_TOOL_NAME,
        agentLoopContext,
      },
      async (
        { ticketId, includeMetrics, includeConversation },
        { authInfo }
      ) => {
        const clientResult = getZendeskClient(authInfo);
        if (clientResult.isErr()) {
          return clientResult;
        }
        const client = clientResult.value;

        const ticketResult = await client.getTicket(ticketId);

        if (ticketResult.isErr()) {
          return new Err(
            new MCPError(
              `Failed to retrieve ticket: ${ticketResult.error.message}`
            )
          );
        }

        const ticket = ticketResult.value;

        const fieldIds = getUniqueCustomFieldIds(ticket);
        const ticketFieldsResult = await client.getTicketFieldsByIds(fieldIds);

        let ticketText = renderTicket(ticket, ticketFieldsResult);

        if (includeMetrics) {
          const metricsResult = await client.getTicketMetrics(ticketId);

          if (metricsResult.isErr()) {
            return new Err(
              new MCPError(
                `Failed to retrieve ticket metrics: ${metricsResult.error.message}`
              )
            );
          }

          ticketText += "\n" + renderTicketMetrics(metricsResult.value);
        }

        if (includeConversation) {
          const commentsResult = await client.getTicketComments(ticketId);

          if (commentsResult.isErr()) {
            return new Err(
              new MCPError(
                `Failed to retrieve ticket conversation: ${commentsResult.error.message}`
              )
            );
          }

          const comments = commentsResult.value;
          const authorIds = Array.from(
            new Set(comments.map((comment) => comment.author_id))
          );

          let users: ZendeskUser[] = [];
          if (authorIds.length > 0) {
            const usersResult = await client.getUsersByIds(authorIds);
            if (usersResult.isErr()) {
              logger.warn(
                {
                  error: usersResult.error.message,
                },
                "[Zendesk] Failed to retrieve user information for comments"
              );
            } else {
              users = usersResult.value;
            }
          }

          ticketText += renderTicketComments(comments, users);
        }

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
          "The search query using Zendesk query syntax. Examples: 'status:open', 'priority:high' " +
            "status:pending', 'assignee:123', 'tags:bug tags:critical'." +
            "Do not include 'type:ticket' as it is automatically added."
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
        const clientResult = getZendeskClient(authInfo);
        if (clientResult.isErr()) {
          return clientResult;
        }
        const client = clientResult.value;

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

        const fieldIds = getUniqueCustomFieldIds(results);
        const ticketFieldsResult = await client.getTicketFieldsByIds(fieldIds);

        const ticketsText = results
          .map((ticket) => {
            return ["---", renderTicket(ticket, ticketFieldsResult)].join("\n");
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

  server.tool(
    "draft_reply",
    "Draft a reply to a Zendesk ticket. Creates a private comment (not visible to the end user) " +
      "that can be edited before being published. This is useful for preparing responses before " +
      "making them public.",
    {
      ticketId: z
        .number()
        .int()
        .positive()
        .describe("The ID of the Zendesk ticket to reply to."),
      body: z.string().describe("The content of the draft reply."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: ZENDESK_TOOL_NAME,
        agentLoopContext,
      },
      async ({ ticketId, body }, { authInfo }) => {
        const clientResult = getZendeskClient(authInfo);
        if (clientResult.isErr()) {
          return clientResult;
        }
        const client = clientResult.value;

        const result = await client.draftReply(ticketId, body);

        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to draft reply: ${result.error.message}`)
          );
        }

        return new Ok([
          {
            type: "text" as const,
            text: `Draft reply successfully added to ticket ${ticketId}. The comment is private and not visible to the end user.`,
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;

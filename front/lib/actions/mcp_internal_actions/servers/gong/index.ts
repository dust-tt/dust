import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getGongClient,
  GongApiError,
} from "@app/lib/actions/mcp_internal_actions/servers/gong/client";
import {
  renderCall,
  renderCalls,
  renderTranscripts,
  renderUsers,
} from "@app/lib/actions/mcp_internal_actions/servers/gong/rendering";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";

function isTrackedError(error: Error): boolean {
  return !(error instanceof GongApiError && error.isInvalidInput);
}

const GONG_TOOL_NAME = "gong";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("gong");

  server.tool(
    "list_users",
    "List all users in the Gong account. Returns user information including names, emails, titles, and activity status.",
    {},
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GONG_TOOL_NAME,
        agentLoopContext,
      },
      async (_, { authInfo }) => {
        const clientResult = getGongClient(authInfo);
        if (clientResult.isErr()) {
          return clientResult;
        }
        const client = clientResult.value;

        const result = await client.listUsers();

        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to list users: ${result.error.message}`, {
              tracked: isTrackedError(result.error),
            })
          );
        }

        const users = result.value;

        if (users.length === 0) {
          return new Ok([
            {
              type: "text" as const,
              text: "No users found in this Gong account.",
            },
          ]);
        }

        return new Ok([
          {
            type: "text" as const,
            text: `Found ${users.length} user(s):\n\n${renderUsers(users)}`,
          },
        ]);
      }
    )
  );

  server.tool(
    "list_calls",
    "List calls recorded in Gong within a date range. Returns call metadata including title, participants, duration, and timing. " +
      "Dates should be in ISO-8601 format (e.g., '2024-01-01T00:00:00Z' or '2024-01-01'). " +
      "If no dates are provided, returns the most recent calls.",
    {
      fromDateTime: z
        .string()
        .optional()
        .describe(
          "Start date/time in ISO-8601 format. Returns calls that started on or after this time."
        ),
      toDateTime: z
        .string()
        .optional()
        .describe(
          "End date/time in ISO-8601 format. Returns calls that started before this time."
        ),
      cursor: z
        .string()
        .optional()
        .describe("Pagination cursor from a previous request."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GONG_TOOL_NAME,
        agentLoopContext,
      },
      async ({ fromDateTime, toDateTime, cursor }, { authInfo }) => {
        const clientResult = getGongClient(authInfo);
        if (clientResult.isErr()) {
          return clientResult;
        }
        const client = clientResult.value;

        const result = await client.listCalls({
          fromDateTime,
          toDateTime,
          cursor,
        });

        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to list calls: ${result.error.message}`, {
              tracked: isTrackedError(result.error),
            })
          );
        }

        const { calls, cursor: nextCursor, totalRecords } = result.value;

        if (calls.length === 0) {
          return new Ok([
            {
              type: "text" as const,
              text: "No calls found for the specified date range.",
            },
          ]);
        }

        let response = `Found ${totalRecords ?? calls.length} call(s):\n\n${renderCalls(calls)}`;

        if (nextCursor) {
          response += `\n\n---\n\n**Note:** More calls available. Use cursor "${nextCursor}" to fetch the next page.`;
        }

        return new Ok([
          {
            type: "text" as const,
            text: response,
          },
        ]);
      }
    )
  );

  server.tool(
    "get_call",
    "Retrieve detailed information about a specific call by its ID. Returns comprehensive call data including " +
      "participants, topics discussed, key points, action items, call summary, and interaction statistics.",
    {
      callId: z
        .string()
        .describe("The unique identifier of the call to retrieve."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GONG_TOOL_NAME,
        agentLoopContext,
      },
      async ({ callId }, { authInfo }) => {
        const clientResult = getGongClient(authInfo);
        if (clientResult.isErr()) {
          return clientResult;
        }
        const client = clientResult.value;

        const result = await client.getCallsExtensive([callId]);

        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to get call: ${result.error.message}`, {
              tracked: isTrackedError(result.error),
            })
          );
        }

        const calls = result.value;

        if (calls.length === 0) {
          return new Err(
            new MCPError(`Call with ID "${callId}" not found.`, {
              tracked: false,
            })
          );
        }

        const call = calls[0];

        return new Ok([
          {
            type: "text" as const,
            text: renderCall(call, true),
          },
        ]);
      }
    )
  );

  server.tool(
    "get_call_transcript",
    "Retrieve the full transcript of a call. Returns the conversation text organized by speaker. " +
      "Useful for understanding the exact dialogue and extracting specific quotes or details from the call.",
    {
      callId: z
        .string()
        .describe(
          "The unique identifier of the call to get the transcript for."
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GONG_TOOL_NAME,
        agentLoopContext,
      },
      async ({ callId }, { authInfo }) => {
        const clientResult = getGongClient(authInfo);
        if (clientResult.isErr()) {
          return clientResult;
        }
        const client = clientResult.value;

        const result = await client.getCallTranscripts([callId]);

        if (result.isErr()) {
          return new Err(
            new MCPError(
              `Failed to get call transcript: ${result.error.message}`,
              {
                tracked: isTrackedError(result.error),
              }
            )
          );
        }

        const transcripts = result.value;

        if (transcripts.length === 0) {
          return new Err(
            new MCPError(
              `No transcript found for call with ID "${callId}". The call may not have been transcribed yet.`,
              { tracked: false }
            )
          );
        }

        return new Ok([
          {
            type: "text" as const,
            text: renderTranscripts(transcripts),
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;

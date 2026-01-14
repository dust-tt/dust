import { DustAPI } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { compile } from "mathjs";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  GENERATE_RANDOM_FLOAT_TOOL_NAME,
  GENERATE_RANDOM_NUMBER_TOOL_NAME,
  generateRandomFloatSchema,
  generateRandomNumberSchema,
  GET_CURRENT_TIME_TOOL_NAME,
  GET_MENTION_MARKDOWN_TOOL_NAME,
  getCurrentTimeSchema,
  getMentionMarkdownSchema,
  MATH_OPERATION_TOOL_NAME,
  mathOperationSchema,
  MAX_WAIT_DURATION_MS,
  RANDOM_INTEGER_DEFAULT_MAX,
  SEARCH_AVAILABLE_USERS_TOOL_NAME,
  searchAvailableUsersSchema,
  WAIT_TOOL_NAME,
  waitSchema,
} from "@app/lib/actions/mcp_internal_actions/servers/common_utilities/metadata";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { serializeMention } from "@app/lib/mentions/format";
import logger from "@app/logger/logger";
import { Err, getHeaderFromUserEmail, normalizeError, Ok } from "@app/types";

async function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<McpServer> {
  const server = makeInternalMCPServer("common_utilities");

  server.tool(
    GENERATE_RANDOM_NUMBER_TOOL_NAME,
    "Generate a random positive number between 1 and the provided maximum (inclusive).",
    generateRandomNumberSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GENERATE_RANDOM_NUMBER_TOOL_NAME,
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
    GENERATE_RANDOM_FLOAT_TOOL_NAME,
    "Generate a random floating point number between 0 (inclusive) and 1 (exclusive).",
    generateRandomFloatSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GENERATE_RANDOM_FLOAT_TOOL_NAME,
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

  server.tool(
    WAIT_TOOL_NAME,
    `Pause execution for the provided number of milliseconds (maximum ${MAX_WAIT_DURATION_MS}).`,
    waitSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: WAIT_TOOL_NAME,
        agentLoopContext,
      },
      async ({ duration_ms }) => {
        await new Promise((resolve) => setTimeout(resolve, duration_ms));

        return new Ok([
          {
            type: "text",
            text: `Waited for ${duration_ms} milliseconds.`,
          },
        ]);
      }
    )
  );

  server.tool(
    GET_CURRENT_TIME_TOOL_NAME,
    "Return the current date and time in multiple convenient formats.",
    getCurrentTimeSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GET_CURRENT_TIME_TOOL_NAME,
        agentLoopContext,
      },
      async ({ include_formats }) => {
        const now = new Date();
        const formats = new Set(
          include_formats ?? ["iso", "utc", "timestamp", "locale"]
        );

        const parts: string[] = [];
        if (formats.has("iso")) {
          parts.push(`ISO: ${now.toISOString()}`);
        }
        if (formats.has("utc")) {
          parts.push(`UTC: ${now.toUTCString()}`);
        }
        if (formats.has("timestamp")) {
          parts.push(`UNIX (ms): ${now.getTime()}`);
        }
        if (formats.has("locale")) {
          parts.push(`Locale: ${now.toLocaleString()}`);
        }

        return new Ok([
          {
            type: "text",
            text: parts.join("\n"),
          },
        ]);
      }
    )
  );

  server.tool(
    MATH_OPERATION_TOOL_NAME,
    "Perform mathematical operations.",
    mathOperationSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: MATH_OPERATION_TOOL_NAME,
        agentLoopContext,
      },
      async ({ expression }) => {
        const evalFunction = compile(expression);
        try {
          const result = evalFunction.evaluate();
          return new Ok([
            {
              type: "text",
              text: result.toString(),
            },
          ]);
        } catch (e) {
          const cause = normalizeError(e);
          return new Err(
            new MCPError(`Error evaluating math expression: ${cause.message}`, {
              cause,
            })
          );
        }
      }
    )
  );

  // Add tools for searching users or agents to mention in a message.
  server.tool(
    SEARCH_AVAILABLE_USERS_TOOL_NAME,
    "Search for users that are available to the conversation.",
    searchAvailableUsersSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: SEARCH_AVAILABLE_USERS_TOOL_NAME,
        agentLoopContext,
      },
      async ({ searchTerm }) => {
        const user = auth.user();
        const prodCredentials = await prodAPICredentialsForOwner(
          auth.getNonNullableWorkspace()
        );
        const api = new DustAPI(
          config.getDustAPIConfig(),
          {
            ...prodCredentials,
            extraHeaders: {
              // We use a system API key to override the user here (not groups and role) so that the
              // sub-agent can access the same spaces as the user but also as the sub-agent may rely
              // on personal actions that have to be operated in the name of the user initiating the
              // interaction.
              ...getHeaderFromUserEmail(user?.email),
            },
          },
          logger
        );

        const r = await api.getMentionsSuggestions({
          query: searchTerm,
          select: ["users"],
          conversationId: agentLoopContext?.runContext?.conversation?.sId,
        });

        if (r.isErr()) {
          return new Err(
            new MCPError(
              `Error getting mentions suggestions: ${r.error.message}`,
              {
                cause: r.error,
              }
            )
          );
        }

        const suggestions = r.value;

        return new Ok([
          {
            type: "text",
            text: JSON.stringify(suggestions),
          },
        ]);
      }
    )
  );

  server.tool(
    GET_MENTION_MARKDOWN_TOOL_NAME,
    "Get the markdown directive to use to mention a user in a message.",
    getMentionMarkdownSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GET_MENTION_MARKDOWN_TOOL_NAME,
        agentLoopContext,
      },
      async ({ mention }) => {
        return new Ok([
          {
            type: "text",
            text: serializeMention({
              id: mention.id,
              label: mention.label,
              type: "user",
            }),
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;

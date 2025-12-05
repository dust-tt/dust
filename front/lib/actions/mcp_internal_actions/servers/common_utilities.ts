import { DustAPI } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { compile } from "mathjs";
import { z } from "zod";

import {
  GET_MENTION_MARKDOWN_TOOL_NAME,
  SEARCH_AVAILABLE_USERS_TOOL_NAME,
} from "@app/lib/actions/constants";
import { MCPError } from "@app/lib/actions/mcp_errors";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags, prodAPICredentialsForOwner } from "@app/lib/auth";
import { serializeMention } from "@app/lib/mentions/format";
import logger from "@app/logger/logger";
import { Err, getHeaderFromUserEmail, normalizeError, Ok } from "@app/types";

const RANDOM_INTEGER_DEFAULT_MAX = 1_000_000;
const MAX_WAIT_DURATION_MS = 3 * 60 * 1_000;

async function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<McpServer> {
  const server = makeInternalMCPServer("common_utilities");

  server.tool(
    "generate_random_number",
    "Generate a random positive number between 1 and the provided maximum (inclusive).",
    {
      max: z
        .number()
        .int()
        .positive()
        .describe(
          `Upper bound for the generated integer. Defaults to ${RANDOM_INTEGER_DEFAULT_MAX}.`
        )
        .optional(),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "generate_random_number",
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
    "generate_random_float",
    "Generate a random floating point number between 0 (inclusive) and 1 (exclusive).",
    {},
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "generate_random_float",
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
    "wait",
    `Pause execution for the provided number of milliseconds (maximum ${MAX_WAIT_DURATION_MS}).`,
    {
      duration_ms: z
        .number()
        .int()
        .positive()
        .max(
          MAX_WAIT_DURATION_MS,
          `Duration must be less than or equal to ${MAX_WAIT_DURATION_MS} milliseconds (3 minutes).`
        )
        .describe("The time to wait in milliseconds, up to 3 minutes."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "wait",
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
    "get_current_time",
    "Return the current date and time in multiple convenient formats.",
    {
      include_formats: z
        .array(
          z
            .enum(["iso", "utc", "timestamp", "locale"])
            .describe("Specify which formats to return. Defaults to all.")
        )
        .max(4)
        .optional(),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "get_current_time",
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
    "math_operation",
    "Perform mathematical operations.",
    {
      expression: z.string().describe("The expression to evaluate. "),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "math_operation",
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

  const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
  if (featureFlags.includes("mentions_v2")) {
    // Add tools for searching users or agents to mention in a message.
    server.tool(
      SEARCH_AVAILABLE_USERS_TOOL_NAME,
      "Search for users that are available to the conversation.",
      {
        searchTerm: z
          .string()
          .describe(
            "A single search term to find users. Returns all the users that contain the search term in their name or description. Use an empty string to return all items."
          ),
      },
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
      {
        mention: z
          .object({
            id: z.string(),
            label: z.string(),
          })
          .describe("A mention to get the markdown directive for."),
      },
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
                name: mention.label,
                sId: mention.id,
                type: "user",
              }),
            },
          ]);
        }
      )
    );
  }

  return server;
}

export default createServer;

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Ok } from "@app/types";

const RANDOM_INTEGER_DEFAULT_MAX = 1_000_000;
const MAX_WAIT_DURATION_MS = 30 * 60 * 1_000;

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
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
          `Duration must be less than or equal to ${MAX_WAIT_DURATION_MS} milliseconds (30 minutes).`
        )
        .describe("The time to wait in milliseconds, up to 30 minutes."),
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

  return server;
}

export default createServer;

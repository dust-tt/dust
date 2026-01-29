import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const GONG_TOOLS_METADATA = createToolsRecord({
  list_calls: {
    description:
      "List calls recorded in Gong within a date range. Returns call metadata including title, participants, duration, and timing. " +
      "Dates should be in ISO-8601 format (e.g., '2024-01-01T00:00:00Z' or '2024-01-01'). " +
      "If no dates are provided, returns the most recent calls.",
    schema: {
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
    stake: "never_ask",
    displayLabels: {
      running: "Listing calls",
      done: "List calls",
    },
  },
  get_call: {
    description:
      "Retrieve detailed information about a specific call by its ID. Returns comprehensive call data including " +
      "participants, topics discussed, key points, action items, call summary, and interaction statistics.",
    schema: {
      callId: z
        .string()
        .describe("The unique identifier of the call to retrieve."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving call",
      done: "Retrieve call",
    },
  },
  get_call_transcript: {
    description:
      "Retrieve the full transcript of a call. Returns the conversation text organized by speaker. " +
      "Useful for understanding the exact dialogue and extracting specific quotes or details from the call.",
    schema: {
      callId: z
        .string()
        .describe(
          "The unique identifier of the call to get the transcript for."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving transcript",
      done: "Retrieve transcript",
    },
  },
});

export const GONG_SERVER = {
  serverInfo: {
    name: "gong",
    version: "1.0.0",
    description: "Access sales calls, transcripts, and conversation analytics.",
    authorization: {
      provider: "gong" as const,
      supported_use_cases: ["personal_actions"] as const,
    },
    icon: "GongLogo",
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(GONG_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(GONG_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;

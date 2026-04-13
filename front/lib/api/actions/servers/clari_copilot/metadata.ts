import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const CLARI_COPILOT_TOOLS_METADATA = createToolsRecord({
  search_calls: {
    description:
      "Search Clari Copilot calls with optional filters. " +
      "Returns calls that have finished processing (transcript available). " +
      "Use get_call_details to fetch the full transcript and AI summary for a specific call.",
    schema: {
      from_date: z
        .string()
        .optional()
        .describe(
          "Filter calls starting after this date (ISO 8601, e.g. '2024-01-15T00:00:00Z')."
        ),
      to_date: z
        .string()
        .optional()
        .describe(
          "Filter calls starting before this date (ISO 8601, e.g. '2024-01-22T00:00:00Z')."
        ),
      account_name: z
        .string()
        .optional()
        .describe(
          "Filter by account/company name (case-insensitive partial match)."
        ),
      user_email: z
        .string()
        .optional()
        .describe("Filter by internal participant email address."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum number of calls to return (default: 25, max: 100)."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching Clari Copilot calls",
      done: "Search Clari Copilot calls",
    },
  },
  get_call_details: {
    description:
      "Retrieve full details for a specific Clari Copilot call, including the AI summary, " +
      "topics discussed, action items, competitor mentions, and turn-by-turn transcript. " +
      "Requires a call ID from search_calls.",
    schema: {
      call_id: z
        .string()
        .describe("The Clari Copilot call ID (obtained from search_calls)."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Fetching Clari Copilot call details",
      done: "Fetch Clari Copilot call details",
    },
  },
});

export const CLARI_COPILOT_SERVER = {
  serverInfo: {
    name: "clari_copilot",
    version: "1.0.0",
    description:
      "Access Clari Copilot call transcripts, AI summaries, and action items.",
    authorization: null,
    icon: "ClariLogo",
    documentationUrl: "https://docs.dust.tt/docs/clari-copilot",
    instructions: null,
  },
  tools: Object.values(CLARI_COPILOT_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(CLARI_COPILOT_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;

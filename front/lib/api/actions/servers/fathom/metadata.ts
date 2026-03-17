import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const FATHOM_TOOLS_METADATA = createToolsRecord({
  list_meetings: {
    description: "List Fathom meetings",
    schema: {
      cursor: z
        .string()
        .optional()
        .describe(
          "Pagination cursor returned as next_cursor in a previous response. Omit to start from the beginning."
        ),
      start_date: z
        .string()
        .optional()
        .describe(
          "Filter meetings created after this ISO 8601 timestamp (e.g. '2024-01-01T00:00:00Z')."
        ),
      end_date: z
        .string()
        .optional()
        .describe(
          "Filter meetings created before this ISO 8601 timestamp (e.g. '2024-12-31T23:59:59Z')."
        ),
      recording_id: z
        .number()
        .int()
        .optional()
        .describe(
          "Filter the current page to a specific recording by its numeric ID. If not found on this page, paginate using next_cursor."
        ),
      calendar_invitees: z
        .array(z.string().email())
        .optional()
        .describe(
          "Filter by email addresses in the calendar invitee list. Returns meetings where any of the given emails appear as attendees. Use the user's email to get only meetings they joined, e.g. ['user@acme.com']."
        ),
      calendar_invitees_domains: z
        .array(z.string())
        .optional()
        .describe(
          "Filter by company domains in the calendar invitee list (exact match). Pass multiple domains to return meetings where any appear, e.g. ['acme.com', 'client.com']."
        ),
      calendar_invitees_domains_type: z
        .enum(["all", "only_internal", "one_or_more_external"])
        .optional()
        .describe(
          "Filter by whether calendar invitees include external email domains. Options: all (default), only_internal, one_or_more_external."
        ),
      recorded_by: z
        .array(z.string().email())
        .optional()
        .describe(
          "Filter by email addresses of users who recorded meetings. Returns meetings recorded by any of the specified users, e.g. ['ceo@acme.com', 'pm@acme.com']."
        ),
      teams: z
        .array(z.string())
        .optional()
        .describe(
          "Filter by team names. Returns meetings that belong to any of the specified teams, e.g. ['Sales', 'Engineering']."
        ),
      include_action_items: z
        .boolean()
        .optional()
        .describe("Include AI-extracted action items for each meeting."),
      include_crm_matches: z
        .boolean()
        .optional()
        .describe(
          "Include CRM matches (contacts, companies, deals) for each meeting. Only returns data from your connected CRM."
        ),
      include_summary: z
        .boolean()
        .optional()
        .describe(
          "Fetch the AI-generated summary for each meeting via the recordings API. Most useful combined with recording_id."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Fathom meetings",
      done: "List Fathom meetings",
    },
  },
  get_transcript: {
    description:
      "Get the full transcript of a Fathom meeting recording. Use recording_id from list_meetings. Large transcripts are saved as conversation files—use conversation_files__cat with offset/limit to read in chunks.",
    schema: {
      recording_id: z
        .number()
        .int()
        .describe(
          "The numeric recording ID from list_meetings (e.g. recordingId field)."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Fathom transcript",
      done: "Get Fathom transcript",
    },
  },
});

export const FATHOM_SERVER = {
  serverInfo: {
    name: "fathom",
    version: "1.0.0",
    description:
      "Access Fathom meeting recordings, transcripts, summaries, and action items.",
    authorization: {
      provider: "fathom",
      supported_use_cases: ["personal_actions", "platform_actions"],
    },
    icon: "FathomLogo",
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(FATHOM_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(FATHOM_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;

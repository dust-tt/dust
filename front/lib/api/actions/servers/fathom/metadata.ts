import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const FATHOM_TOOLS_METADATA = [
  {
    name: "list_meetings",
    description:
      "List and browse your Fathom meeting and call recordings with optional filters for date range, team, attendee domain, recorded-by email, and CRM data. Returns each Fathom recording with its summary, action items, and metadata, along with a machine-readable JSON block of the form {meetings, nextCursor}.",
    schema: {
      cursor: z
        .string()
        .optional()
        .describe(
          "Pagination cursor returned as nextCursor in a previous response. Omit to start from the beginning."
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
      calendar_invitees_domains: z
        .array(z.string())
        .optional()
        .describe(
          "Filter by company domains in the calendar invitee list (exact match), e.g. ['acme.com', 'client.com']."
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
          "Filter by email addresses of users who recorded the meeting, e.g. ['ceo@acme.com', 'pm@acme.com']."
        ),
      teams: z
        .array(z.string())
        .optional()
        .describe("Filter by team names, e.g. ['Sales', 'Engineering']."),
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
          "Fetch the AI-generated summary of each Fathom recording. Most useful combined with recording_id."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Fathom meetings",
      done: "List Fathom meetings",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "get_transcript",
    description:
      "Get the full word-for-word transcript of a Fathom meeting. Use recording_id from list_meetings. Large transcripts are saved as conversation files—use conversation_files__cat with offset/limit to read in chunks.",
    schema: {
      recording_id: z
        .number()
        .int()
        .describe("The numeric ID of the meeting to fetch the transcript for."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Fathom transcript",
      done: "Get Fathom transcript",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
] as const;

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
  },
  tools: FATHOM_TOOLS_METADATA,
} as const satisfies ServerMetadata;

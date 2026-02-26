import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const ZENDESK_TOOL_NAME = "zendesk" as const;

export const TICKET_OPTIONAL_FIELDS = [
  "type",
  "assignee_id",
  "requester_id",
  "submitter_id",
  "group_id",
  "organization_id",
  "tags",
  "via",
  "brand_id",
  "due_at",
  "has_incidents",
  "satisfaction_rating",
  "collaborator_ids",
  "follower_ids",
  "email_cc_ids",
  "external_id",
  "problem_id",
  "custom_status_id",
  "custom_fields",
] as const;

export type TicketOptionalField = (typeof TICKET_OPTIONAL_FIELDS)[number];

export function isTicketOptionalField(
  value: string
): value is TicketOptionalField {
  return (TICKET_OPTIONAL_FIELDS as readonly string[]).includes(value);
}

export const ZENDESK_TOOLS_METADATA = createToolsRecord({
  get_ticket: {
    description:
      "Retrieve a Zendesk ticket by its ID. " +
      "Returns by default: id, url, subject, status, priority, description, created_at, updated_at. " +
      "fields can be used to request additional data. " +
      "includeMetrics can be used to retrieve resolution times or reply counts, only if clearly asked by the user. " +
      "includeConversation can be used to retrieve the full conversation, only if clearly asked by the user.",
    schema: {
      ticketId: z
        .number()
        .int()
        .positive()
        .describe("The ID of the Zendesk ticket to retrieve."),
      fields: z
        .array(z.string())
        .optional()
        .describe(
          "Optional list of additional fields to include in the response. " +
            "By default only id, url, subject, status, priority, description, created_at, updated_at are returned. " +
            `Valid values: ${TICKET_OPTIONAL_FIELDS.join(", ")}.`
        ),
      includeMetrics: z
        .boolean()
        .optional()
        .describe(
          "Include ticket metrics (resolution times, wait times, reopens, replies). " +
            "Do not set to true unless the user explicitly asks for metrics or resolution times."
        ),
      includeConversation: z
        .boolean()
        .optional()
        .describe(
          "Include the full conversation (all comments). " +
            "Do not set to true unless the user explicitly asks for the conversation or comments."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Zendesk ticket",
      done: "Retrieve Zendesk ticket",
    },
  },
  search_tickets: {
    description:
      "Search for Zendesk tickets using query syntax. Returns up to 1,000 matching tickets. " +
      "Each ticket returns by default: id, url, subject, status, priority, description, created_at, updated_at. " +
      'Supports filtering by status, priority, type, assignee, tags, and custom fields (syntax: custom_field_{id}:"value"). ' +
      "list_ticket_fields can be used to discover available custom field IDs. " +
      "fields can be used to request additional data per ticket.",
    schema: {
      query: z
        .string()
        .describe(
          "Search query using Zendesk query syntax. Supports field:value pairs for status, priority, type, assignee, tags, " +
            'and custom_field_{id}:"value" for custom fields. Multiple conditions are combined with AND logic. ' +
            "Do not include 'type:ticket' as it is automatically added."
        ),
      fields: z
        .array(z.string())
        .optional()
        .describe(
          "Optional list of additional fields to include in the response. " +
            "By default only id, url, subject, status, priority, description, created_at, updated_at are returned. " +
            `Valid values: ${TICKET_OPTIONAL_FIELDS.join(", ")}.`
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
    stake: "never_ask",
    displayLabels: {
      running: "Searching Zendesk tickets",
      done: "Search Zendesk tickets",
    },
  },
  list_ticket_fields: {
    description:
      "Lists ticket field definitions with their ID, title, type, and whether they are active. " +
      "Includes built-in fields (Subject, Priority, Status) and custom fields. " +
      "Returns active fields by default. includeInactive can be set to true to include all fields.",
    schema: {
      includeInactive: z
        .boolean()
        .optional()
        .describe("Include inactive fields. Defaults to false."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Zendesk ticket fields",
      done: "List Zendesk ticket fields",
    },
  },
  draft_reply: {
    description:
      "Draft a reply to a Zendesk ticket. Creates a private comment (not visible to the end user) " +
      "that can be edited before being published. This is useful for preparing responses before " +
      "making them public.",
    schema: {
      ticketId: z
        .number()
        .int()
        .positive()
        .describe("The ID of the Zendesk ticket to reply to."),
      body: z.string().describe("The content of the draft reply."),
    },
    stake: "low", // Low because it's a draft.
    displayLabels: {
      running: "Drafting Zendesk reply",
      done: "Draft Zendesk reply",
    },
  },
});

export const ZENDESK_SERVER = {
  serverInfo: {
    name: "zendesk",
    version: "1.0.0",
    description:
      "Access and manage support tickets, help center, and customer interactions.",
    authorization: {
      provider: "zendesk" as const,
      supported_use_cases: ["platform_actions"] as const,
    },
    icon: "ZendeskLogo",
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(ZENDESK_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(ZENDESK_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;

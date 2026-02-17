import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const ZENDESK_TOOL_NAME = "zendesk" as const;

export const ZENDESK_TOOLS_METADATA = createToolsRecord({
  get_ticket: {
    description:
      "Retrieve a Zendesk ticket by its ID. Returns the ticket details including subject, " +
      "description, status, priority, assignee, and other metadata. Optionally include ticket metrics " +
      "such as resolution times, wait times, and reply counts. Optionally include the full conversation " +
      "with all comments.",
    schema: {
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
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Zendesk ticket",
      done: "Retrieve Zendesk ticket",
    },
  },
  search_tickets: {
    description:
      "Search for Zendesk tickets using query syntax. Returns up to 1,000 matching tickets with their details. " +
      "Supports filtering by status, priority, type, assignee, tags, custom fields, dates, and text fields. " +
      'Custom fields use syntax: custom_field_{id}:"exact_value". Tags are simple labels; business-specific data ' +
      "are typically stored in custom fields. Use list_ticket_fields to discover available custom field IDs.",
    schema: {
      query: z
        .string()
        .describe(
          "Search query using Zendesk query syntax. Supports field:value pairs for status, priority, type, assignee, tags, " +
            'and custom_field_{id}:"value" for custom fields. Multiple conditions are combined with AND logic. ' +
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
      "Returns active fields by default. Set includeInactive=true for all fields.",
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

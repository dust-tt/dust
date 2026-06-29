import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const ZENDESK_TOOLS_METADATA = createToolsRecord({
  get_ticket: {
    description:
      "Look up and retrieve a Zendesk support ticket by its ID. Returns subject, description, status, priority, assignee, and other metadata. Optionally include ticket metrics, the full conversation of comments, and file attachments.",
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
          "Include ticket metrics (resolution/wait times, replies). Defaults to false."
        ),
      includeConversation: z
        .boolean()
        .optional()
        .describe(
          "Include the full conversation (all comments). Defaults to false."
        ),
      includeAttachments: z
        .boolean()
        .optional()
        .describe("Include file attachments from ticket comments."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Zendesk ticket",
      done: "Retrieve Zendesk ticket",
    },
  },
  search_tickets: {
    description:
      "Search for Zendesk tickets using query syntax. Returns matching tickets with their details. Filter by status (e.g. open, pending, solved), priority, type, assignee, tags, custom fields, dates, and text fields.",
    schema: {
      query: z
        .string()
        .describe(
          "Zendesk search query. Supports field:value pairs (status, priority, type, assignee, tags) and custom_field_{id}:\"value\". Do not include 'type:ticket'."
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
      "Lists Zendesk ticket field definitions. Both built-in fields (Subject, Priority, Status) and custom fields. With their id, title, type, and active state.",
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
      running: "Drafting reply to Zendesk",
      done: "Draft reply to Zendesk",
    },
  },
  post_reply: {
    description:
      "Post or send a public reply (response) on a Zendesk ticket, visible to the end user (the customer).",
    schema: {
      ticketId: z
        .number()
        .int()
        .positive()
        .describe("The ID of the Zendesk ticket to reply to."),
      body: z.string().describe("The content of the reply."),
    },
    stake: "high",
    displayLabels: {
      running: "Posting reply to Zendesk",
      done: "Post reply to Zendesk",
    },
  },
  update_ticket_tags: {
    description:
      "Add tags to a Zendesk ticket, or replace all of its tags. By default (override=false) the provided tags are added to the existing ones. With override=true they replace the full list (omitted tags are removed).",
    schema: {
      ticketId: z
        .number()
        .int()
        .positive()
        .describe("The ID of the Zendesk ticket to update."),
      tags: z
        .array(z.string())
        .describe(
          "Tags to add, or the complete new list of tags if override=true."
        ),
      override: z
        .boolean()
        .optional()
        .describe(
          "If true, replaces all existing tags with the provided list. It removes any tag not in the list. " +
            "If false or omitted, adds the tags to the existing ones. Defaults to false."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Updating Zendesk ticket tags",
      done: "Update Zendesk ticket tags",
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

import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

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
  },
  search_tickets: {
    description:
      "Search for Zendesk tickets using query syntax. Returns a list of matching tickets with their " +
      "details. You can search by status, priority, assignee, tags, and other fields. Query " +
      "examples: 'status:open', 'priority:high', 'status:open priority:urgent', 'assignee:me', " +
      "'tags:bug'.",
    schema: {
      query: z
        .string()
        .describe(
          "The search query using Zendesk query syntax. Examples: 'status:open', 'priority:high' " +
            "status:pending', 'assignee:123', 'tags:bug tags:critical'." +
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
  })),
  tools_stakes: Object.fromEntries(
    Object.values(ZENDESK_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;

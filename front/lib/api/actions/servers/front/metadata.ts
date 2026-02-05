import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const FRONT_TOOL_NAME = "front" as const;

export const FRONT_TOOLS_METADATA = createToolsRecord({
  search_conversations: {
    description:
      "Search conversations in Front by keywords, customer email, tags, status, or other criteria. " +
      "Returns matching conversations with their details.",
    schema: {
      q: z
        .string()
        .describe(
          "Search query. Can include keywords, email addresses (e.g., 'customer@example.com'), " +
            "status filters (e.g., 'is:open', 'is:archived'), tag filters (e.g., 'tag:bug'), etc."
        ),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe(
          "Maximum number of conversations to return (default: 20, max: 100)"
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching Front conversations",
      done: "Search Front conversations",
    },
  },
  get_conversation: {
    description:
      "Retrieve complete details of a specific conversation by its ID, including subject, status, " +
      "assignee, tags, inbox, and all metadata.",
    schema: {
      conversation_id: z
        .string()
        .describe("The unique ID of the conversation (e.g., 'cnv_55c8c149')"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Front conversation",
      done: "Retrieve Front conversation",
    },
  },
  get_conversation_messages: {
    description:
      "Retrieve all messages in a conversation, including both external messages (emails) and " +
      "internal comments. Returns the complete message timeline.",
    schema: {
      conversation_id: z
        .string()
        .describe("The unique ID of the conversation (e.g., 'cnv_55c8c149')"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Front messages",
      done: "Retrieve Front messages",
    },
  },
  get_contact: {
    description:
      "Look up customer/contact information by email address or contact ID. Returns contact details " +
      "including name, email, and custom fields.",
    schema: {
      email: z
        .string()
        .optional()
        .describe("Email address of the contact to look up"),
      contact_id: z
        .string()
        .optional()
        .describe("The unique ID of the contact (e.g., 'crd_55c8c149')"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Looking up Front contact",
      done: "Look up Front contact",
    },
  },
  list_tags: {
    description: "Get all available tags for categorizing conversations.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing Front tags",
      done: "List Front tags",
    },
  },
  list_teammates: {
    description:
      "Get all teammates in the workspace for assignment and collaboration.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing Front teammates",
      done: "List Front teammates",
    },
  },
  get_customer_history: {
    description:
      "Retrieve past conversations with a specific customer by their email address.",
    schema: {
      customer_email: z
        .string()
        .describe("Customer email address to search for"),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe(
          "Maximum number of past conversations to return (default: 10)"
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Front customer history",
      done: "Retrieve Front customer history",
    },
  },
  list_inboxes: {
    description: "Get all inboxes/channels available in the workspace.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing Front inboxes",
      done: "List Front inboxes",
    },
  },
  create_conversation: {
    description: "Start a new outbound conversation with a customer.",
    schema: {
      inbox_id: z
        .string()
        .describe("The ID of the inbox to create the conversation in"),
      to: z.array(z.string()).describe("Array of recipient email addresses"),
      subject: z.string().describe("Subject line of the conversation"),
      body: z.string().describe("Message body content"),
      author_id: z
        .string()
        .optional()
        .describe("Optional: Teammate ID for the message author"),
    },
    stake: "low",
    displayLabels: {
      running: "Creating Front conversation",
      done: "Create Front conversation",
    },
  },
  create_draft: {
    description:
      "Create a draft reply to a conversation for review before sending.",
    schema: {
      conversation_id: z.string().describe("The unique ID of the conversation"),
      body: z.string().describe("The draft message content"),
      author_id: z
        .string()
        .optional()
        .describe("Optional: Teammate ID for the draft author"),
    },
    stake: "low",
    displayLabels: {
      running: "Creating draft on Front",
      done: "Create draft on Front",
    },
  },
  add_tags: {
    description:
      "Add one or more tags to a conversation for categorization (e.g., bug, feature-request, billing).",
    schema: {
      conversation_id: z.string().describe("The unique ID of the conversation"),
      tag_ids: z
        .array(z.string())
        .describe("Array of tag IDs to add to the conversation"),
    },
    stake: "low",
    displayLabels: {
      running: "Adding tags on Front",
      done: "Add tags on Front",
    },
  },
  add_comment: {
    description:
      "Add an internal comment/note to a conversation (only visible to team).",
    schema: {
      conversation_id: z.string().describe("The unique ID of the conversation"),
      body: z.string().describe("The comment content"),
      author_id: z
        .string()
        .optional()
        .describe("Optional: Teammate ID for the comment author"),
    },
    stake: "low",
    displayLabels: {
      running: "Adding comment on Front",
      done: "Add comment on Front",
    },
  },
  add_links: {
    description:
      "Link related conversations together for better tracking and context.",
    schema: {
      conversation_id: z.string().describe("The unique ID of the conversation"),
      linked_conversation_ids: z
        .array(z.string())
        .describe("Array of conversation IDs to link to"),
    },
    stake: "low",
    displayLabels: {
      running: "Linking Front conversations",
      done: "Link Front conversations",
    },
  },
  send_message: {
    description:
      "Send a reply or internal comment to a conversation. Can send as email reply or internal note.",
    schema: {
      conversation_id: z.string().describe("The unique ID of the conversation"),
      body: z.string().describe("The message content (supports markdown)"),
      type: z
        .enum(["comment", "reply"])
        .default("reply")
        .describe(
          "Type of message: 'comment' for internal note, 'reply' for customer-facing email (default: reply)"
        ),
      author_id: z
        .string()
        .optional()
        .describe(
          "Optional: Teammate ID to send as (defaults to API token owner)"
        ),
    },
    stake: "high",
    displayLabels: {
      running: "Sending message on Front",
      done: "Send message on Front",
    },
  },
  update_conversation_status: {
    description:
      "Update the status of a conversation (archive, reopen, delete, spam, trash).",
    schema: {
      conversation_id: z.string().describe("The unique ID of the conversation"),
      status: z
        .enum(["archived", "deleted", "open", "spam", "trash"])
        .describe(
          "New status: 'archived' (close), 'open' (reopen), 'deleted', 'spam', 'trash'"
        ),
    },
    stake: "high",
    displayLabels: {
      running: "Updating Front conversation status",
      done: "Update Front conversation status",
    },
  },
  assign_conversation: {
    description: "Assign a conversation to a specific teammate for handling.",
    schema: {
      conversation_id: z.string().describe("The unique ID of the conversation"),
      teammate_id: z.string().describe("The ID of the teammate to assign to"),
    },
    stake: "high",
    displayLabels: {
      running: "Assigning Front conversation",
      done: "Assign Front conversation",
    },
  },
});

export const FRONT_SERVER = {
  serverInfo: {
    name: "front",
    version: "1.0.0",
    description:
      "Manage support conversations, messages, and customer interactions.",
    authorization: null,
    icon: "FrontLogo",
    documentationUrl: "https://dev.frontapp.com/reference/introduction",
    instructions:
      "When handling support tickets:\n" +
      "- Always check customer history before replying using get_customer_history\n" +
      "- Auto-tag conversations based on issue type (bug, feature-request, billing)\n" +
      "- Assign to teammate 'ilias' if T1 cannot resolve after three attempts\n" +
      "- Use LLM-friendly timeline format for conversation data\n" +
      "- Include full context (metadata, custom fields) in responses",
    developerSecretSelection: "required",
  },
  tools: Object.values(FRONT_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(FRONT_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;

import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";

export const FRONT_TOOL_NAME = "front" as const;

export const searchConversationsSchema = {
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
};

export const getConversationSchema = {
  conversation_id: z
    .string()
    .describe("The unique ID of the conversation (e.g., 'cnv_55c8c149')"),
};

export const getConversationMessagesSchema = {
  conversation_id: z
    .string()
    .describe("The unique ID of the conversation (e.g., 'cnv_55c8c149')"),
};

export const getContactSchema = {
  email: z
    .string()
    .optional()
    .describe("Email address of the contact to look up"),
  contact_id: z
    .string()
    .optional()
    .describe("The unique ID of the contact (e.g., 'crd_55c8c149')"),
};

export const listTagsSchema = {};

export const listTeammatesSchema = {};

export const getCustomerHistorySchema = {
  customer_email: z.string().describe("Customer email address to search for"),
  limit: z
    .number()
    .optional()
    .default(10)
    .describe("Maximum number of past conversations to return (default: 10)"),
};

export const listInboxesSchema = {};

export const createConversationSchema = {
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
};

export const createDraftSchema = {
  conversation_id: z.string().describe("The unique ID of the conversation"),
  body: z.string().describe("The draft message content"),
  author_id: z
    .string()
    .optional()
    .describe("Optional: Teammate ID for the draft author"),
};

export const addTagsSchema = {
  conversation_id: z.string().describe("The unique ID of the conversation"),
  tag_ids: z
    .array(z.string())
    .describe("Array of tag IDs to add to the conversation"),
};

export const addCommentSchema = {
  conversation_id: z.string().describe("The unique ID of the conversation"),
  body: z.string().describe("The comment content"),
  author_id: z
    .string()
    .optional()
    .describe("Optional: Teammate ID for the comment author"),
};

export const addLinksSchema = {
  conversation_id: z.string().describe("The unique ID of the conversation"),
  linked_conversation_ids: z
    .array(z.string())
    .describe("Array of conversation IDs to link to"),
};

export const sendMessageSchema = {
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
    .describe("Optional: Teammate ID to send as (defaults to API token owner)"),
};

export const updateConversationStatusSchema = {
  conversation_id: z.string().describe("The unique ID of the conversation"),
  status: z
    .enum(["archived", "deleted", "open", "spam", "trash"])
    .describe(
      "New status: 'archived' (close), 'open' (reopen), 'deleted', 'spam', 'trash'"
    ),
};

export const assignConversationSchema = {
  conversation_id: z.string().describe("The unique ID of the conversation"),
  teammate_id: z.string().describe("The ID of the teammate to assign to"),
};

export const FRONT_TOOLS: MCPToolType[] = [
  {
    name: "search_conversations",
    description:
      "Search conversations in Front by keywords, customer email, tags, status, or other criteria. " +
      "Returns matching conversations with their details.",
    inputSchema: zodToJsonSchema(
      z.object(searchConversationsSchema)
    ) as JSONSchema,
  },
  {
    name: "get_conversation",
    description:
      "Retrieve complete details of a specific conversation by its ID, including subject, status, " +
      "assignee, tags, inbox, and all metadata.",
    inputSchema: zodToJsonSchema(z.object(getConversationSchema)) as JSONSchema,
  },
  {
    name: "get_conversation_messages",
    description:
      "Retrieve all messages in a conversation, including both external messages (emails) and " +
      "internal comments. Returns the complete message timeline.",
    inputSchema: zodToJsonSchema(
      z.object(getConversationMessagesSchema)
    ) as JSONSchema,
  },
  {
    name: "get_contact",
    description:
      "Look up customer/contact information by email address or contact ID. Returns contact details " +
      "including name, email, and custom fields.",
    inputSchema: zodToJsonSchema(z.object(getContactSchema)) as JSONSchema,
  },
  {
    name: "list_tags",
    description: "Get all available tags for categorizing conversations.",
    inputSchema: zodToJsonSchema(z.object(listTagsSchema)) as JSONSchema,
  },
  {
    name: "list_teammates",
    description:
      "Get all teammates in the workspace for assignment and collaboration.",
    inputSchema: zodToJsonSchema(z.object(listTeammatesSchema)) as JSONSchema,
  },
  {
    name: "get_customer_history",
    description:
      "Retrieve past conversations with a specific customer by their email address.",
    inputSchema: zodToJsonSchema(
      z.object(getCustomerHistorySchema)
    ) as JSONSchema,
  },
  {
    name: "list_inboxes",
    description: "Get all inboxes/channels available in the workspace.",
    inputSchema: zodToJsonSchema(z.object(listInboxesSchema)) as JSONSchema,
  },
  {
    name: "create_conversation",
    description: "Start a new outbound conversation with a customer.",
    inputSchema: zodToJsonSchema(
      z.object(createConversationSchema)
    ) as JSONSchema,
  },
  {
    name: "create_draft",
    description:
      "Create a draft reply to a conversation for review before sending.",
    inputSchema: zodToJsonSchema(z.object(createDraftSchema)) as JSONSchema,
  },
  {
    name: "add_tags",
    description:
      "Add one or more tags to a conversation for categorization (e.g., bug, feature-request, billing).",
    inputSchema: zodToJsonSchema(z.object(addTagsSchema)) as JSONSchema,
  },
  {
    name: "add_comment",
    description:
      "Add an internal comment/note to a conversation (only visible to team).",
    inputSchema: zodToJsonSchema(z.object(addCommentSchema)) as JSONSchema,
  },
  {
    name: "add_links",
    description:
      "Link related conversations together for better tracking and context.",
    inputSchema: zodToJsonSchema(z.object(addLinksSchema)) as JSONSchema,
  },
  {
    name: "send_message",
    description:
      "Send a reply or internal comment to a conversation. Can send as email reply or internal note.",
    inputSchema: zodToJsonSchema(z.object(sendMessageSchema)) as JSONSchema,
  },
  {
    name: "update_conversation_status",
    description:
      "Update the status of a conversation (archive, reopen, delete, spam, trash).",
    inputSchema: zodToJsonSchema(
      z.object(updateConversationStatusSchema)
    ) as JSONSchema,
  },
  {
    name: "assign_conversation",
    description: "Assign a conversation to a specific teammate for handling.",
    inputSchema: zodToJsonSchema(
      z.object(assignConversationSchema)
    ) as JSONSchema,
  },
];

export const FRONT_SERVER_INFO = {
  name: "front" as const,
  version: "1.0.0",
  description:
    "Manage support conversations, messages, and customer interactions.",
  authorization: null,
  icon: "FrontLogo" as const,
  documentationUrl: "https://dev.frontapp.com/reference/introduction",
  instructions:
    "When handling support tickets:\n" +
    "- Always check customer history before replying using get_customer_history\n" +
    "- Auto-tag conversations based on issue type (bug, feature-request, billing)\n" +
    "- Assign to teammate 'ilias' if T1 cannot resolve after three attempts\n" +
    "- Use LLM-friendly timeline format for conversation data\n" +
    "- Include full context (metadata, custom fields) in responses",
  developerSecretSelection: "required" as const,
};

export const FRONT_TOOL_STAKES = {
  search_conversations: "never_ask",
  get_conversation: "never_ask",
  get_conversation_messages: "never_ask",
  get_contact: "never_ask",
  list_tags: "never_ask",
  list_teammates: "never_ask",
  get_customer_history: "never_ask",
  list_inboxes: "never_ask",

  create_conversation: "low",
  create_draft: "low",
  add_tags: "low",
  add_comment: "low",
  add_links: "low",

  send_message: "high",
  update_conversation_status: "high",
  assign_conversation: "high",
} as const satisfies Record<string, MCPToolStakeLevelType>;

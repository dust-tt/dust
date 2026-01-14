import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";
import type { MCPOAuthUseCase } from "@app/types";

// We use a single tool name for monitoring given the high granularity (can be revisited).
export const GMAIL_TOOL_NAME = "gmail" as const;

// =============================================================================
// Zod Schemas - Used by server file for runtime validation
// =============================================================================

export const getDraftsSchema = {
  q: z
    .string()
    .optional()
    .describe(
      'Only return draft messages matching the specified query. Supports the same query format as the Gmail search box. For example, "from:someuser@example.com rfc822msgid:<somemsgid@example.com> is:unread".'
    ),
  pageToken: z
    .string()
    .optional()
    .describe("Token for fetching the next page of results."),
};

export const createDraftSchema = {
  to: z.array(z.string()).describe("The email addresses of the recipients"),
  cc: z.array(z.string()).optional().describe("The email addresses to CC"),
  bcc: z.array(z.string()).optional().describe("The email addresses to BCC"),
  subject: z.string().describe("The subject line of the email"),
  contentType: z
    .enum(["text/plain", "text/html"])
    .describe("The content type of the email (text/plain or text/html)."),
  body: z.string().describe("The body of the email"),
};

export const deleteDraftSchema = {
  draftId: z.string().describe("The ID of the draft to delete"),
  subject: z.string().describe("The subject of the draft to delete"),
  to: z.array(z.string()).describe("The email addresses of the recipients"),
};

export const getMessagesSchema = {
  q: z
    .string()
    .optional()
    .describe(
      'Gmail search query to filter messages. Supports the same query format as the Gmail search box. Examples: "from:someone@example.com", to:example.com, "subject:meeting", "is:unread", "label:important". Leave empty to get recent messages.'
    ),
  maxResults: z
    .number()
    .optional()
    .describe("Maximum number of messages to return (default: 10, max: 100)"),
  pageToken: z
    .string()
    .optional()
    .describe("Token for fetching the next page of results."),
};

export const createReplyDraftSchema = {
  messageId: z.string().describe("The ID of the message to reply to"),
  body: z.string().describe("The body of the reply email"),
  contentType: z
    .enum(["text/plain", "text/html"])
    .optional()
    .describe(
      "The content type of the email (text/plain or text/html). Defaults to text/plain."
    ),
  to: z
    .array(z.string())
    .optional()
    .describe("Override the To recipients for the reply."),
  cc: z
    .array(z.string())
    .optional()
    .describe("Override the CC recipients for the reply."),
  bcc: z
    .array(z.string())
    .optional()
    .describe("Override the BCC recipients for the reply."),
};

// =============================================================================
// Tool Definitions - Used by constants.ts for static metadata
// =============================================================================

export const GMAIL_TOOLS: MCPToolType[] = [
  {
    name: "get_drafts",
    description: "Get all drafts from Gmail.",
    inputSchema: zodToJsonSchema(z.object(getDraftsSchema)) as JSONSchema,
  },
  {
    name: "create_draft",
    description:
      "Create a new email draft in Gmail. The draft will be saved in the user's Gmail account and can be reviewed and sent later. The user can review and send the draft later. The draft will include proper email headers and formatting.",
    inputSchema: zodToJsonSchema(z.object(createDraftSchema)) as JSONSchema,
  },
  {
    name: "delete_draft",
    description: "Delete a draft email from Gmail.",
    inputSchema: zodToJsonSchema(z.object(deleteDraftSchema)) as JSONSchema,
  },
  {
    name: "get_messages",
    description:
      "Get messages from Gmail inbox. Supports Gmail search queries to filter messages.",
    inputSchema: zodToJsonSchema(z.object(getMessagesSchema)) as JSONSchema,
  },
  {
    name: "create_reply_draft",
    description:
      "Create a reply draft to an existing email thread in Gmail. The draft will be saved in the user's Gmail account and can be reviewed and sent later. The reply will be properly formatted with the original message quoted. The draft will include proper email headers and threading information.",
    inputSchema: zodToJsonSchema(
      z.object(createReplyDraftSchema)
    ) as JSONSchema,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const GMAIL_SERVER_INFO = {
  name: "gmail" as const,
  version: "1.0.0",
  description: "Access messages and email drafts.",
  authorization: {
    provider: "google_drive" as const,
    supported_use_cases: ["personal_actions"] as MCPOAuthUseCase[],
    scope:
      "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose" as const,
  },
  icon: "GmailLogo" as const,
  documentationUrl: "https://docs.dust.tt/docs/gmail",
  instructions: null,
};

// =============================================================================
// Tool Stakes - Default permission levels for each tool
// =============================================================================

export const GMAIL_TOOL_STAKES = {
  get_drafts: "never_ask",
  create_draft: "low",
  get_messages: "never_ask",
  create_reply_draft: "low",
} as const satisfies Record<string, MCPToolStakeLevelType>;

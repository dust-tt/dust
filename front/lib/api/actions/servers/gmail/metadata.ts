import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const GMAIL_TOOL_NAME = "gmail" as const;

export const GMAIL_TOOLS_METADATA = createToolsRecord({
  get_drafts: {
    description: "Get all drafts from Gmail.",
    schema: {
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
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Gmail drafts",
      done: "Get Gmail drafts",
    },
  },
  create_draft: {
    description: `Create a new email draft in Gmail, or a reply draft to an existing message.
- The draft will be saved in the user's Gmail account and can be reviewed and sent later.
- The draft will include proper email headers and formatting.`,
    schema: {
      to: z
        .array(z.string())
        .optional()
        .describe(
          "The email addresses of the recipients (optional if replyToMessageId is set, defaults to the original sender, acts as override)."
        ),
      cc: z
        .array(z.string())
        .optional()
        .describe(
          "The CC email addresses (optional if replyToMessageId is set, acts as override)."
        ),
      bcc: z
        .array(z.string())
        .optional()
        .describe(
          "The BCC email addresses (optional if replyToMessageId is set, acts as override)."
        ),
      subject: z
        .string()
        .optional()
        .describe(
          "The subject line of the email (required if replyToMessageId is not set, must be omitted if replyToMessageId is set)."
        ),
      contentType: z
        .enum(["text/plain", "text/html"])
        .describe(
          "The content type of the email body. Use text/plain for plain text or text/html for HTML. Must be text/html when replyToMessageId is set."
        ),
      body: z.string().describe("The body of the email"),
      replyToMessageId: z
        .string()
        .optional()
        .describe(
          "Optional. The ID of the message to reply to. If provided, the draft will be created as a reply in the existing thread, with proper threading headers and the original message quoted."
        ),
    },
    stake: "medium",
    displayLabels: {
      running: "Creating Gmail draft",
      done: "Create Gmail draft",
    },
  },
  delete_draft: {
    description: "Delete a draft email from Gmail.",
    schema: {
      draftId: z.string().describe("The ID of the draft to delete"),
      subject: z.string().describe("The subject of the draft to delete"),
      to: z.array(z.string()).describe("The email addresses of the recipients"),
    },
    stake: "high",
    displayLabels: {
      running: "Deleting Gmail draft",
      done: "Delete Gmail draft",
    },
  },
  get_messages: {
    description:
      "Get messages from Gmail inbox. Supports Gmail search queries to filter messages.",
    schema: {
      q: z
        .string()
        .optional()
        .describe(
          'Gmail search query to filter messages. Supports the same query format as the Gmail search box. Examples: "from:someone@example.com", to:example.com, "subject:meeting", "is:unread", "label:important". Leave empty to get recent messages.'
        ),
      maxResults: z
        .number()
        .optional()
        .describe(
          "Maximum number of messages to return (default: 10, max: 50 without attachments, 10 with attachments)"
        ),
      pageToken: z
        .string()
        .optional()
        .describe("Token for fetching the next page of results."),
      includeAttachments: z
        .boolean()
        .optional()
        .describe(
          "Include message attachments in the response (default: false)"
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Gmail messages",
      done: "Get Gmail messages",
    },
  },
  get_attachment: {
    description:
      "Get the content of a specific attachment from a Gmail message. The attachment will be uploaded and made available in the conversation.",
    schema: {
      messageId: z
        .string()
        .describe("The ID of the message containing the attachment"),
      attachmentId: z
        .string()
        .describe(
          "The attachment ID (from the attachments array in get_messages)"
        ),
      partId: z
        .string()
        .describe("The part ID (from the attachments array in get_messages)"),
      filename: z
        .string()
        .describe(
          "The filename of the attachment (from the attachments array in get_messages)"
        ),
      mimeType: z
        .string()
        .describe(
          "The MIME type of the attachment (from the attachments array in get_messages)"
        ),
      hasRealAttachmentId: z
        .boolean()
        .describe(
          "Whether the attachment has a real attachment ID that can be fetched via API (from the attachments array in get_messages)"
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Gmail attachment",
      done: "Get Gmail attachment",
    },
  },
  get_labels: {
    description:
      "Retrieve all Gmail labels, including system labels and user-created labels.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Getting Gmail labels",
      done: "Get Gmail labels",
    },
  },
  set_message_labels: {
    description: `Modify the labels of a message. System label IDs can be used directly (INBOX, SPAM, TRASH, UNREAD, STARRED, IMPORTANT, ...). User labels should be retrieved first via get_labels to get their IDs.`,
    schema: {
      messageId: z.string().describe("The ID of the message to modify."),
      addLabelIds: z.array(z.string()).optional().describe("Label IDs to add."),
      removeLabelIds: z
        .array(z.string())
        .optional()
        .describe("Label IDs to remove."),
    },
    stake: "medium",
    displayLabels: {
      running: "Modifying Gmail message labels",
      done: "Modify Gmail message labels",
    },
  },
  send_mail: {
    description: `Send an email directly via Gmail.
- The email will be sent immediately without creating a draft.
- Use this to send emails when you have all the required information.
- The email will include proper headers and formatting.`,
    schema: {
      to: z
        .array(z.string())
        .optional()
        .describe(
          "The email addresses of the recipients (optional if replyToMessageId is set, defaults to the original sender, acts as override)."
        ),
      cc: z
        .array(z.string())
        .optional()
        .describe(
          "The CC email addresses (optional if replyToMessageId is set, acts as override)."
        ),
      bcc: z
        .array(z.string())
        .optional()
        .describe(
          "The BCC email addresses (optional if replyToMessageId is set, acts as override)."
        ),
      from: z
        .string()
        .email()
        .optional()
        .describe(
          "Optional. The email address to send from. Must be configured as a send-as alias in the user's Gmail settings (e.g. a shared Google Group address like team@company.com). If omitted, Gmail will use the authenticated user's primary address."
        ),
      subject: z
        .string()
        .optional()
        .describe(
          "The subject line of the email (required if replyToMessageId is not set, must be omitted if replyToMessageId is set)."
        ),
      contentType: z
        .enum(["text/plain", "text/html"])
        .describe(
          "The content type of the email body. Use text/plain for plain text or text/html for HTML. Must be text/html when replyToMessageId is set."
        ),
      body: z.string().describe("The body of the email"),
      replyToMessageId: z
        .string()
        .optional()
        .describe(
          "Optional. The ID of the message to reply to. If provided, the email will be sent as a reply in the existing thread, with proper threading headers and the original message quoted."
        ),
    },
    stake: "high",
    displayLabels: {
      running: "Sending Gmail email",
      done: "Send Gmail email",
    },
  },
  get_thread: {
    description: "Get all messages in a Gmail thread/conversation.",
    schema: {
      threadId: z
        .string()
        .describe(
          "The ID of the thread to retrieve. Can be found in the threadId field of any message."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Gmail thread",
      done: "Get Gmail thread",
    },
  },
});

export const GMAIL_SERVER = {
  serverInfo: {
    name: "gmail",
    version: "1.0.0",
    description: "Access messages and email drafts.",
    authorization: {
      provider: "google_drive",
      supported_use_cases: ["personal_actions", "platform_actions"],
      scope:
        "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.modify",
    },
    icon: "GmailLogo",
    documentationUrl: "https://docs.dust.tt/docs/gmail",
    instructions: null,
  },
  tools: Object.values(GMAIL_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(GMAIL_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;

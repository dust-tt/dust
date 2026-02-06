import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

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
    description: `Create a new email draft in Gmail.
- The draft will be saved in the user's Gmail account and can be reviewed and sent later.
- The user can review and send the draft later
- The draft will include proper email headers and formatting`,
    schema: {
      to: z.array(z.string()).describe("The email addresses of the recipients"),
      cc: z.array(z.string()).optional().describe("The email addresses to CC"),
      bcc: z
        .array(z.string())
        .optional()
        .describe("The email addresses to BCC"),
      subject: z.string().describe("The subject line of the email"),
      contentType: z
        .enum(["text/plain", "text/html"])
        .describe("The content type of the email (text/plain or text/html)."),
      body: z.string().describe("The body of the email"),
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
  create_reply_draft: {
    description: `Create a reply draft to an existing email thread in Gmail.
- The draft will be saved in the user's Gmail account and can be reviewed and sent later.
- The reply will be properly formatted with the original message quoted.
- The draft will include proper email headers and threading information.`,
    schema: {
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
    },
    stake: "medium",
    displayLabels: {
      running: "Creating Gmail reply draft",
      done: "Create Gmail reply draft",
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
        .min(1)
        .describe("The email addresses of the recipients"),
      cc: z.array(z.string()).optional().describe("The email addresses to CC"),
      bcc: z
        .array(z.string())
        .optional()
        .describe("The email addresses to BCC"),
      subject: z.string().describe("The subject line of the email"),
      contentType: z
        .enum(["text/plain", "text/html"])
        .describe("The content type of the email (text/plain or text/html)."),
      body: z.string().describe("The body of the email"),
    },
    stake: "high",
    displayLabels: {
      running: "Sending Gmail email",
      done: "Send Gmail email",
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
      supported_use_cases: ["personal_actions"],
      scope:
        "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose",
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

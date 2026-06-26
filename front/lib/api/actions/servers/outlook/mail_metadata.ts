import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const OUTLOOK_TOOL_NAME = "outlook" as const;

export const OUTLOOK_TOOLS_METADATA = createToolsRecord({
  get_messages: {
    description:
      "Get message metadata and previews from Outlook. Returns subject, sender, date, and a short bodyPreview snippet (~255 chars) — NOT the full body. If the task requires reading the actual content of any email, you MUST call get_message_body for each message after this call.",
    schema: {
      search: z
        .string()
        .optional()
        .describe(
          'Search query to filter messages. Examples: "from:someone@example.com", "subject:meeting", "hasAttachments:true". Leave empty to get recent messages.'
        ),
      folderName: z
        .string()
        .optional()
        .describe(
          'The folder to get messages from. Use a plain name for top-level folders (e.g. "Inbox", "Sent Items") or a "/" separated path to target a subfolder (e.g. "Inbox/Projects", "Inbox/test"). The lookup is case-insensitive. Leave empty to get messages from all folders. Use the list_folders tool to discover the available folder hierarchy.'
        ),
      top: z
        .number()
        .optional()
        .describe(
          "Maximum number of messages to return (default: 10, max: 100)"
        ),
      skip: z
        .number()
        .optional()
        .describe("Number of messages to skip for pagination."),
      select: z
        .array(z.string())
        .optional()
        .describe("Fields to include in the response."),
      sharedMailboxAddress: z
        .string()
        .optional()
        .describe(
          "The email address of the shared mailbox to access (e.g. 'support@company.com'). " +
            "Leave empty to access your own mailbox. " +
            "Note: the shared mailbox address must be known in advance — there is no API to auto-discover it."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Fetching messages",
      done: "Fetch messages",
    },
  },
  list_folders: {
    description:
      "List mail folders in an Outlook mailbox. Returns the immediate children of the specified folder path, or top-level folders when no path is given. Use this to discover the full folder hierarchy before calling get_messages with a subfolder path.",
    schema: {
      folderPath: z
        .array(z.string())
        .optional()
        .describe(
          'Path of the folder whose children to list, as an ordered list of folder names from the top level (e.g. ["Inbox"] to list subfolders of Inbox, ["Inbox", "Projects"] to go one level deeper). Omit or pass an empty array to list top-level folders.'
        ),
      sharedMailboxAddress: z
        .string()
        .optional()
        .describe(
          "The email address of the shared mailbox to access (e.g. 'support@company.com'). " +
            "Leave empty to access your own mailbox. " +
            "Note: the shared mailbox address must be known in advance — there is no API to auto-discover it."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing folders",
      done: "List folders",
    },
  },
  list_attachments: {
    description:
      "List attachments on an Outlook message, returning metadata only (id, name, contentType, size, isInline). Use this first to see what attachments exist, then call get_attachment for each one you want to retrieve. Inline attachments (embedded images, signatures) are excluded by default.",
    schema: {
      messageId: z
        .string()
        .describe("The ID of the message (from get_messages)"),
      includeInline: z
        .boolean()
        .optional()
        .describe(
          "Include inline attachments such as embedded images and signatures. Defaults to false."
        ),
      sharedMailboxAddress: z
        .string()
        .optional()
        .describe(
          "The email address of the shared mailbox to access (e.g. 'support@company.com'). " +
            "Leave empty to access your own mailbox. " +
            "Note: the shared mailbox address must be known in advance — there is no API to auto-discover it."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing attachments",
      done: "List attachments",
    },
  },
  get_attachment: {
    description:
      "Retrieve a single attachment from an Outlook message by its attachment ID. Works for any file size — for large attachments (>4MB) where the list call returns no inline content, this tool fetches via a dedicated download endpoint. Call list_attachments first to get attachment IDs.",
    schema: {
      messageId: z
        .string()
        .describe("The ID of the message (from get_messages)"),
      attachmentId: z
        .string()
        .describe("The ID of the attachment (from list_attachments)"),
      sharedMailboxAddress: z
        .string()
        .optional()
        .describe(
          "The email address of the shared mailbox to access (e.g. 'support@company.com'). " +
            "Leave empty to access your own mailbox. " +
            "Note: the shared mailbox address must be known in advance — there is no API to auto-discover it."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Downloading attachment",
      done: "Download attachment",
    },
  },
  get_attachments: {
    description:
      "Get all attachments from an Outlook message at once. For better control over large attachments, prefer list_attachments followed by individual get_attachment calls instead.",
    schema: {
      messageId: z
        .string()
        .describe(
          "The ID of the message to get attachments from (from the get_messages response)"
        ),
      sharedMailboxAddress: z
        .string()
        .optional()
        .describe(
          "The email address of the shared mailbox to access (e.g. 'support@company.com'). " +
            "Leave empty to access your own mailbox. " +
            "Note: the shared mailbox address must be known in advance — there is no API to auto-discover it."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Outlook attachments",
      done: "Get Outlook attachments",
    },
  },
  get_drafts: {
    description:
      "Get draft emails from Outlook. Returns a limited number of drafts by default to avoid overwhelming responses.",
    schema: {
      search: z
        .string()
        .optional()
        .describe(
          'Search query to filter drafts. Examples: "subject:meeting", "to:someone@example.com".'
        ),
      top: z
        .number()
        .optional()
        .describe("Maximum number of drafts to return (default: 10, max: 100)"),
      skip: z
        .number()
        .optional()
        .describe("Number of drafts to skip for pagination."),
      sharedMailboxAddress: z
        .string()
        .optional()
        .describe(
          "The email address of the shared mailbox to access (e.g. 'support@company.com'). " +
            "Leave empty to access your own mailbox. " +
            "Note: the shared mailbox address must be known in advance — there is no API to auto-discover it."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Fetching drafts",
      done: "Fetch drafts",
    },
  },
  create_draft: {
    description: `Create a new email draft in Outlook, or a reply draft to an existing message.
- The draft will be saved in the user's Outlook account and can be reviewed and sent later.
- The draft will include proper email headers and formatting.`,
    schema: {
      to: z
        .array(z.string())
        .optional()
        .describe(
          "The email addresses of the recipients (optional if replyToMessageId is set, acts as override)."
        ),
      cc: z
        .array(z.string())
        .optional()
        .describe(
          "The CC email addresses (optional, acts as override if replyToMessageId is set)."
        ),
      bcc: z
        .array(z.string())
        .optional()
        .describe(
          "The BCC email addresses (optional, acts as override if replyToMessageId is set)."
        ),
      replyTo: z
        .array(z.string())
        .optional()
        .describe(
          "Reply-to email addresses. Replies will go to these addresses instead of the sender."
        ),
      subject: z
        .string()
        .optional()
        .describe(
          "The subject line of the email (required if replyToMessageId is not set, must be omitted if replyToMessageId is set)."
        ),
      contentType: z
        .enum(["text", "html"])
        .optional()
        .describe(
          "The content type of the email body (required if replyToMessageId is not set, must be omitted if replyToMessageId is set (forced to html for replies))."
        ),
      body: z.string().describe("The body of the email"),
      importance: z
        .enum(["low", "normal", "high"])
        .optional()
        .describe("The importance level of the email."),
      replyToMessageId: z
        .string()
        .optional()
        .describe(
          "Optional. The ID of the message to reply to. If provided, the draft will be created as a reply in the existing thread, with proper threading headers and the original message quoted."
        ),
      replyAll: z
        .boolean()
        .optional()
        .describe(
          "Whether to reply to all recipients. Only used when replyToMessageId is set. Defaults to false."
        ),
      attachmentFilePath: z
        .string()
        .optional()
        .describe(
          "Optional. Scoped path of the file to attach to the email (e.g. `conversation-<id>/report.pdf` or `pod-<id>/data.csv`)."
        ),
      sharedMailboxAddress: z
        .string()
        .optional()
        .describe(
          "The email address of the shared mailbox to create the draft in (e.g. 'support@company.com'). " +
            "Leave empty to create the draft in your own mailbox. " +
            "Note: the shared mailbox address must be known in advance — there is no API to auto-discover it."
        ),
    },
    stake: "medium",
    displayLabels: {
      running: "Creating draft",
      done: "Create draft",
    },
  },
  delete_draft: {
    description: "Delete a draft email from Outlook.",
    schema: {
      messageId: z.string().describe("The ID of the draft to delete"),
      subject: z.string().describe("The subject of the draft to delete"),
      to: z.array(z.string()).describe("The email addresses of the recipients"),
      sharedMailboxAddress: z
        .string()
        .optional()
        .describe(
          "The email address of the shared mailbox containing the draft. Omit to use the authenticated user's mailbox."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Deleting draft",
      done: "Delete draft",
    },
  },
  send_mail: {
    description: `Send an email directly via Outlook.
- The email will be sent immediately without creating a draft.
- Use this when all required fields are known.`,
    schema: {
      to: z
        .array(z.string())
        .optional()
        .describe(
          "The email addresses of the recipients (optional if replyToMessageId is set, acts as override)."
        ),
      cc: z.array(z.string()).optional().describe("The email addresses to CC"),
      bcc: z
        .array(z.string())
        .optional()
        .describe("The email addresses to BCC"),
      replyTo: z
        .array(z.string())
        .optional()
        .describe(
          "Reply-to email addresses. Replies will go to these addresses instead of the sender."
        ),
      subject: z
        .string()
        .optional()
        .describe(
          "The subject line of the email (required if replyToMessageId is not set, must be omitted if replyToMessageId is set)."
        ),
      contentType: z
        .enum(["text", "html"])
        .optional()
        .describe(
          "The content type of the email body (text or html). Required when replyToMessageId is not set. Must be omitted when replyToMessageId is set."
        ),
      body: z.string().describe("The body of the email"),
      importance: z
        .enum(["low", "normal", "high"])
        .optional()
        .describe("The importance level of the email."),
      saveToSentItems: z
        .boolean()
        .optional()
        .describe(
          "Whether to save the sent email to the Sent Items folder. Defaults to true. " +
            "Note: this option is ignored when replyToMessageId is set — the email will always be saved to Sent Items in that case."
        ),
      sharedMailboxAddress: z
        .string()
        .optional()
        .describe(
          "The email address of the shared mailbox to send from (e.g. 'support@company.com'). " +
            "Leave empty to send from your own mailbox. " +
            "Note: the shared mailbox address must be known in advance — there is no API to auto-discover it."
        ),
      replyToMessageId: z
        .string()
        .optional()
        .describe(
          "Optional. The ID of the message to reply to. If provided, the email will be sent as a reply in the existing thread, with proper threading headers and the original message quoted."
        ),
      replyAll: z
        .boolean()
        .optional()
        .describe(
          "Whether to reply to all recipients. Only used when replyToMessageId is set. Defaults to false."
        ),
      attachmentFilePath: z
        .string()
        .optional()
        .describe(
          "Optional. Scoped path of the file to attach to the email (e.g. `conversation-<id>/report.pdf` or `pod-<id>/data.csv`)."
        ),
    },
    stake: "high",
    displayLabels: {
      running: "Sending email",
      done: "Send email",
    },
  },
  move_messages: {
    description:
      'Move one or more messages to a destination folder in Outlook. The destination is given as a path of folder names from the top level (e.g. ["Archive", "2026", "Receipts"]). Any folders along the path that do not exist are created automatically. Prefer passing all messages destined for the same folder in a single call rather than calling this tool in parallel. Note: Microsoft Graph assigns a new message ID after a move.',
    schema: {
      messageIds: z
        .array(z.string())
        .min(1)
        .describe("The IDs of the messages to move"),
      destinationFolderPath: z
        .array(z.string())
        .min(1)
        .describe(
          'Path to the destination folder as a list of folder names from the top level (e.g. ["Archive", "2026", "Receipts"]). Pass a single-element array for a top-level folder. Any missing folders along the path are created automatically.'
        ),
      sharedMailboxAddress: z
        .string()
        .optional()
        .describe(
          "The email address of the shared mailbox to access (e.g. 'support@company.com'). " +
            "Leave empty to access your own mailbox. " +
            "Note: the shared mailbox address must be known in advance — there is no API to auto-discover it."
        ),
    },
    stake: "medium",
    displayLabels: {
      running: "Moving messages",
      done: "Move messages",
    },
  },
  get_message_body: {
    description:
      "Get the full body of a single Outlook message. ALWAYS call this after get_messages whenever the task requires reading email content — get_messages only returns a short preview. For large emails, use startChar/endChar to read in chunks and repeat until moreAvailable is false.",
    schema: {
      messageId: z
        .string()
        .describe("The ID of the message (from get_messages)"),
      preferredContentType: z
        .enum(["text", "html"])
        .optional()
        .describe(
          "Preferred body content type. Use 'text' (default) to get plain text — Microsoft Graph will convert HTML emails automatically. Use 'html' to get the raw HTML."
        ),
      startChar: z
        .number()
        .optional()
        .describe(
          "Character offset to start reading from (0-indexed). Defaults to 0."
        ),
      endChar: z
        .number()
        .optional()
        .describe(
          "Character offset to stop reading at (exclusive). Defaults to the full body, capped at 50 000 characters per call."
        ),
      sharedMailboxAddress: z
        .string()
        .optional()
        .describe(
          "The email address of the shared mailbox to access (e.g. 'support@company.com'). " +
            "Leave empty to access your own mailbox. " +
            "Note: the shared mailbox address must be known in advance — there is no API to auto-discover it."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Fetching message body",
      done: "Fetch message body",
    },
  },
  get_contacts: {
    description:
      "Get contacts from Outlook. Supports search queries to filter contacts.",
    schema: {
      search: z
        .string()
        .optional()
        .describe(
          'Search query to filter contacts. Examples: "name:John", "company:Microsoft". Leave empty to get recent contacts.'
        ),
      top: z
        .number()
        .optional()
        .describe(
          "Maximum number of contacts to return (default: 20, max: 100)"
        ),
      skip: z
        .number()
        .optional()
        .describe("Number of contacts to skip for pagination."),
      select: z
        .array(z.string())
        .optional()
        .describe("Fields to include in the response."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Fetching contacts",
      done: "Fetch contacts",
    },
  },
  create_contact: {
    description: "Create a new contact in Outlook.",
    schema: {
      displayName: z.string().describe("Display name of the contact"),
      givenName: z.string().optional().describe("First name of the contact"),
      surname: z.string().optional().describe("Last name of the contact"),
      emailAddresses: z
        .array(
          z.object({
            address: z.string(),
            name: z.string().optional(),
          })
        )
        .optional()
        .describe("Email addresses for the contact"),
      businessPhones: z
        .array(z.string())
        .optional()
        .describe("Business phone numbers"),
      homePhones: z.array(z.string()).optional().describe("Home phone numbers"),
      mobilePhone: z.string().optional().describe("Mobile phone number"),
      jobTitle: z.string().optional().describe("Job title"),
      companyName: z.string().optional().describe("Company name"),
      department: z.string().optional().describe("Department"),
      officeLocation: z.string().optional().describe("Office location"),
    },
    stake: "high",
    displayLabels: {
      running: "Creating contact",
      done: "Create contact",
    },
  },
  update_contact: {
    description: "Update an existing contact in Outlook.",
    schema: {
      contactId: z.string().describe("ID of the contact to update"),
      displayName: z
        .string()
        .optional()
        .describe("Display name of the contact"),
      givenName: z.string().optional().describe("First name of the contact"),
      surname: z.string().optional().describe("Last name of the contact"),
      emailAddresses: z
        .array(
          z.object({
            address: z.string(),
            name: z.string().optional(),
          })
        )
        .optional()
        .describe("Email addresses for the contact"),
      businessPhones: z
        .array(z.string())
        .optional()
        .describe("Business phone numbers"),
      homePhones: z.array(z.string()).optional().describe("Home phone numbers"),
      mobilePhone: z.string().optional().describe("Mobile phone number"),
      jobTitle: z.string().optional().describe("Job title"),
      companyName: z.string().optional().describe("Company name"),
      department: z.string().optional().describe("Department"),
      officeLocation: z.string().optional().describe("Office location"),
    },
    stake: "high",
    displayLabels: {
      running: "Updating contact",
      done: "Update contact",
    },
  },
});

export const OUTLOOK_MAIL_SERVER = {
  serverInfo: {
    name: "outlook",
    version: "1.0.0",
    description:
      "Read and send Outlook emails (Microsoft 365): manage inbox messages, drafts, mail folders, contacts, and shared mailboxes.",
    authorization: {
      provider: "microsoft_tools",
      supported_use_cases: ["personal_actions", "platform_actions"],
      scope:
        "Mail.ReadWrite.Shared Mail.Send Mail.Send.Shared Contacts.ReadWrite Contacts.ReadWrite.Shared User.Read SensitivityLabel.Read offline_access",
      availableScopes: [
        {
          value: "Mail.ReadWrite",
          label: "Read & write mail",
          description: "Read and modify emails in the mailbox.",
          required: true,
          impliedBy: "Mail.ReadWrite.Shared",
        },
        {
          value: "Mail.ReadWrite.Shared",
          label: "Read & write shared mail",
          description: "Access shared and delegated mailboxes.",
          fallbackScope: "Mail.ReadWrite",
        },
        {
          value: "Mail.Send",
          label: "Send mail",
          description: "Send emails on behalf of the signed-in user.",
          required: true,
          impliedBy: "Mail.Send.Shared",
        },
        {
          value: "Mail.Send.Shared",
          label: "Send mail from shared mailboxes",
          description: "Send emails from shared and delegated mailboxes.",
          fallbackScope: "Mail.Send",
        },
        {
          value: "Contacts.ReadWrite",
          label: "Read & write contacts",
          description: "Read and modify contacts in the address book.",
        },
        {
          value: "Contacts.ReadWrite.Shared",
          label: "Read & write shared contacts",
          description: "Access shared and delegated contact folders.",
        },
        {
          value: "User.Read",
          label: "Read user profile",
          description: "Read basic user profile information.",
          required: true,
        },
        {
          value: "offline_access",
          label: "Offline access",
          description: "Maintain access without requiring re-authentication.",
          required: true,
        },
      ],
    },
    icon: "MicrosoftOutlookLogo",
    documentationUrl: "https://docs.dust.tt/docs/outlook-tool-setup",
  },
  tools: Object.values(OUTLOOK_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(OUTLOOK_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;

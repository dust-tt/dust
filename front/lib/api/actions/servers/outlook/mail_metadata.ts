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
  get_attachments: {
    description:
      "Get all attachments from an Outlook message. Lists attachments and downloads their content, making them available in the conversation.",
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
    description: `Create a new email draft in Outlook.
- The draft will be saved in the user's Outlook account and can be reviewed and sent later.
- The draft will include proper email headers and formatting`,
    schema: {
      to: z.array(z.string()).describe("The email addresses of the recipients"),
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
      subject: z.string().describe("The subject line of the email"),
      contentType: z
        .string()
        .default("text")
        .describe("The content type of the email (text or html)."),
      body: z.string().describe("The body of the email"),
      importance: z
        .string()
        .optional()
        .describe("The importance level of the email"),
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
    },
    stake: "low",
    displayLabels: {
      running: "Deleting draft",
      done: "Delete draft",
    },
  },
  create_reply_draft: {
    description: `Create a reply draft to an existing email in Outlook.
- The draft will be saved in the user's Outlook account and can be reviewed and sent later.
- The reply will be properly formatted with the original message quoted.
- The draft will include proper email headers and threading information.`,
    schema: {
      messageId: z.string().describe("The ID of the message to reply to"),
      body: z.string().describe("The body of the reply email"),
      contentType: z
        .string()
        .optional()
        .describe(
          "The content type of the email (text or html). Defaults to html."
        ),
      replyAll: z
        .boolean()
        .optional()
        .describe("Whether to reply to all recipients. Defaults to false."),
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
      running: "Creating reply draft",
      done: "Create reply draft",
    },
  },
  send_mail: {
    description: `Send an email directly via Outlook.
- The email will be sent immediately without creating a draft.
- Use this when all required fields are known.`,
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
      replyTo: z
        .array(z.string())
        .optional()
        .describe(
          "Reply-to email addresses. Replies will go to these addresses instead of the sender."
        ),
      subject: z.string().describe("The subject line of the email"),
      contentType: z
        .enum(["text", "html"])
        .default("text")
        .describe("The content type of the email body (text or html)."),
      body: z.string().describe("The body of the email"),
      saveToSentItems: z
        .boolean()
        .optional()
        .describe(
          "Whether to save the sent email to the Sent Items folder. Defaults to true."
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
    description: "Read emails, manage drafts and contacts.",
    authorization: {
      provider: "microsoft_tools",
      supported_use_cases: ["personal_actions", "platform_actions"],
      scope:
        "Mail.ReadWrite.Shared Mail.Send Contacts.ReadWrite Contacts.ReadWrite.Shared User.Read SensitivityLabel.Read offline_access",
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
    instructions: null,
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

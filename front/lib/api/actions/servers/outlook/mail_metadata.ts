import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const OUTLOOK_TOOL_NAME = "outlook" as const;

export const OUTLOOK_TOOLS_METADATA = createToolsRecord({
  get_messages: {
    description:
      "Get messages from Outlook inbox. Supports search queries to filter messages and filter by folder name.",
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
          'The name of the folder to get messages from. Examples: "Inbox", "Sent Items", "Drafts". The tool will search for a folder matching this name. Leave empty to get messages from all folders.'
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
    },
    stake: "never_ask",
    displayLabels: {
      running: "Fetching messages",
      done: "Fetch messages",
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
      supported_use_cases: ["personal_actions"],
      scope:
        "Mail.ReadWrite Mail.ReadWrite.Shared Contacts.ReadWrite Contacts.ReadWrite.Shared User.Read offline_access",
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

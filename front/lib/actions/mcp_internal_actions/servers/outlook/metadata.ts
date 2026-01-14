import type { JSONSchema7 } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";
import type { MCPOAuthUseCase } from "@app/types";

// =============================================================================
// Exports for monitoring
// =============================================================================

export const OUTLOOK_TOOL_NAME = "outlook" as const;
export const OUTLOOK_CALENDAR_TOOL_NAME = "outlook_calendar" as const;

// =============================================================================
// Tool Schemas - Input schemas for each tool
// =============================================================================

export const getMessagesSchema = {
  search: z
    .string()
    .optional()
    .describe(
      'Search query to filter messages. Examples: "from:someone@example.com", "subject:meeting", "hasAttachments:true". Leave empty to get recent messages.'
    ),
  top: z
    .number()
    .optional()
    .describe("Maximum number of messages to return (default: 10, max: 100)"),
  skip: z
    .number()
    .optional()
    .describe("Number of messages to skip for pagination."),
  select: z
    .array(z.string())
    .optional()
    .describe("Fields to include in the response."),
};

export const getDraftsSchema = {
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
};

export const createDraftSchema = {
  to: z.array(z.string()).describe("The email addresses of the recipients"),
  cc: z.array(z.string()).optional().describe("The email addresses to CC"),
  bcc: z.array(z.string()).optional().describe("The email addresses to BCC"),
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
};

export const deleteDraftSchema = {
  messageId: z.string().describe("The ID of the draft to delete"),
  subject: z.string().describe("The subject of the draft to delete"),
  to: z.array(z.string()).describe("The email addresses of the recipients"),
};

export const createReplyDraftSchema = {
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
};

export const getContactsSchema = {
  search: z
    .string()
    .optional()
    .describe(
      'Search query to filter contacts. Examples: "name:John", "company:Microsoft". Leave empty to get recent contacts.'
    ),
  top: z
    .number()
    .optional()
    .describe("Maximum number of contacts to return (default: 20, max: 100)"),
  skip: z
    .number()
    .optional()
    .describe("Number of contacts to skip for pagination."),
  select: z
    .array(z.string())
    .optional()
    .describe("Fields to include in the response."),
};

export const createContactSchema = {
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
};

export const updateContactSchema = {
  contactId: z.string().describe("ID of the contact to update"),
  displayName: z.string().optional().describe("Display name of the contact"),
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
};

// =============================================================================
// Outlook Calendar Tool Schemas - Input schemas for calendar tools
// =============================================================================

export const getUserTimezoneSchema = {};

export const listCalendarsSchema = {
  top: z
    .number()
    .optional()
    .describe("Maximum number of calendars to return (max 999)."),
  skip: z
    .number()
    .optional()
    .describe("Number of calendars to skip for pagination."),
  userTimezone: z
    .string()
    .optional()
    .describe(
      "User's timezone (e.g., 'America/New_York'). Call get_user_timezone first to get this value."
    ),
};

export const listEventsSchema = {
  calendarId: z
    .string()
    .optional()
    .describe(
      "The calendar ID. If not provided, uses the user's default calendar."
    ),
  search: z
    .string()
    .optional()
    .describe('Search query to filter events. Examples: "meeting", "lunch"'),
  startTime: z
    .string()
    .optional()
    .describe("ISO 8601 start time filter (e.g., 2024-03-20T10:00:00Z)"),
  endTime: z
    .string()
    .optional()
    .describe("ISO 8601 end time filter (e.g., 2024-03-20T18:00:00Z)"),
  top: z
    .number()
    .optional()
    .describe("Maximum number of events to return (max 999)."),
  skip: z
    .number()
    .optional()
    .describe("Number of events to skip for pagination."),
  userTimezone: z
    .string()
    .optional()
    .describe(
      "User's timezone (e.g., 'America/New_York'). Call get_user_timezone first to get this value for proper timezone handling."
    ),
};

export const getEventSchema = {
  calendarId: z
    .string()
    .optional()
    .describe(
      "The calendar ID. If not provided, uses the user's default calendar."
    ),
  eventId: z.string().describe("The ID of the event to retrieve."),
  userTimezone: z
    .string()
    .optional()
    .describe(
      "User's timezone (e.g., 'America/New_York'). Call get_user_timezone first to get this value."
    ),
};

export const createEventSchema = {
  calendarId: z
    .string()
    .optional()
    .describe(
      "The calendar ID. If not provided, uses the user's default calendar."
    ),
  subject: z.string().describe("Title of the event."),
  body: z.string().optional().describe("Description of the event."),
  contentType: z
    .enum(["text", "html"])
    .optional()
    .describe("Content type of the event body (default: text)."),
  startDateTime: z
    .string()
    .describe("ISO 8601 start time (e.g., 2024-03-20T10:00:00)"),
  endDateTime: z
    .string()
    .describe("ISO 8601 end time (e.g., 2024-03-20T11:00:00)"),
  timeZone: z
    .string()
    .optional()
    .describe(
      "Time zone for the event (e.g., 'America/New_York'). Defaults to UTC."
    ),
  attendees: z
    .array(z.string())
    .optional()
    .describe("List of attendee email addresses."),
  location: z.string().optional().describe("Location of the event."),
  isAllDay: z.boolean().optional().describe("Whether the event is all day."),
  importance: z
    .enum(["low", "normal", "high"])
    .optional()
    .describe("Importance level of the event (default: normal)."),
  showAs: z
    .enum(["free", "tentative", "busy", "oof", "workingElsewhere"])
    .optional()
    .describe("Show as status for the event (default: busy)."),
  userTimezone: z
    .string()
    .optional()
    .describe(
      "User's timezone (e.g., 'America/New_York'). Call get_user_timezone first to get this value."
    ),
};

export const updateEventSchema = {
  calendarId: z
    .string()
    .optional()
    .describe(
      "The calendar ID. If not provided, uses the user's default calendar."
    ),
  eventId: z.string().describe("The ID of the event to update."),
  subject: z.string().optional().describe("Title of the event."),
  body: z.string().optional().describe("Description of the event."),
  contentType: z
    .enum(["text", "html"])
    .optional()
    .describe("Content type of the event body."),
  startDateTime: z.string().optional().describe("ISO 8601 start time"),
  endDateTime: z.string().optional().describe("ISO 8601 end time"),
  timeZone: z.string().optional().describe("Time zone for the event."),
  attendees: z
    .array(z.string())
    .optional()
    .describe("List of attendee email addresses."),
  location: z.string().optional().describe("Location of the event."),
  isAllDay: z.boolean().optional().describe("Whether the event is all day."),
  importance: z
    .enum(["low", "normal", "high"])
    .optional()
    .describe("Importance level of the event."),
  showAs: z
    .enum(["free", "tentative", "busy", "oof", "workingElsewhere"])
    .optional()
    .describe("Show as status for the event."),
  userTimezone: z
    .string()
    .optional()
    .describe(
      "User's timezone (e.g., 'America/New_York'). Call get_user_timezone first to get this value."
    ),
};

export const deleteEventSchema = {
  calendarId: z
    .string()
    .optional()
    .describe(
      "The calendar ID. If not provided, uses the user's default calendar."
    ),
  eventId: z.string().describe("The ID of the event to delete."),
  userTimezone: z
    .string()
    .optional()
    .describe(
      "User's timezone (e.g., 'America/New_York'). Call get_user_timezone first to get this value."
    ),
};

export const checkAvailabilitySchema = {
  emails: z
    .array(z.string())
    .describe("The email addresses of the people to check availability for"),
  startTime: z
    .string()
    .describe("The start time in ISO format (e.g., 2024-03-20T10:00:00Z)"),
  endTime: z
    .string()
    .describe("The end time in ISO format (e.g., 2024-03-20T11:00:00Z)"),
  intervalInMinutes: z
    .number()
    .optional()
    .describe(
      "Interval in minutes for availability slots (default: 60, max: 1440)"
    ),
  userTimezone: z
    .string()
    .optional()
    .describe(
      "User's timezone (e.g., 'America/New_York'). Call get_user_timezone first to get this value."
    ),
};

export const checkSelfAvailabilitySchema = {
  calendarId: z
    .string()
    .optional()
    .describe(
      "The calendar ID. If not provided, uses the user's default calendar."
    ),
  startTime: z
    .string()
    .describe(
      "ISO 8601 start time to check availability (e.g., 2024-03-20T10:00:00Z)"
    ),
  endTime: z
    .string()
    .describe(
      "ISO 8601 end time to check availability (e.g., 2024-03-20T18:00:00Z)"
    ),
  userTimezone: z
    .string()
    .optional()
    .describe(
      "User's timezone (e.g., 'America/New_York'). Call get_user_timezone first to get this value for proper timezone handling."
    ),
};

// =============================================================================
// Tool Definitions - Static tool metadata for constants registry
// =============================================================================

export const OUTLOOK_TOOLS: MCPToolType[] = [
  {
    name: "get_messages",
    description:
      "Get messages from Outlook inbox. Supports search queries to filter messages.",
    inputSchema: zodToJsonSchema(z.object(getMessagesSchema)) as JSONSchema7,
  },
  {
    name: "get_drafts",
    description:
      "Get draft emails from Outlook. Returns a limited number of drafts by default to avoid overwhelming responses.",
    inputSchema: zodToJsonSchema(z.object(getDraftsSchema)) as JSONSchema7,
  },
  {
    name: "create_draft",
    description:
      "Create a new email draft in Outlook.\n- The draft will be saved in the user's Outlook account and can be reviewed and sent later.\n- The draft will include proper email headers and formatting",
    inputSchema: zodToJsonSchema(z.object(createDraftSchema)) as JSONSchema7,
  },
  {
    name: "delete_draft",
    description: "Delete a draft email from Outlook.",
    inputSchema: zodToJsonSchema(z.object(deleteDraftSchema)) as JSONSchema7,
  },
  {
    name: "create_reply_draft",
    description:
      "Create a reply draft to an existing email in Outlook.\n- The draft will be saved in the user's Outlook account and can be reviewed and sent later.\n- The reply will be properly formatted with the original message quoted.\n- The draft will include proper email headers and threading information.",
    inputSchema: zodToJsonSchema(
      z.object(createReplyDraftSchema)
    ) as JSONSchema7,
  },
  {
    name: "get_contacts",
    description:
      "Get contacts from Outlook. Supports search queries to filter contacts.",
    inputSchema: zodToJsonSchema(z.object(getContactsSchema)) as JSONSchema7,
  },
  {
    name: "create_contact",
    description: "Create a new contact in Outlook.",
    inputSchema: zodToJsonSchema(z.object(createContactSchema)) as JSONSchema7,
  },
  {
    name: "update_contact",
    description: "Update an existing contact in Outlook.",
    inputSchema: zodToJsonSchema(z.object(updateContactSchema)) as JSONSchema7,
  },
];

export const OUTLOOK_CALENDAR_TOOLS: MCPToolType[] = [
  {
    name: "get_user_timezone",
    description:
      "Get the user's configured timezone from their Outlook mailbox settings. This should be called before creating, updating, or searching for events to ensure proper timezone handling.",
    inputSchema: zodToJsonSchema(
      z.object(getUserTimezoneSchema)
    ) as JSONSchema7,
  },
  {
    name: "list_calendars",
    description: "List all calendars accessible by the user in Outlook.",
    inputSchema: zodToJsonSchema(z.object(listCalendarsSchema)) as JSONSchema7,
  },
  {
    name: "list_events",
    description:
      "List or search events from an Outlook Calendar. Supports filtering and searching. For accurate timezone handling, first call get_user_timezone and pass the timezone parameter.",
    inputSchema: zodToJsonSchema(z.object(listEventsSchema)) as JSONSchema7,
  },
  {
    name: "get_event",
    description: "Get a single event from an Outlook Calendar by event ID.",
    inputSchema: zodToJsonSchema(z.object(getEventSchema)) as JSONSchema7,
  },
  {
    name: "create_event",
    description:
      "Create a new event in an Outlook Calendar. Call get_user_timezone first and pass the userTimezone parameter for proper timezone handling.",
    inputSchema: zodToJsonSchema(z.object(createEventSchema)) as JSONSchema7,
  },
  {
    name: "update_event",
    description:
      "Update an existing event in an Outlook Calendar. Call get_user_timezone first and pass the userTimezone parameter for proper timezone handling.",
    inputSchema: zodToJsonSchema(z.object(updateEventSchema)) as JSONSchema7,
  },
  {
    name: "delete_event",
    description: "Delete an event from an Outlook Calendar.",
    inputSchema: zodToJsonSchema(z.object(deleteEventSchema)) as JSONSchema7,
  },
  {
    name: "check_availability",
    description:
      "Check the calendar availability of specific people for a given time slot using Outlook Calendar.",
    inputSchema: zodToJsonSchema(
      z.object(checkAvailabilitySchema)
    ) as JSONSchema7,
  },
  {
    name: "check_self_availability",
    description:
      "Check if the current user is available during a specific time period by analyzing " +
      "their calendar events. An event is considered blocking if its showAs status is 'busy', " +
      "'tentative', 'oof' (out of office), or 'workingElsewhere'.",
    inputSchema: zodToJsonSchema(
      z.object(checkSelfAvailabilitySchema)
    ) as JSONSchema7,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const OUTLOOK_SERVER_INFO = {
  name: "outlook" as const,
  version: "1.0.0",
  description: "Read emails, manage drafts and contacts.",
  authorization: {
    provider: "microsoft_tools" as const,
    supported_use_cases: ["personal_actions"] as MCPOAuthUseCase[],
    scope:
      "Mail.ReadWrite Mail.ReadWrite.Shared Contacts.ReadWrite Contacts.ReadWrite.Shared User.Read offline_access" as const,
  },
  icon: "MicrosoftOutlookLogo" as const,
  documentationUrl: "https://docs.dust.tt/docs/outlook-tool-setup",
  instructions: null,
};

export const OUTLOOK_CALENDAR_SERVER_INFO = {
  name: "outlook_calendar" as const,
  version: "1.0.0",
  description: "Tools for managing Outlook calendars and events.",
  authorization: {
    provider: "microsoft_tools" as const,
    supported_use_cases: ["personal_actions"] as MCPOAuthUseCase[],
    scope:
      "Calendars.ReadWrite Calendars.ReadWrite.Shared User.Read MailboxSettings.Read offline_access" as const,
  },
  icon: "MicrosoftOutlookLogo" as const,
  documentationUrl: "https://docs.dust.tt/docs/outlook-calendar-tool-setup",
  instructions: null,
};

// =============================================================================
// Tool Stakes - Default permission levels for each tool
// =============================================================================

export const OUTLOOK_TOOL_STAKES = {
  get_messages: "never_ask",
  get_drafts: "never_ask",
  create_draft: "low",
  delete_draft: "low",
  create_reply_draft: "low",
  get_contacts: "never_ask",
  create_contact: "high",
  update_contact: "high",
} as const satisfies Record<string, MCPToolStakeLevelType>;

export const OUTLOOK_CALENDAR_TOOL_STAKES = {
  get_user_timezone: "never_ask",
  list_calendars: "never_ask",
  list_events: "never_ask",
  get_event: "never_ask",
  create_event: "low",
  update_event: "low",
  delete_event: "low",
  check_availability: "never_ask",
  check_self_availability: "never_ask",
} as const satisfies Record<string, MCPToolStakeLevelType>;

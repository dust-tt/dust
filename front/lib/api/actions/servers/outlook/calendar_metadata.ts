import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const OUTLOOK_CALENDAR_TOOL_NAME = "outlook_calendar" as const;

export const OUTLOOK_CALENDAR_TOOLS_METADATA = createToolsRecord({
  get_user_timezone: {
    description:
      "Get the user's configured timezone from their Outlook mailbox settings. This should be called before creating, updating, or searching for events to ensure proper timezone handling.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Getting user timezone from Outlook",
      done: "Get user timezone from Outlook",
    },
  },
  list_calendars: {
    description: "List all calendars accessible by the user in Outlook.",
    schema: {
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
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing calendars",
      done: "List calendars",
    },
  },
  list_events: {
    description:
      "List or search events from an Outlook Calendar. Supports filtering and searching. For accurate timezone handling, first call get_user_timezone and pass the timezone parameter.",
    schema: {
      calendarId: z
        .string()
        .optional()
        .describe(
          "The calendar ID. If not provided, uses the user's default calendar."
        ),
      search: z
        .string()
        .optional()
        .describe(
          'Search query to filter events. Examples: "meeting", "lunch"'
        ),
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
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing events",
      done: "List events",
    },
  },
  get_event: {
    description: "Get a single event from an Outlook Calendar by event ID.",
    schema: {
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
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving event",
      done: "Retrieve event",
    },
  },
  create_event: {
    description:
      "Create a new event in an Outlook Calendar. Call get_user_timezone first and pass the userTimezone parameter for proper timezone handling.",
    schema: {
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
      isAllDay: z
        .boolean()
        .optional()
        .describe("Whether the event is all day."),
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
    },
    stake: "low",
    displayLabels: {
      running: "Creating event",
      done: "Create event",
    },
  },
  update_event: {
    description:
      "Update an existing event in an Outlook Calendar. Call get_user_timezone first and pass the userTimezone parameter for proper timezone handling.",
    schema: {
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
      isAllDay: z
        .boolean()
        .optional()
        .describe("Whether the event is all day."),
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
    },
    stake: "low",
    displayLabels: {
      running: "Updating event",
      done: "Update event",
    },
  },
  delete_event: {
    description: "Delete an event from an Outlook Calendar.",
    schema: {
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
    },
    stake: "low",
    displayLabels: {
      running: "Deleting event",
      done: "Delete event",
    },
  },
  check_availability: {
    description:
      "Check the calendar availability of specific people for a given time slot using Outlook Calendar.",
    schema: {
      emails: z
        .array(z.string())
        .describe(
          "The email addresses of the people to check availability for"
        ),
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
    },
    stake: "never_ask",
    displayLabels: {
      running: "Checking availability",
      done: "Check availability",
    },
  },
  check_self_availability: {
    description:
      "Check if the current user is available during a specific time period by analyzing " +
      "their calendar events. An event is considered blocking if its showAs status is 'busy', " +
      "'tentative', 'oof' (out of office), or 'workingElsewhere'.",
    schema: {
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
    },
    stake: "never_ask",
    displayLabels: {
      running: "Checking self availability",
      done: "Check self availability",
    },
  },
});

export const OUTLOOK_CALENDAR_SERVER = {
  serverInfo: {
    name: "outlook_calendar",
    version: "1.0.0",
    description: "Tools for managing Outlook calendars and events.",
    authorization: {
      provider: "microsoft_tools",
      supported_use_cases: ["personal_actions"],
      scope:
        "Calendars.ReadWrite Calendars.ReadWrite.Shared User.Read MailboxSettings.Read offline_access",
    },
    icon: "MicrosoftOutlookLogo",
    documentationUrl: "https://docs.dust.tt/docs/outlook-calendar-tool-setup",
    instructions: null,
  },
  tools: Object.values(OUTLOOK_CALENDAR_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(OUTLOOK_CALENDAR_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;

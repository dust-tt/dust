import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { MCPToolType } from "@app/lib/api/mcp";
import type { MCPOAuthUseCase } from "@app/types";

export const GOOGLE_CALENDAR_TOOL_NAME = "google_calendar" as const;

export const listCalendarsMeta = {
  name: "list_calendars" as const,
  description:
    "List all calendars accessible by the user. Supports pagination via pageToken.",
  schema: {
    pageToken: z.string().optional().describe("Page token for pagination."),
    maxResults: z
      .number()
      .optional()
      .describe("Maximum number of calendars to return (max 250)."),
  },
  stake: "never_ask" as MCPToolStakeLevelType,
};

export const listEventsMeta = {
  name: "list_events" as const,
  description:
    "List or search events from a Google Calendar. If 'q' is provided, performs a free-text search.",
  schema: {
    calendarId: z
      .string()
      .default("primary")
      .describe("The calendar ID (default: 'primary')."),
    q: z
      .string()
      .optional()
      .describe("Free text search query for event fields."),
    timeMin: z
      .string()
      .optional()
      .describe("RFC3339 lower bound for event start time (inclusive)."),
    timeMax: z
      .string()
      .optional()
      .describe("RFC3339 upper bound for event end time (exclusive)."),
    maxResults: z
      .number()
      .optional()
      .describe("Maximum number of events to return (max 2500)."),
    pageToken: z.string().optional().describe("Page token for pagination."),
  },
  stake: "never_ask" as MCPToolStakeLevelType,
};

export const getEventMeta = {
  name: "get_event" as const,
  description: "Get a single event from a Google Calendar by event ID.",
  schema: {
    calendarId: z
      .string()
      .default("primary")
      .describe("The calendar ID (default: 'primary')."),
    eventId: z.string().describe("The ID of the event to retrieve."),
  },
  stake: "never_ask" as MCPToolStakeLevelType,
};

export const createEventMeta = {
  name: "create_event" as const,
  description: "Create a new event in a Google Calendar.",
  schema: {
    calendarId: z
      .string()
      .default("primary")
      .describe("The calendar ID (default: 'primary')."),
    summary: z.string().describe("Title of the event."),
    description: z.string().optional().describe("Description of the event."),
    start: z
      .object({ dateTime: z.string().describe("RFC3339 start time") })
      .describe("Start time object."),
    end: z
      .object({ dateTime: z.string().describe("RFC3339 end time") })
      .describe("End time object."),
    attendees: z
      .array(z.string())
      .optional()
      .describe("List of attendee email addresses."),
    location: z.string().optional().describe("Location of the event."),
    colorId: z.string().optional().describe("Color ID for the event."),
    createConference: z
      .boolean()
      .default(true)
      .describe(
        "Whether to create a conference (Google Meet) for the event. Defaults to true."
      ),
  },
  stake: "low" as MCPToolStakeLevelType,
};

export const updateEventMeta = {
  name: "update_event" as const,
  description: "Update an existing event in a Google Calendar.",
  schema: {
    calendarId: z
      .string()
      .default("primary")
      .describe("The calendar ID (default: 'primary')."),
    eventId: z.string().describe("The ID of the event to update."),
    summary: z.string().optional().describe("Title of the event."),
    description: z.string().optional().describe("Description of the event."),
    start: z
      .object({ dateTime: z.string().describe("RFC3339 start time") })
      .optional()
      .describe("Start time object."),
    end: z
      .object({ dateTime: z.string().describe("RFC3339 end time") })
      .optional()
      .describe("End time object."),
    attendees: z
      .array(z.string())
      .optional()
      .describe("List of attendee email addresses."),
    location: z.string().optional().describe("Location of the event."),
    colorId: z.string().optional().describe("Color ID for the event."),
    createConference: z
      .boolean()
      .optional()
      .describe(
        "Whether to create a conference (Google Meet) for the event. If not provided, existing conference settings are preserved."
      ),
  },
  stake: "low" as MCPToolStakeLevelType,
};

export const deleteEventMeta = {
  name: "delete_event" as const,
  description: "Delete an event from a Google Calendar.",
  schema: {
    calendarId: z
      .string()
      .default("primary")
      .describe("The calendar ID (default: 'primary')."),
    eventId: z.string().describe("The ID of the event to delete."),
  },
  stake: "low" as MCPToolStakeLevelType,
};

export const checkAvailabilityMeta = {
  name: "check_availability" as const,
  description:
    "Compute combined availability across multiple participants within a date range.",
  schema: {
    participants: z
      .array(
        z.object({
          email: z
            .string()
            .describe(
              "Email address of the participant whose calendar should be checked."
            ),
          timezone: z
            .string()
            .describe(
              "IANA timezone identifier for this participant (e.g., 'America/New_York')."
            ),
          dailyTimeWindowStart: z
            .string()
            .regex(
              /^([01]?[0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$/,
              "Time must be in HH:mm or HH:mm:ss format (24-hour)"
            )
            .optional()
            .describe(
              "Optional start of the participant's working window (local time, HH:mm or HH:mm:ss)."
            ),
          dailyTimeWindowEnd: z
            .string()
            .regex(
              /^([01]?[0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$/,
              "Time must be in HH:mm or HH:mm:ss format (24-hour)"
            )
            .optional()
            .describe(
              "Optional end of the participant's working window (local time, HH:mm or HH:mm:ss)."
            ),
        })
      )
      .min(1, "Provide at least one participant.")
      .max(10, "A maximum of 10 participants is supported.")
      .describe(
        "Participants to include in the availability check. Specify their timezone and optional daily working window."
      ),
    startTimeRange: z
      .string()
      .describe(
        "ISO 8601 timestamp for the beginning of the range to analyze (UTC)."
      ),
    endTimeRange: z
      .string()
      .describe(
        "ISO 8601 timestamp for the end of the range to analyze (UTC)."
      ),
    excludeWeekends: z
      .boolean()
      .default(false)
      .describe(
        "If true, Saturdays and Sundays (in each participant's timezone) are ignored when computing availability."
      ),
  },
  stake: "never_ask" as MCPToolStakeLevelType,
};

export const getUserTimezonesMeta = {
  name: "get_user_timezones" as const,
  description:
    "Get timezone information for multiple users by attempting to access their calendars. Only works for calendars shared with you.",
  schema: {
    emails: z
      .array(z.string())
      .max(50, "Maximum 50 email addresses allowed")
      .describe("Array of email addresses to get timezone information for"),
  },
  stake: "never_ask" as MCPToolStakeLevelType,
};

export const TOOLS_META = [
  listCalendarsMeta,
  listEventsMeta,
  getEventMeta,
  createEventMeta,
  updateEventMeta,
  deleteEventMeta,
  checkAvailabilityMeta,
  getUserTimezonesMeta,
];

export const GOOGLE_CALENDAR_TOOLS: MCPToolType[] = TOOLS_META.map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
}));

export const GOOGLE_CALENDAR_TOOL_STAKES: Record<
  string,
  MCPToolStakeLevelType
> = Object.fromEntries(TOOLS_META.map((t) => [t.name, t.stake]));

export const GOOGLE_CALENDAR_SERVER_INFO = {
  name: "google_calendar" as const,
  version: "1.0.0",
  description: "Access calendar schedules and appointments.",
  authorization: {
    provider: "google_drive" as const,
    supported_use_cases: [
      "personal_actions",
      "platform_actions",
    ] as MCPOAuthUseCase[],
    scope:
      "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events" as const,
  },
  icon: "GcalLogo" as const,
  documentationUrl: "https://docs.dust.tt/docs/google-calendar",
  instructions:
    "By default when creating a meeting, (1) set the calling user as the organizer and an attendee (2) check availability for attendees using the check_availability tool (3) use get_user_timezones to check attendee timezones for better scheduling.",
};

export const GOOGLE_CALENDAR_SERVER = {
  serverInfo: GOOGLE_CALENDAR_SERVER_INFO,
  tools: GOOGLE_CALENDAR_TOOLS,
  tools_stakes: GOOGLE_CALENDAR_TOOL_STAKES,
} as const satisfies ServerMetadata;

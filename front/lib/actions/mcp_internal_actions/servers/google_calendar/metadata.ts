import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";
import type { MCPOAuthUseCase } from "@app/types";

// We use a single tool name for monitoring given the high granularity (can be revisited).
export const GOOGLE_CALENDAR_TOOL_NAME = "google_calendar" as const;

// =============================================================================
// Zod Schemas - Used by server file for runtime validation
// =============================================================================

export const listCalendarsSchema = {
  pageToken: z.string().optional().describe("Page token for pagination."),
  maxResults: z
    .number()
    .optional()
    .describe("Maximum number of calendars to return (max 250)."),
};

export const listEventsSchema = {
  calendarId: z
    .string()
    .default("primary")
    .describe("The calendar ID (default: 'primary')."),
  q: z.string().optional().describe("Free text search query for event fields."),
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
};

export const getEventSchema = {
  calendarId: z
    .string()
    .default("primary")
    .describe("The calendar ID (default: 'primary')."),
  eventId: z.string().describe("The ID of the event to retrieve."),
};

export const createEventSchema = {
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
};

export const updateEventSchema = {
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
};

export const deleteEventSchema = {
  calendarId: z
    .string()
    .default("primary")
    .describe("The calendar ID (default: 'primary')."),
  eventId: z.string().describe("The ID of the event to delete."),
};

export const checkAvailabilitySchema = {
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
    .describe("ISO 8601 timestamp for the end of the range to analyze (UTC)."),
  excludeWeekends: z
    .boolean()
    .default(false)
    .describe(
      "If true, Saturdays and Sundays (in each participant's timezone) are ignored when computing availability."
    ),
};

export const getUserTimezonesSchema = {
  emails: z
    .array(z.string())
    .max(50, "Maximum 50 email addresses allowed")
    .describe("Array of email addresses to get timezone information for"),
};

// =============================================================================
// Tool Definitions - Used by constants.ts for static metadata
// =============================================================================

export const GOOGLE_CALENDAR_TOOLS: MCPToolType[] = [
  {
    name: "list_calendars",
    description:
      "List all calendars accessible by the user. Supports pagination via pageToken.",
    inputSchema: zodToJsonSchema(z.object(listCalendarsSchema)) as JSONSchema,
  },
  {
    name: "list_events",
    description:
      "List or search events from a Google Calendar. If 'q' is provided, performs a free-text search.",
    inputSchema: zodToJsonSchema(z.object(listEventsSchema)) as JSONSchema,
  },
  {
    name: "get_event",
    description: "Get a single event from a Google Calendar by event ID.",
    inputSchema: zodToJsonSchema(z.object(getEventSchema)) as JSONSchema,
  },
  {
    name: "create_event",
    description: "Create a new event in a Google Calendar.",
    inputSchema: zodToJsonSchema(z.object(createEventSchema)) as JSONSchema,
  },
  {
    name: "update_event",
    description: "Update an existing event in a Google Calendar.",
    inputSchema: zodToJsonSchema(z.object(updateEventSchema)) as JSONSchema,
  },
  {
    name: "delete_event",
    description: "Delete an event from a Google Calendar.",
    inputSchema: zodToJsonSchema(z.object(deleteEventSchema)) as JSONSchema,
  },
  {
    name: "check_availability",
    description:
      "Compute combined availability across multiple participants within a date range.",
    inputSchema: zodToJsonSchema(
      z.object(checkAvailabilitySchema)
    ) as JSONSchema,
  },
  {
    name: "get_user_timezones",
    description:
      "Get timezone information for multiple users by attempting to access their calendars. Only works for calendars shared with you.",
    inputSchema: zodToJsonSchema(
      z.object(getUserTimezonesSchema)
    ) as JSONSchema,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const GOOGLE_CALENDAR_SERVER_INFO = {
  name: "google_calendar" as const,
  version: "1.0.0",
  description: "Access calendar schedules and appointments.",
  authorization: {
    provider: "google_drive" as const,
    supported_use_cases: ["personal_actions"] as MCPOAuthUseCase[],
    scope:
      "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events" as const,
  },
  icon: "GcalLogo" as const,
  documentationUrl: "https://docs.dust.tt/docs/google-calendar",
  instructions:
    "By default when creating a meeting, (1) set the calling user as the organizer and an attendee (2) check availability for attendees using the check_availability tool (3) use get_user_timezones to check attendee timezones for better scheduling.",
};

// =============================================================================
// Tool Stakes - Default permission levels for each tool
// =============================================================================

export const GOOGLE_CALENDAR_TOOL_STAKES = {
  list_calendars: "never_ask",
  list_events: "never_ask",
  get_event: "never_ask",
  create_event: "low",
  update_event: "low",
  delete_event: "low",
  check_availability: "never_ask",
  get_user_timezones: "never_ask",
} as const satisfies Record<string, MCPToolStakeLevelType>;

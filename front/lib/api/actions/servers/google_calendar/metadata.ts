import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const GOOGLE_CALENDAR_TOOL_NAME = "google_calendar" as const;

export const GOOGLE_CALENDAR_TOOLS_METADATA = createToolsRecord({
  list_calendars: {
    description:
      "List all calendars accessible by the user. Supports pagination via pageToken.",
    schema: {
      pageToken: z.string().optional().describe("Page token for pagination."),
      maxResults: z
        .number()
        .optional()
        .describe("Maximum number of calendars to return (max 250)."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Google calendars",
      done: "List Google calendars",
    },
  },
  list_events: {
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
    stake: "never_ask",
    displayLabels: {
      running: "Listing Google Calendar events",
      done: "List Google Calendar events",
    },
  },
  get_event: {
    description: "Get a single event from a Google Calendar by event ID.",
    schema: {
      calendarId: z
        .string()
        .default("primary")
        .describe("The calendar ID (default: 'primary')."),
      eventId: z.string().describe("The ID of the event to retrieve."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Google Calendar event",
      done: "Retrieve Google Calendar event",
    },
  },
  create_event: {
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
    stake: "medium",
    displayLabels: {
      running: "Creating Google Calendar event",
      done: "Create Google Calendar event",
    },
  },
  update_event: {
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
    stake: "medium",
    displayLabels: {
      running: "Updating Google Calendar event",
      done: "Update Google Calendar event",
    },
  },
  delete_event: {
    description: "Delete an event from a Google Calendar.",
    schema: {
      calendarId: z
        .string()
        .default("primary")
        .describe("The calendar ID (default: 'primary')."),
      eventId: z.string().describe("The ID of the event to delete."),
    },
    stake: "medium",
    displayLabels: {
      running: "Deleting Google Calendar event",
      done: "Delete Google Calendar event",
    },
  },
  check_availability: {
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
    stake: "never_ask",
    displayLabels: {
      running: "Checking Google Calendar availability",
      done: "Check Google Calendar availability",
    },
  },
  get_user_timezones: {
    description:
      "Get timezone information for multiple users by attempting to access their calendars. Only works for calendars shared with you.",
    schema: {
      emails: z
        .array(z.string())
        .max(50, "Maximum 50 email addresses allowed")
        .describe("Array of email addresses to get timezone information for"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Checking Google Calendar user timezones",
      done: "Check Google Calendar user timezones",
    },
  },
});

export const GOOGLE_CALENDAR_SERVER = {
  serverInfo: {
    name: "google_calendar",
    version: "1.0.0",
    description: "Access calendar schedules and appointments.",
    authorization: {
      provider: "google_drive",
      supported_use_cases: ["personal_actions", "platform_actions"],
      scope:
        "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events",
    },
    icon: "GcalLogo",
    documentationUrl: "https://docs.dust.tt/docs/google-calendar",
    // Predates the introduction of the rule, would require extensive work to
    // improve, already widely adopted.
    // eslint-disable-next-line dust/no-mcp-server-instructions
    instructions:
      "By default when creating a meeting, (1) set the calling user as the organizer and an attendee (2) check availability for attendees using the check_availability tool (3) use get_user_timezones to check attendee timezones for better scheduling.",
  },
  tools: Object.values(GOOGLE_CALENDAR_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(GOOGLE_CALENDAR_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;

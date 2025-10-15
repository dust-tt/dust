import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import assert from "assert";
import { google } from "googleapis";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// We use a single tool name for monitoring given the high granularity (can be revisited).
const GOOGLE_CALENDAR_TOOL_NAME = "google_calendar";

interface GoogleCalendarEventDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

interface EnrichedGoogleCalendarEventDateTime
  extends GoogleCalendarEventDateTime {
  eventDayOfWeek?: string;
  isAllDay?: boolean;
}

interface GoogleCalendarEvent {
  kind?: string;
  etag?: string;
  id?: string;
  status?: string;
  htmlLink?: string;
  created?: string;
  updated?: string;
  summary?: string;
  description?: string;
  location?: string;
  colorId?: string;
  start?: GoogleCalendarEventDateTime;
  end?: GoogleCalendarEventDateTime;
  endTimeUnspecified?: boolean;
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: GoogleCalendarEventDateTime;
  transparency?: string;
  visibility?: string;
  iCalUID?: string;
  sequence?: number;
  attendees?: Array<{
    id?: string;
    email?: string;
    displayName?: string;
    organizer?: boolean;
    self?: boolean;
    resource?: boolean;
    optional?: boolean;
    responseStatus?: string;
    comment?: string;
    additionalGuests?: number;
  }>;
  attendeesOmitted?: boolean;
  hangoutLink?: string;
  anyoneCanAddSelf?: boolean;
  guestsCanInviteOthers?: boolean;
  guestsCanModify?: boolean;
  guestsCanSeeOtherGuests?: boolean;
  privateCopy?: boolean;
  locked?: boolean;
  reminders?: {
    useDefault?: boolean;
    overrides?: Array<{
      method?: string;
      minutes?: number;
    }>;
  };
  source?: {
    url?: string;
    title?: string;
  };
  eventType?: string;
}

interface EnrichedGoogleCalendarEvent
  extends Omit<GoogleCalendarEvent, "start" | "end"> {
  start?: EnrichedGoogleCalendarEventDateTime;
  end?: EnrichedGoogleCalendarEventDateTime;
}

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = makeInternalMCPServer("google_calendar");

  async function getCalendarClient(authInfo?: AuthInfo) {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return null;
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    return google.calendar({
      version: "v3",
      auth: oauth2Client,
    });
  }

  server.tool(
    "list_calendars",
    "List all calendars accessible by the user. Supports pagination via pageToken.",
    {
      pageToken: z.string().optional().describe("Page token for pagination."),
      maxResults: z
        .number()
        .optional()
        .describe("Maximum number of calendars to return (max 250)."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_CALENDAR_TOOL_NAME,
        agentLoopContext,
        skipAlerting: true,
      },
      async ({ pageToken, maxResults }, { authInfo }) => {
        const calendar = await getCalendarClient(authInfo);
        assert(
          calendar,
          "Calendar client could not be created - it should never happen"
        );

        try {
          const res = await calendar.calendarList.list({
            pageToken,
            maxResults: maxResults ? Math.min(maxResults, 250) : undefined,
          });
          return new Ok([
            { type: "text" as const, text: "Calendars listed successfully" },
            { type: "text" as const, text: JSON.stringify(res.data, null, 2) },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to list calendars"
            )
          );
        }
      }
    )
  );

  server.tool(
    "list_events",
    "List or search events from a Google Calendar. If 'q' is provided, performs a free-text search.",
    {
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
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_CALENDAR_TOOL_NAME,
        agentLoopContext,
        skipAlerting: true,
      },
      async (
        { calendarId = "primary", q, timeMin, timeMax, maxResults, pageToken },
        { authInfo }
      ) => {
        const calendar = await getCalendarClient(authInfo);
        assert(
          calendar,
          "Calendar client could not be created - it should never happen"
        );

        try {
          const res = await calendar.events.list({
            calendarId,
            q,
            timeMin,
            timeMax,
            maxResults: maxResults ? Math.min(maxResults, 2500) : undefined,
            pageToken,
            singleEvents: true,
          });

          const userTimezone = getUserTimezone();

          // Return only essential event fields for context efficiency
          const enrichedData = {
            ...res.data,
            items: res.data.items
              ? res.data.items.map((event) => {
                  const enriched = isGoogleCalendarEvent(event)
                    ? enrichEventWithDayOfWeek(event, userTimezone)
                    : event;
                  return {
                    id: enriched.id,
                    summary: enriched.summary,
                    description: enriched.description,
                    location: enriched.location,
                    start: enriched.start,
                    end: enriched.end,
                    attendees: enriched.attendees?.map((a) => ({
                      email: a.email,
                      displayName: a.displayName,
                      responseStatus: a.responseStatus,
                    })),
                    htmlLink: enriched.htmlLink,
                    status: enriched.status,
                  };
                })
              : undefined,
          };

          return new Ok([
            { type: "text" as const, text: "Events listed successfully" },
            {
              type: "text" as const,
              text: JSON.stringify(enrichedData, null, 2),
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to list/search events"
            )
          );
        }
      }
    )
  );

  server.tool(
    "get_event",
    "Get a single event from a Google Calendar by event ID.",
    {
      calendarId: z
        .string()
        .default("primary")
        .describe("The calendar ID (default: 'primary')."),
      eventId: z.string().describe("The ID of the event to retrieve."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_CALENDAR_TOOL_NAME,
        agentLoopContext,
        skipAlerting: true,
      },
      async ({ calendarId = "primary", eventId }, { authInfo }) => {
        const calendar = await getCalendarClient(authInfo);
        assert(
          calendar,
          "Calendar client could not be created - it should never happen"
        );

        try {
          const res = await calendar.events.get({
            calendarId,
            eventId,
          });

          const userTimezone = getUserTimezone();
          const enrichedEvent = isGoogleCalendarEvent(res.data)
            ? enrichEventWithDayOfWeek(res.data, userTimezone)
            : res.data;

          return new Ok([
            { type: "text" as const, text: "Event fetched successfully" },
            {
              type: "text" as const,
              text: JSON.stringify(enrichedEvent, null, 2),
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(normalizeError(err).message || "Failed to get event")
          );
        }
      }
    )
  );

  server.tool(
    "create_event",
    "Create a new event in a Google Calendar.",
    {
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
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_CALENDAR_TOOL_NAME,
        agentLoopContext,
        skipAlerting: true,
      },
      async (
        {
          calendarId = "primary",
          summary,
          description,
          start,
          end,
          attendees,
          location,
          colorId,
        },
        { authInfo }
      ) => {
        const calendar = await getCalendarClient(authInfo);
        assert(
          calendar,
          "Calendar client could not be created - it should never happen"
        );

        try {
          const event: {
            summary: string;
            description?: string;
            start: { dateTime: string };
            end: { dateTime: string };
            attendees?: { email: string }[];
            location?: string;
            colorId?: string;
          } = {
            summary,
            description,
            start,
            end,
          };
          if (attendees) {
            event.attendees = attendees.map((email: string) => ({ email }));
          }
          if (location) {
            event.location = location;
          }
          if (colorId) {
            event.colorId = colorId;
          }
          const res = await calendar.events.insert({
            calendarId,
            requestBody: event,
          });

          const userTimezone = getUserTimezone();
          const enrichedEvent = isGoogleCalendarEvent(res.data)
            ? enrichEventWithDayOfWeek(res.data, userTimezone)
            : res.data;

          return new Ok([
            { type: "text" as const, text: "Event created successfully" },
            {
              type: "text" as const,
              text: JSON.stringify(enrichedEvent, null, 2),
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to create event"
            )
          );
        }
      }
    )
  );

  server.tool(
    "update_event",
    "Update an existing event in a Google Calendar.",
    {
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
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_CALENDAR_TOOL_NAME,
        agentLoopContext,
        skipAlerting: true,
      },
      async (
        {
          calendarId = "primary",
          eventId,
          summary,
          description,
          start,
          end,
          attendees,
          location,
          colorId,
        },
        { authInfo }
      ) => {
        const calendar = await getCalendarClient(authInfo);
        assert(
          calendar,
          "Calendar client could not be created - it should never happen"
        );

        try {
          const event: {
            summary?: string;
            description?: string;
            start?: { dateTime: string };
            end?: { dateTime: string };
            attendees?: { email: string }[];
            location?: string;
            colorId?: string;
          } = {};
          if (summary) {
            event.summary = summary;
          }
          if (description) {
            event.description = description;
          }
          if (start) {
            event.start = start;
          }
          if (end) {
            event.end = end;
          }
          if (attendees) {
            event.attendees = attendees.map((email: string) => ({ email }));
          }
          if (location) {
            event.location = location;
          }
          if (colorId) {
            event.colorId = colorId;
          }
          const res = await calendar.events.patch({
            calendarId,
            eventId,
            requestBody: event,
          });

          const userTimezone = getUserTimezone();
          const enrichedEvent = isGoogleCalendarEvent(res.data)
            ? enrichEventWithDayOfWeek(res.data, userTimezone)
            : res.data;

          return new Ok([
            { type: "text" as const, text: "Event updated successfully" },
            {
              type: "text" as const,
              text: JSON.stringify(enrichedEvent, null, 2),
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to update event"
            )
          );
        }
      }
    )
  );

  server.tool(
    "delete_event",
    "Delete an event from a Google Calendar.",
    {
      calendarId: z
        .string()
        .default("primary")
        .describe("The calendar ID (default: 'primary')."),
      eventId: z.string().describe("The ID of the event to delete."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_CALENDAR_TOOL_NAME,
        agentLoopContext,
        skipAlerting: true,
      },
      async ({ calendarId = "primary", eventId }, { authInfo }) => {
        const calendar = await getCalendarClient(authInfo);
        assert(
          calendar,
          "Calendar client could not be created - it should never happen"
        );

        try {
          await calendar.events.delete({
            calendarId,
            eventId,
          });
          return new Ok([
            { type: "text" as const, text: "Event deleted successfully" },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to delete event"
            )
          );
        }
      }
    )
  );

  server.tool(
    "check_availability",
    "Check the calendar availability of a specific person for a given time slot.",
    {
      email: z
        .string()
        .describe("The email address of the person to check availability for"),
      startTime: z
        .string()
        .describe("The start time in ISO format (e.g., 2024-03-20T10:00:00Z)"),
      endTime: z
        .string()
        .describe("The end time in ISO format (e.g., 2024-03-20T11:00:00Z)"),
      timeZone: z
        .string()
        .optional()
        .describe(
          "Time zone used in the response. Optional. The default is UTC."
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_CALENDAR_TOOL_NAME,
        agentLoopContext,
        skipAlerting: true,
      },
      async ({ email, startTime, endTime, timeZone }, { authInfo }) => {
        const calendar = await getCalendarClient(authInfo);
        assert(
          calendar,
          "Calendar client could not be created - it should never happen"
        );

        try {
          const res = await calendar.freebusy.query({
            requestBody: {
              timeMin: startTime,
              timeMax: endTime,
              timeZone,
              items: [{ id: email }],
            },
          });

          const calendarData = res.data.calendars?.[email];
          for (const error of calendarData?.errors ?? []) {
            if (error.reason === "notFound") {
              return new Err(
                new MCPError(
                  `Calendar not found for email: ${email}. The calendar may not exist or you may not have access to it.`
                )
              );
            }
            return new Err(
              new MCPError(
                `Error checking calendar availability for ${email}: ${error.reason}`
              )
            );
          }

          const busySlots = calendarData?.busy ?? [];
          const available = busySlots.length === 0;
          return new Ok([
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  available,
                  busySlots: busySlots.map((slot) => ({
                    start: slot.start ?? "",

                    end: slot.end ?? "",
                  })),
                },
                null,
                2
              ),
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message ||
                "Failed to check calendar availability"
            )
          );
        }
      }
    )
  );

  server.tool(
    "get_user_timezones",
    "Get timezone information for multiple users by attempting to access their calendars. Only works for calendars shared with you.",
    {
      emails: z
        .array(z.string())
        .max(50, "Maximum 50 email addresses allowed")
        .describe("Array of email addresses to get timezone information for"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_CALENDAR_TOOL_NAME,
        agentLoopContext,
        skipAlerting: true,
      },
      async ({ emails }, { authInfo }) => {
        const calendar = await getCalendarClient(authInfo);
        assert(
          calendar,
          "Calendar client could not be created - it should never happen"
        );

        const results = [];

        for (const email of emails) {
          try {
            const res = await calendar.calendars.get({ calendarId: email });
            results.push({
              email,
              timeZone: res.data.timeZone,
              calendarAccessible: true,
            });
          } catch (err) {
            results.push({
              email,
              timeZone: null,
              calendarAccessible: false,
              error: normalizeError(err).message,
            });
          }
        }

        return new Ok([
          {
            type: "text" as const,
            text: "User timezone information retrieved",
          },
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                attendees: results,
                accessibleCount: results.filter((r) => r.calendarAccessible)
                  .length,
                totalCount: results.length,
              },
              null,
              2
            ),
          },
        ]);
      }
    )
  );

  function getUserTimezone(): string | null {
    const content = agentLoopContext?.runContext?.conversation?.content;
    if (!content) {
      return null;
    }

    // Find the latest user message to get the timezone
    for (let i = content.length - 1; i >= 0; i--) {
      const contentBlock = content[i];
      if (Array.isArray(contentBlock)) {
        const userMessage = contentBlock.find(
          (msg) =>
            msg.type === "user_message" &&
            "context" in msg &&
            msg.context &&
            "timezone" in msg.context
        );
        if (
          userMessage &&
          "context" in userMessage &&
          userMessage.context &&
          "timezone" in userMessage.context
        ) {
          return userMessage.context.timezone;
        }
      }
    }

    return null;
  }

  return server;
};

// Type guard to safely convert googleapis event to our interface
function isGoogleCalendarEvent(event: any): event is GoogleCalendarEvent {
  return event && typeof event === "object";
}

function enrichEventWithDayOfWeek(
  event: GoogleCalendarEvent,
  userTimezone: string | null
): EnrichedGoogleCalendarEvent {
  const enrichedEvent: EnrichedGoogleCalendarEvent = { ...event };

  if (event.start?.dateTime) {
    const startDate = new Date(event.start.dateTime);
    enrichedEvent.start = {
      ...event.start,
      eventDayOfWeek: startDate.toLocaleDateString("en-US", {
        weekday: "long",
        timeZone: userTimezone ?? undefined,
      }),
      isAllDay: false,
    };
  } else if (event.start?.date) {
    // Handle all-day events, intentionally timeZone agnostic
    const startDate = new Date(event.start.date);
    enrichedEvent.start = {
      ...event.start,
      eventDayOfWeek: startDate.toLocaleDateString("en-US", {
        weekday: "long",
      }),
      isAllDay: true,
    };
  }

  if (event.end?.dateTime) {
    const endDate = new Date(event.end.dateTime);
    enrichedEvent.end = {
      ...event.end,
      eventDayOfWeek: endDate.toLocaleDateString("en-US", {
        weekday: "long",
        timeZone: userTimezone ?? undefined,
      }),
      isAllDay: false,
    };
  } else if (event.end?.date) {
    // Handle all-day events, intentionally timeZone agnostic
    const endDate = new Date(event.end.date);
    enrichedEvent.end = {
      ...event.end,
      eventDayOfWeek: endDate.toLocaleDateString("en-US", {
        weekday: "long",
      }),
      isAllDay: true,
    };
  }

  return enrichedEvent;
}

export default createServer;

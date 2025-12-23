import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import assert from "assert";
import { randomUUID } from "crypto";
import { google } from "googleapis";
import { DateTime, Interval } from "luxon";
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

interface EnrichedGoogleCalendarEventDateTime extends GoogleCalendarEventDateTime {
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
  conferenceData?: {
    createRequest?: {
      requestId?: string;
      conferenceSolutionKey?: {
        type?: string;
      };
    };
    entryPoints?: Array<{
      entryPointType?: string;
      uri?: string;
      label?: string;
      pin?: string;
      accessCode?: string;
      meetingCode?: string;
      passcode?: string;
      password?: string;
    }>;
    conferenceSolution?: {
      key?: {
        type?: string;
      };
      name?: string;
      iconUri?: string;
    };
    conferenceId?: string;
    signature?: string;
    notes?: string;
  };
}

interface EnrichedGoogleCalendarEvent extends Omit<
  GoogleCalendarEvent,
  "start" | "end"
> {
  start?: EnrichedGoogleCalendarEventDateTime;
  end?: EnrichedGoogleCalendarEventDateTime;
}

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
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

          // Enrich events with day of week and format as text
          const enrichedEvents: EnrichedGoogleCalendarEvent[] = res.data.items
            ? res.data.items
                .filter(isGoogleCalendarEvent)
                .map((event) => enrichEventWithDayOfWeek(event, userTimezone))
            : [];

          const eventCount = enrichedEvents.length;
          const summaryText = `Found ${eventCount} event${eventCount !== 1 ? "s" : ""}${res.data.nextPageToken ? " (more available)" : ""}`;
          const formattedText = formatEventsListAsText(
            enrichedEvents,
            summaryText
          );

          return new Ok([{ type: "text" as const, text: formattedText }]);
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
            : null;

          if (!enrichedEvent) {
            return new Err(
              new MCPError("Invalid event data returned from API")
            );
          }

          const formattedText = formatEventAsText(enrichedEvent);

          return new Ok([{ type: "text" as const, text: formattedText }]);
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
      createConference: z
        .boolean()
        .default(true)
        .describe(
          "Whether to create a conference (Google Meet) for the event. Defaults to true."
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_CALENDAR_TOOL_NAME,
        agentLoopContext,
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
          createConference = true,
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
            conferenceData?: {
              createRequest: {
                requestId: string;
                conferenceSolutionKey: {
                  type: string;
                };
              };
            };
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
          if (createConference) {
            const requestId = `conference-${randomUUID()}`;
            event.conferenceData = {
              createRequest: {
                requestId,
                conferenceSolutionKey: {
                  type: "hangoutsMeet",
                },
              },
            };
          }
          const res = await calendar.events.insert({
            calendarId,
            requestBody: event,
            conferenceDataVersion: 1,
          });

          const userTimezone = getUserTimezone();
          const enrichedEvent = isGoogleCalendarEvent(res.data)
            ? enrichEventWithDayOfWeek(res.data, userTimezone)
            : null;

          if (!enrichedEvent) {
            return new Err(
              new MCPError("Invalid event data returned from API")
            );
          }

          const formattedText = formatEventAsText(enrichedEvent);

          return new Ok([
            {
              type: "text" as const,
              text: `Event created successfully\n\n${formattedText}`,
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
      createConference: z
        .boolean()
        .optional()
        .describe(
          "Whether to create a conference (Google Meet) for the event. If not provided, existing conference settings are preserved."
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_CALENDAR_TOOL_NAME,
        agentLoopContext,
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
          createConference,
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
            conferenceData?: {
              createRequest: {
                requestId: string;
                conferenceSolutionKey: {
                  type: string;
                };
              };
            };
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
          if (createConference !== undefined) {
            if (createConference) {
              const requestId = `conference-${randomUUID()}`;
              event.conferenceData = {
                createRequest: {
                  requestId,
                  conferenceSolutionKey: {
                    type: "hangoutsMeet",
                  },
                },
              };
            }
          }
          const res = await calendar.events.patch({
            calendarId,
            eventId,
            requestBody: event,
            conferenceDataVersion: 1,
          });

          const userTimezone = getUserTimezone();
          const enrichedEvent = isGoogleCalendarEvent(res.data)
            ? enrichEventWithDayOfWeek(res.data, userTimezone)
            : null;

          if (!enrichedEvent) {
            return new Err(
              new MCPError("Invalid event data returned from API")
            );
          }

          const formattedText = formatEventAsText(enrichedEvent);

          return new Ok([
            {
              type: "text" as const,
              text: `Event updated successfully\n\n${formattedText}`,
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
    "Compute combined availability across multiple participants within a date range.",
    {
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
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_CALENDAR_TOOL_NAME,
        agentLoopContext,
      },
      async (
        { participants, startTimeRange, endTimeRange, excludeWeekends = false },
        { authInfo }
      ) => {
        const calendar = await getCalendarClient(authInfo);
        assert(
          calendar,
          "Calendar client could not be created - it should never happen"
        );

        try {
          const rangeStart = DateTime.fromISO(startTimeRange, { zone: "utc" });
          const rangeEnd = DateTime.fromISO(endTimeRange, { zone: "utc" });

          if (!rangeStart.isValid || !rangeEnd.isValid) {
            return new Err(
              new MCPError(
                "Invalid startTimeRange or endTimeRange. Provide ISO 8601 timestamps."
              )
            );
          }

          if (rangeEnd.toMillis() <= rangeStart.toMillis()) {
            return new Err(
              new MCPError("endTimeRange must be later than startTimeRange.")
            );
          }

          const rangeInterval = Interval.fromDateTimes(rangeStart, rangeEnd);

          const rangeStartDate = rangeInterval.start;
          const rangeEndDate = rangeInterval.end;
          if (!rangeStartDate || !rangeEndDate) {
            return new Err(new MCPError("Invalid time range provided."));
          }

          const res = await calendar.freebusy.query({
            requestBody: {
              timeMin: rangeStartDate.toISO(),
              timeMax: rangeEndDate.toISO(),
              items: participants.map((p) => ({ id: p.email })),
            },
          });

          // Aggregate all busy intervals from API response
          const allBusyIntervals: Interval[] = [];
          for (const participant of participants) {
            const calendarData = res.data.calendars?.[participant.email];
            for (const error of calendarData?.errors ?? []) {
              if (error.reason === "notFound") {
                return new Err(
                  new MCPError(
                    `Calendar not found for email: ${participant.email}. The calendar may not exist or you may not have access to it.`
                  )
                );
              }
              return new Err(
                new MCPError(
                  `Error checking calendar availability for ${participant.email}: ${error.reason}`
                )
              );
            }

            const busyIntervals =
              calendarData?.busy
                ?.map((slot) => {
                  const start = slot.start ?? rangeStartDate.toISO();
                  const end = slot.end ?? rangeEndDate.toISO();
                  const interval = Interval.fromDateTimes(
                    DateTime.fromISO(start, { zone: "utc" }),
                    DateTime.fromISO(end, { zone: "utc" })
                  );
                  return interval.isValid && !interval.isEmpty()
                    ? interval
                    : null;
                })
                .filter((interval): interval is Interval =>
                  Boolean(interval)
                ) ?? [];
            allBusyIntervals.push(...busyIntervals);
          }

          // Add unavailable intervals (time outside each participant's windows)
          for (const participant of participants) {
            const unavailableIntervals = buildUnavailableIntervals(
              rangeInterval,
              participant,
              excludeWeekends
            );
            allBusyIntervals.push(...unavailableIntervals);
          }

          const combinedBusyIntervals = mergeIntervals(allBusyIntervals);
          const availabilitySlots = computeAvailability(
            rangeInterval,
            combinedBusyIntervals
          );

          const formattedText = formatAvailabilitySummary({
            participants,
            range: rangeInterval,
            availabilitySlots,
            excludeWeekends,
          });

          return new Ok([{ type: "text" as const, text: formattedText }]);
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
}

// Type guard to safely convert googleapis event to our interface
function isGoogleCalendarEvent(event: any): event is GoogleCalendarEvent {
  return event && typeof event === "object";
}

function formatDayOfWeek(date: Date, timezone?: string): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: timezone,
  });
}

function formatDate(date: Date, timezone?: string): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
  });
}

function formatTime(date: Date, timezone?: string): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });
}

function enrichEventWithDayOfWeek(
  event: GoogleCalendarEvent,
  userTimezone: string | null
): EnrichedGoogleCalendarEvent {
  const enrichedEvent: EnrichedGoogleCalendarEvent = { ...event };
  const timezone = userTimezone ?? undefined;

  if (event.start?.dateTime) {
    const startDate = new Date(event.start.dateTime);
    enrichedEvent.start = {
      ...event.start,
      eventDayOfWeek: formatDayOfWeek(startDate, timezone),
      isAllDay: false,
    };
  } else if (event.start?.date) {
    // Handle all-day events, intentionally timeZone agnostic
    const startDate = new Date(event.start.date);
    enrichedEvent.start = {
      ...event.start,
      eventDayOfWeek: formatDayOfWeek(startDate),
      isAllDay: true,
    };
  }

  if (event.end?.dateTime) {
    const endDate = new Date(event.end.dateTime);
    enrichedEvent.end = {
      ...event.end,
      eventDayOfWeek: formatDayOfWeek(endDate, timezone),
      isAllDay: false,
    };
  } else if (event.end?.date) {
    // Handle all-day events, intentionally timeZone agnostic
    const endDate = new Date(event.end.date);
    enrichedEvent.end = {
      ...event.end,
      eventDayOfWeek: formatDayOfWeek(endDate),
      isAllDay: true,
    };
  }

  return enrichedEvent;
}

function formatEventAsText(event: EnrichedGoogleCalendarEvent): string {
  const lines: string[] = [];

  if (event.summary) {
    lines.push(`Title: ${event.summary}`);
  }

  if (event.start) {
    const start = event.start;
    if (start.eventDayOfWeek) {
      if (start.isAllDay) {
        lines.push(`Date: ${start.eventDayOfWeek}, ${start.date}`);
      } else {
        if (start.dateTime) {
          const startDate = new Date(start.dateTime);
          const timezone = start.timeZone ?? undefined;
          const timeStr = formatTime(startDate, timezone);
          const dateStr = formatDate(startDate, timezone);
          lines.push(
            `Start: ${start.eventDayOfWeek}, ${dateStr} at ${timeStr}${start.timeZone ? ` (${start.timeZone})` : ""}`
          );
        }
      }
    } else {
      lines.push(
        `Start: ${start.dateTime ?? start.date}${start.timeZone ? ` (${start.timeZone})` : ""}`
      );
    }
  }

  if (event.end) {
    const end = event.end;
    if (end.eventDayOfWeek) {
      if (end.isAllDay) {
        lines.push(`End: ${end.eventDayOfWeek}, ${end.date}`);
      } else {
        if (end.dateTime) {
          const endDate = new Date(end.dateTime);
          const timezone = end.timeZone ?? undefined;
          const timeStr = formatTime(endDate, timezone);
          const dateStr = formatDate(endDate, timezone);
          lines.push(
            `End: ${end.eventDayOfWeek}, ${dateStr} at ${timeStr}${end.timeZone ? ` (${end.timeZone})` : ""}`
          );
        }
      }
    } else {
      lines.push(
        `End: ${end.dateTime ?? end.date}${end.timeZone ? ` (${end.timeZone})` : ""}`
      );
    }
  }

  if (event.location) {
    lines.push(`Location: ${event.location}`);
  }

  if (event.description) {
    lines.push(`Description: ${event.description}`);
  }

  if (event.attendees && event.attendees.length > 0) {
    const attendeeList = event.attendees
      .map((a) => {
        const name = a.displayName ?? a.email ?? "Unknown";
        const status = a.responseStatus ? ` (${a.responseStatus})` : "";
        return `${name}${status}`;
      })
      .join(", ");
    lines.push(`Attendees: ${attendeeList}`);
  }

  if (event.status) {
    lines.push(`Status: ${event.status}`);
  }

  if (event.htmlLink) {
    lines.push(`Link: ${event.htmlLink}`);
  }

  if (event.id) {
    lines.push(`Event ID: ${event.id}`);
  }

  return lines.join("\n");
}

function formatEventsListAsText(
  events: EnrichedGoogleCalendarEvent[],
  summary?: string
): string {
  if (events.length === 0) {
    return summary ? `${summary}\n\nNo events found.` : "No events found.";
  }

  const lines: string[] = [];
  if (summary) {
    lines.push(summary);
    lines.push("");
  }

  events.forEach((event, index) => {
    if (index > 0) {
      lines.push("\n---\n");
    }
    lines.push(formatEventAsText(event));
  });

  return lines.join("\n");
}

interface AvailabilityParticipant {
  email: string;
  timezone: string;
  dailyTimeWindowStart?: string;
  dailyTimeWindowEnd?: string;
}

function buildUnavailableIntervals(
  range: Interval,
  participant: AvailabilityParticipant,
  excludeWeekends: boolean
): Interval[] {
  const rangeStartDate = range.start;
  const rangeEndDate = range.end;
  if (!rangeStartDate || !rangeEndDate) {
    return [];
  }

  // If no daily windows or weekend exclusion, participant is available for entire range
  if (
    !participant.dailyTimeWindowStart &&
    !participant.dailyTimeWindowEnd &&
    !excludeWeekends
  ) {
    return [];
  }

  const unavailable: Interval[] = [];
  const startInZone = rangeStartDate.setZone(participant.timezone);
  const endInZone = rangeEndDate.setZone(participant.timezone);

  let cursor = startInZone.startOf("day");

  while (cursor < endInZone) {
    const dayStart = cursor;
    const dayEnd = cursor.plus({ days: 1 });

    // Skip weekends if excludeWeekends is true
    if (excludeWeekends && (dayStart.weekday === 6 || dayStart.weekday === 7)) {
      // Mark entire weekend day as unavailable
      const unavailableStart = DateTime.max(dayStart, startInZone);
      const unavailableEnd = DateTime.min(dayEnd, endInZone);
      if (unavailableStart < unavailableEnd) {
        unavailable.push(
          Interval.fromDateTimes(
            unavailableStart.toUTC(),
            unavailableEnd.toUTC()
          )
        );
      }
      cursor = dayEnd;
      continue;
    }

    // If no daily windows, participant is available all day
    if (!participant.dailyTimeWindowStart && !participant.dailyTimeWindowEnd) {
      cursor = dayEnd;
      continue;
    }

    const windowStart = participant.dailyTimeWindowStart
      ? applyTimeToDateTime(dayStart, participant.dailyTimeWindowStart)
      : dayStart;
    const windowEnd = participant.dailyTimeWindowEnd
      ? applyTimeToDateTime(dayStart, participant.dailyTimeWindowEnd)
      : dayEnd;

    // Add interval before window start
    if (participant.dailyTimeWindowStart) {
      const beforeStart = DateTime.max(dayStart, startInZone);
      const beforeEnd = DateTime.min(windowStart, endInZone);
      if (beforeStart < beforeEnd) {
        unavailable.push(
          Interval.fromDateTimes(beforeStart.toUTC(), beforeEnd.toUTC())
        );
      }
    }

    // Add interval after window end
    if (participant.dailyTimeWindowEnd) {
      const afterStart = DateTime.max(windowEnd, startInZone);
      const afterEnd = DateTime.min(dayEnd, endInZone);
      if (afterStart < afterEnd) {
        unavailable.push(
          Interval.fromDateTimes(afterStart.toUTC(), afterEnd.toUTC())
        );
      }
    }

    cursor = dayEnd;
  }

  return unavailable;
}

function applyTimeToDateTime(base: DateTime, timeStr: string): DateTime {
  const [hourStr, minuteStr = "0", secondStr = "0"] = timeStr.split(":");
  return base.set({
    hour: Number(hourStr),
    minute: Number(minuteStr),
    second: Number(secondStr),
    millisecond: 0,
  });
}

function isValidInterval(interval: Interval | null): interval is Interval {
  if (!interval) {
    return false;
  }
  return (
    interval.isValid &&
    !interval.isEmpty() &&
    interval.start !== null &&
    interval.end !== null
  );
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter(isValidInterval)
    .sort((a, b) => a.start!.toMillis() - b.start!.toMillis());

  if (sorted.length === 0) {
    return [];
  }

  const merged: Interval[] = [];
  for (const interval of sorted) {
    if (merged.length === 0) {
      merged.push(interval);
      continue;
    }

    const prev = merged[merged.length - 1];
    if (prev.end! >= interval.start!) {
      merged[merged.length - 1] = Interval.fromDateTimes(
        prev.start!,
        DateTime.max(prev.end!, interval.end!)
      );
    } else {
      merged.push(interval);
    }
  }

  return merged;
}

function computeAvailability(
  range: Interval,
  busyIntervals: Interval[]
): Interval[] {
  if (!isValidInterval(range)) {
    return [];
  }

  if (busyIntervals.length === 0) {
    return [range];
  }

  const availability: Interval[] = [];
  const rangeStart = range.start;
  const rangeEnd = range.end;
  if (!rangeStart || !rangeEnd) {
    return [];
  }
  let cursor: DateTime = rangeStart;

  for (const busy of busyIntervals) {
    const busyStart = busy.start;
    const busyEnd = busy.end;
    if (!busyStart || !busyEnd) {
      continue;
    }

    // Clamp to range boundaries
    const clampedStart = DateTime.max(busyStart, rangeStart);
    const clampedEnd = DateTime.min(busyEnd, rangeEnd);

    if (clampedStart >= clampedEnd) {
      continue;
    }

    if (cursor < clampedStart) {
      availability.push(Interval.fromDateTimes(cursor, clampedStart));
    }
    cursor = DateTime.max(cursor, clampedEnd);
  }

  if (cursor < rangeEnd) {
    availability.push(Interval.fromDateTimes(cursor, rangeEnd));
  }

  return mergeIntervals(availability);
}

function formatAvailabilitySummary({
  participants,
  range,
  availabilitySlots,
  excludeWeekends,
}: {
  participants: AvailabilityParticipant[];
  range: Interval;
  availabilitySlots: Interval[];
  excludeWeekends: boolean;
}): string {
  const lines: string[] = [];
  const referenceTimezone = participants[0]?.timezone ?? "UTC";
  const rangeStartDate = range.start;
  const rangeEndDate = range.end;

  if (rangeStartDate && rangeEndDate) {
    lines.push(
      `Combined availability between ${formatDateTime(
        rangeStartDate,
        referenceTimezone
      )} and ${formatDateTime(rangeEndDate, referenceTimezone)}`
    );
  } else {
    lines.push("Combined availability for requested range:");
  }
  lines.push("");
  lines.push("Participants:");
  participants.forEach((participant) => {
    const windowDescription =
      (participant.dailyTimeWindowStart ?? participant.dailyTimeWindowEnd)
        ? `, window: ${participant.dailyTimeWindowStart ?? "00:00"} - ${
            participant.dailyTimeWindowEnd ?? "24:00"
          }`
        : "";
    lines.push(
      `- ${participant.email} (${participant.timezone}${windowDescription})`
    );
  });

  lines.push("");
  if (excludeWeekends) {
    lines.push("Weekends excluded from consideration.");
    lines.push("");
  }

  if (availabilitySlots.length === 0) {
    lines.push("No shared availability found for the requested range.");
    return lines.join("\n");
  }

  lines.push("Shared availability (all participants free):");
  const maxSlotsToDisplay = 10;
  availabilitySlots.slice(0, maxSlotsToDisplay).forEach((slot, index) => {
    lines.push(
      `  ${index + 1}. ${formatIntervalForDisplay(slot, referenceTimezone)}`
    );
  });

  if (availabilitySlots.length > maxSlotsToDisplay) {
    lines.push(
      `  ...and ${availabilitySlots.length - maxSlotsToDisplay} more slot${
        availabilitySlots.length - maxSlotsToDisplay === 1 ? "" : "s"
      }.`
    );
  }

  return lines.join("\n");
}

function formatIntervalForDisplay(
  interval: Interval,
  timezone: string
): string {
  if (!interval.start || !interval.end) {
    return "Unknown interval";
  }
  const start = formatDateTime(interval.start, timezone);
  const end = formatDateTime(interval.end, timezone);
  return `${start} → ${end}`;
}

function formatDateTime(date: DateTime, timezone: string): string {
  return date.setZone(timezone).toFormat("EEE, MMM d yyyy 'at' HH:mm ZZZZ");
}

export default createServer;

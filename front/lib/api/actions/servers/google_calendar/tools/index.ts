import assert from "assert";
import { randomUUID } from "crypto";
import { google } from "googleapis";
import { DateTime, Interval } from "luxon";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  buildUnavailableIntervals,
  computeAvailability,
  enrichEventWithDayOfWeek,
  formatAvailabilitySummary,
  formatEventAsText,
  formatEventsListAsText,
  getCalendarClient,
  getUserTimezone,
  isGoogleCalendarEvent,
  mergeIntervals,
} from "@app/lib/api/actions/servers/google_calendar/helpers";
import { GOOGLE_CALENDAR_TOOLS_METADATA } from "@app/lib/api/actions/servers/google_calendar/metadata";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const handlers: ToolHandlers<typeof GOOGLE_CALENDAR_TOOLS_METADATA> = {
  list_calendars: async ({ pageToken, maxResults }, extra) => {
    const accessToken = extra.authInfo?.token;
    assert(accessToken, "No access token provided");

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

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
        new MCPError(normalizeError(err).message || "Failed to list calendars")
      );
    }
  },

  list_events: async (
    { calendarId = "primary", q, timeMin, timeMax, maxResults, pageToken },
    extra
  ) => {
    const calendar = await getCalendarClient(extra.authInfo);
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

      const userTimezone = getUserTimezone(extra.agentLoopContext);

      const enrichedEvents = res.data.items
        ? res.data.items
            .filter(isGoogleCalendarEvent)
            .map((event) => enrichEventWithDayOfWeek(event, userTimezone))
        : [];

      const eventCount = enrichedEvents.length;
      const summaryText = `Found ${eventCount} event${eventCount !== 1 ? "s" : ""}${res.data.nextPageToken ? " (more available)" : ""}`;
      const formattedText = formatEventsListAsText(enrichedEvents, summaryText);

      return new Ok([{ type: "text" as const, text: formattedText }]);
    } catch (err) {
      return new Err(
        new MCPError(
          normalizeError(err).message || "Failed to list/search events"
        )
      );
    }
  },

  get_event: async ({ calendarId = "primary", eventId }, extra) => {
    const calendar = await getCalendarClient(extra.authInfo);
    assert(
      calendar,
      "Calendar client could not be created - it should never happen"
    );

    try {
      const res = await calendar.events.get({
        calendarId,
        eventId,
      });

      const userTimezone = getUserTimezone(extra.agentLoopContext);
      const enrichedEvent = isGoogleCalendarEvent(res.data)
        ? enrichEventWithDayOfWeek(res.data, userTimezone)
        : null;

      if (!enrichedEvent) {
        return new Err(new MCPError("Invalid event data returned from API"));
      }

      const formattedText = formatEventAsText(enrichedEvent);

      return new Ok([{ type: "text" as const, text: formattedText }]);
    } catch (err) {
      return new Err(
        new MCPError(normalizeError(err).message || "Failed to get event")
      );
    }
  },

  create_event: async (
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
    extra
  ) => {
    const calendar = await getCalendarClient(extra.authInfo);
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

      const userTimezone = getUserTimezone(extra.agentLoopContext);
      const enrichedEvent = isGoogleCalendarEvent(res.data)
        ? enrichEventWithDayOfWeek(res.data, userTimezone)
        : null;

      if (!enrichedEvent) {
        return new Err(new MCPError("Invalid event data returned from API"));
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
        new MCPError(normalizeError(err).message || "Failed to create event")
      );
    }
  },

  update_event: async (
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
    extra
  ) => {
    const calendar = await getCalendarClient(extra.authInfo);
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

      const userTimezone = getUserTimezone(extra.agentLoopContext);
      const enrichedEvent = isGoogleCalendarEvent(res.data)
        ? enrichEventWithDayOfWeek(res.data, userTimezone)
        : null;

      if (!enrichedEvent) {
        return new Err(new MCPError("Invalid event data returned from API"));
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
        new MCPError(normalizeError(err).message || "Failed to update event")
      );
    }
  },

  delete_event: async ({ calendarId = "primary", eventId }, extra) => {
    const calendar = await getCalendarClient(extra.authInfo);
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
        new MCPError(normalizeError(err).message || "Failed to delete event")
      );
    }
  },

  check_availability: async (
    { participants, startTimeRange, endTimeRange, excludeWeekends = false },
    extra
  ) => {
    const calendar = await getCalendarClient(extra.authInfo);
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
              return interval.isValid && !interval.isEmpty() ? interval : null;
            })
            .filter((interval): interval is Interval => Boolean(interval)) ??
          [];
        allBusyIntervals.push(...busyIntervals);
      }

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
          normalizeError(err).message || "Failed to check calendar availability"
        )
      );
    }
  },

  get_user_timezones: async ({ emails }, extra) => {
    const calendar = await getCalendarClient(extra.authInfo);
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
            accessibleCount: results.filter((r) => r.calendarAccessible).length,
            totalCount: results.length,
          },
          null,
          2
        ),
      },
    ]);
  },
};

export const TOOLS = buildTools(GOOGLE_CALENDAR_TOOLS_METADATA, handlers);

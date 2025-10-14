import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import * as OutlookApi from "@app/lib/actions/mcp_internal_actions/servers/outlook/outlook_api_helper";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";

const OUTLOOK_CALENDAR_TOOL_NAME = "outlook_calendar";

const createServer = (auth: Authenticator): McpServer => {
  const server = makeInternalMCPServer("outlook_calendar");

  server.tool(
    "get_user_timezone",
    "Get the user's configured timezone from their Outlook mailbox settings. This should be called before creating, updating, or searching for events to ensure proper timezone handling.",
    {},
    withToolLogging(
      auth,
      { toolNameForMonitoring: OUTLOOK_CALENDAR_TOOL_NAME },
      async (_, { authInfo }) => {
        const accessToken = authInfo?.token;
        if (!accessToken) {
          return new Err(new MCPError("Authentication required"));
        }

        const result = await OutlookApi.getUserTimezone(accessToken);

        if (typeof result === "string") {
          return new Ok([
            {
              type: "text" as const,
              text: "User timezone retrieved successfully",
            },
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  timezone: result,
                  description:
                    "Use this timezone value when creating, updating, or searching for calendar events to ensure times are displayed correctly.",
                },
                null,
                2
              ),
            },
          ]);
        } else {
          return new Err(new MCPError(result.error));
        }
      }
    )
  );

  server.tool(
    "list_calendars",
    "List all calendars accessible by the user in Outlook.",
    {
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
    withToolLogging(
      auth,
      { toolNameForMonitoring: OUTLOOK_CALENDAR_TOOL_NAME },
      async ({ top = 250, skip = 0, userTimezone }, { authInfo }) => {
        const accessToken = authInfo?.token;
        if (!accessToken) {
          return new Err(new MCPError("Authentication required"));
        }

        const result = await OutlookApi.listCalendars(accessToken, {
          top,
          skip,
          userTimezone,
        });

        if ("error" in result) {
          return new Err(new MCPError(result.error));
        }

        return new Ok([
          { type: "text" as const, text: "Calendars listed successfully" },
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ]);
      }
    )
  );

  server.tool(
    "list_events",
    "List or search events from an Outlook Calendar. Supports filtering and searching. For accurate timezone handling, first call get_user_timezone and pass the timezone parameter.",
    {
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
    withToolLogging(
      auth,
      { toolNameForMonitoring: OUTLOOK_CALENDAR_TOOL_NAME },
      async (
        {
          calendarId,
          search,
          startTime,
          endTime,
          top = 50,
          skip = 0,
          userTimezone,
        },
        { authInfo }
      ) => {
        const accessToken = authInfo?.token;
        if (!accessToken) {
          return new Err(new MCPError("Authentication required"));
        }

        const result = await OutlookApi.listEvents(accessToken, {
          calendarId,
          search,
          startTime,
          endTime,
          top,
          skip,
          userTimezone,
        });

        if ("error" in result) {
          return new Err(new MCPError(result.error));
        }

        return new Ok([
          { type: "text" as const, text: "Events searched successfully" },
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ]);
      }
    )
  );

  server.tool(
    "get_event",
    "Get a single event from an Outlook Calendar by event ID.",
    {
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
    withToolLogging(
      auth,
      { toolNameForMonitoring: OUTLOOK_CALENDAR_TOOL_NAME },
      async ({ calendarId, eventId, userTimezone }, { authInfo }) => {
        const accessToken = authInfo?.token;
        if (!accessToken) {
          return new Err(new MCPError("Authentication required"));
        }

        const result = await OutlookApi.getEvent(accessToken, {
          calendarId,
          eventId,
          userTimezone,
        });

        if ("error" in result) {
          return new Err(new MCPError(result.error));
        }

        return new Ok([
          { type: "text" as const, text: "Event fetched successfully" },
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ]);
      }
    )
  );

  server.tool(
    "create_event",
    "Create a new event in an Outlook Calendar. Call get_user_timezone first and pass the userTimezone parameter for proper timezone handling.",
    {
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
    withToolLogging(
      auth,
      { toolNameForMonitoring: OUTLOOK_CALENDAR_TOOL_NAME },
      async (
        {
          calendarId,
          subject,
          body,
          contentType = "text",
          startDateTime,
          endDateTime,
          timeZone = "UTC",
          attendees,
          location,
          isAllDay = false,
          importance = "normal",
          showAs = "busy",
          userTimezone,
        },
        { authInfo }
      ) => {
        const accessToken = authInfo?.token;
        if (!accessToken) {
          return new Err(new MCPError("Authentication required"));
        }

        const result = await OutlookApi.createEvent(accessToken, {
          calendarId,
          subject,
          body,
          contentType,
          startDateTime,
          endDateTime,
          timeZone,
          attendees,
          location,
          isAllDay,
          importance,
          showAs,
          userTimezone,
        });

        if ("error" in result) {
          return new Err(new MCPError(result.error));
        }

        return new Ok([
          { type: "text" as const, text: "Event created successfully" },
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ]);
      }
    )
  );

  server.tool(
    "update_event",
    "Update an existing event in an Outlook Calendar. Call get_user_timezone first and pass the userTimezone parameter for proper timezone handling.",
    {
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
    withToolLogging(
      auth,
      { toolNameForMonitoring: OUTLOOK_CALENDAR_TOOL_NAME },
      async (
        {
          calendarId,
          eventId,
          subject,
          body,
          contentType,
          startDateTime,
          endDateTime,
          timeZone,
          attendees,
          location,
          isAllDay,
          importance,
          showAs,
          userTimezone,
        },
        { authInfo }
      ) => {
        const accessToken = authInfo?.token;
        if (!accessToken) {
          return new Err(new MCPError("Authentication required"));
        }

        const result = await OutlookApi.updateEvent(accessToken, {
          calendarId,
          eventId,
          subject,
          body,
          contentType,
          startDateTime,
          endDateTime,
          timeZone,
          attendees,
          location,
          isAllDay,
          importance,
          showAs,
          userTimezone,
        });

        if ("error" in result) {
          return new Err(new MCPError(result.error));
        }

        return new Ok([
          { type: "text" as const, text: "Event updated successfully" },
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ]);
      }
    )
  );

  server.tool(
    "delete_event",
    "Delete an event from an Outlook Calendar.",
    {
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
    withToolLogging(
      auth,
      { toolNameForMonitoring: OUTLOOK_CALENDAR_TOOL_NAME },
      async ({ calendarId, eventId, userTimezone }, { authInfo }) => {
        const accessToken = authInfo?.token;
        if (!accessToken) {
          return new Err(new MCPError("Authentication required"));
        }

        const result = await OutlookApi.deleteEvent(accessToken, {
          calendarId,
          eventId,
          userTimezone,
        });

        if ("error" in result) {
          return new Err(new MCPError(result.error));
        }

        return new Ok([
          { type: "text" as const, text: "Event deleted successfully" },
          { type: "text" as const, text: JSON.stringify("", null, 2) },
        ]);
      }
    )
  );

  server.tool(
    "check_availability",
    "Check the calendar availability of specific people for a given time slot using Outlook Calendar.",
    {
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
    withToolLogging(
      auth,
      { toolNameForMonitoring: OUTLOOK_CALENDAR_TOOL_NAME },
      async (
        { emails, startTime, endTime, intervalInMinutes = 60, userTimezone },
        { authInfo }
      ) => {
        const accessToken = authInfo?.token;
        if (!accessToken) {
          return new Err(new MCPError("Authentication required"));
        }

        const result = await OutlookApi.checkAvailability(accessToken, {
          emails,
          startTime,
          endTime,
          intervalInMinutes,
          userTimezone,
        });

        if ("error" in result) {
          return new Err(new MCPError(result.error));
        }

        return new Ok([
          { type: "text" as const, text: "Availability checked successfully" },
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ]);
      }
    )
  );

  return server;
};

export default createServer;

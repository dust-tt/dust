import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import * as OutlookApi from "@app/lib/actions/mcp_internal_actions/servers/outlook/outlook_api_helper";
import {
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "outlook_calendar",
  version: "1.0.0",
  description: "Tools for managing Outlook calendars and events.",
  authorization: {
    provider: "microsoft_tools" as const,
    supported_use_cases: ["personal_actions"] as const,
    scope:
      "Calendars.ReadWrite Calendars.ReadWrite.Shared User.Read offline_access" as const,
  },
  icon: "OutlookLogo",
  documentationUrl: "https://docs.dust.tt/docs/outlook-calendar-tool-setup",
};

const createServer = (): McpServer => {
  const server = new McpServer(serverInfo);

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
    },
    async ({ top = 250, skip = 0 }, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return makeMCPToolTextError("Authentication required");
      }

      const result = await OutlookApi.listCalendars(accessToken, { top, skip });

      if ("error" in result) {
        return makeMCPToolTextError(result.error);
      }

      return makeMCPToolJSONSuccess({
        message: "Calendars listed successfully",
        result,
      });
    }
  );

  server.tool(
    "list_events",
    "List or search events from an Outlook Calendar. Supports filtering and searching.",
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
    },
    async (
      { calendarId, search, startTime, endTime, top = 50, skip = 0 },
      { authInfo }
    ) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return makeMCPToolTextError("Authentication required");
      }

      const result = await OutlookApi.listEvents(accessToken, {
        calendarId,
        search,
        startTime,
        endTime,
        top,
        skip,
      });

      if ("error" in result) {
        return makeMCPToolTextError(result.error);
      }

      return makeMCPToolJSONSuccess({
        message: "Events searched successfully",
        result,
      });
    }
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
    },
    async ({ calendarId, eventId }, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return makeMCPToolTextError("Authentication required");
      }

      const result = await OutlookApi.getEvent(accessToken, {
        calendarId,
        eventId,
      });

      if ("error" in result) {
        return makeMCPToolTextError(result.error);
      }

      return makeMCPToolJSONSuccess({
        message: "Event fetched successfully",
        result,
      });
    }
  );

  server.tool(
    "create_event",
    "Create a new event in an Outlook Calendar.",
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
    },
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
      },
      { authInfo }
    ) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return makeMCPToolTextError("Authentication required");
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
      });

      if ("error" in result) {
        return makeMCPToolTextError(result.error);
      }

      return makeMCPToolJSONSuccess({
        message: "Event created successfully",
        result,
      });
    }
  );

  server.tool(
    "update_event",
    "Update an existing event in an Outlook Calendar.",
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
    },
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
      },
      { authInfo }
    ) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return makeMCPToolTextError("Authentication required");
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
      });

      if ("error" in result) {
        return makeMCPToolTextError(result.error);
      }

      return makeMCPToolJSONSuccess({
        message: "Event updated successfully",
        result,
      });
    }
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
    },
    async ({ calendarId, eventId }, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return makeMCPToolTextError("Authentication required");
      }

      const result = await OutlookApi.deleteEvent(accessToken, {
        calendarId,
        eventId,
      });

      if ("error" in result) {
        return makeMCPToolTextError(result.error);
      }

      return makeMCPToolJSONSuccess({
        message: "Event deleted successfully",
        result: "",
      });
    }
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
    },
    async (
      { emails, startTime, endTime, intervalInMinutes = 60 },
      { authInfo }
    ) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return makeMCPToolTextError("Authentication required");
      }

      const result = await OutlookApi.checkAvailability(accessToken, {
        emails,
        startTime,
        endTime,
        intervalInMinutes,
      });

      if ("error" in result) {
        return makeMCPToolTextError(result.error);
      }

      return makeMCPToolJSONSuccess({
        message: "Availability checked successfully",
        result,
      });
    }
  );

  return server;
};

export default createServer;

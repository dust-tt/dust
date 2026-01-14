import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";

import {
  checkAvailabilitySchema,
  checkSelfAvailabilitySchema,
  createEventSchema,
  deleteEventSchema,
  getEventSchema,
  getUserTimezoneSchema,
  listCalendarsSchema,
  listEventsSchema,
  OUTLOOK_CALENDAR_TOOL_NAME,
  updateEventSchema,
} from "./metadata";
import * as OutlookApi from "./outlook_api_helper";
import {
  renderAvailabilityCheck,
  renderOutlookEvent,
  renderOutlookEventList,
} from "./rendering";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("outlook_calendar");

  server.tool(
    "get_user_timezone",
    "Get the user's configured timezone from their Outlook mailbox settings. This should be called before creating, updating, or searching for events to ensure proper timezone handling.",
    getUserTimezoneSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: OUTLOOK_CALENDAR_TOOL_NAME,
        agentLoopContext,
      },
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
    listCalendarsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: OUTLOOK_CALENDAR_TOOL_NAME,
        agentLoopContext,
      },
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
    listEventsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: OUTLOOK_CALENDAR_TOOL_NAME,
        agentLoopContext,
      },
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

        const formattedText = renderOutlookEventList(result.events, {
          userTimezone,
          hasMore: result.nextLink !== undefined,
        });

        return new Ok([
          {
            type: "text" as const,
            text: formattedText,
          },
        ]);
      }
    )
  );

  server.tool(
    "get_event",
    "Get a single event from an Outlook Calendar by event ID.",
    getEventSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: OUTLOOK_CALENDAR_TOOL_NAME,
        agentLoopContext,
      },
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

        const formattedText = renderOutlookEvent(result, userTimezone);

        return new Ok([{ type: "text" as const, text: formattedText }]);
      }
    )
  );

  server.tool(
    "create_event",
    "Create a new event in an Outlook Calendar. Call get_user_timezone first and pass the userTimezone parameter for proper timezone handling.",
    createEventSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: OUTLOOK_CALENDAR_TOOL_NAME,
        agentLoopContext,
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

        const formattedText = renderOutlookEvent(result, userTimezone);

        return new Ok([
          {
            type: "text" as const,
            text: `Event created successfully\n\n${formattedText}`,
          },
        ]);
      }
    )
  );

  server.tool(
    "update_event",
    "Update an existing event in an Outlook Calendar. Call get_user_timezone first and pass the userTimezone parameter for proper timezone handling.",
    updateEventSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: OUTLOOK_CALENDAR_TOOL_NAME,
        agentLoopContext,
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

        const formattedText = renderOutlookEvent(result, userTimezone);

        return new Ok([
          {
            type: "text" as const,
            text: `Event updated successfully\n\n${formattedText}`,
          },
        ]);
      }
    )
  );

  server.tool(
    "delete_event",
    "Delete an event from an Outlook Calendar.",
    deleteEventSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: OUTLOOK_CALENDAR_TOOL_NAME,
        agentLoopContext,
      },
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
        ]);
      }
    )
  );

  server.tool(
    "check_availability",
    "Check the calendar availability of specific people for a given time slot using Outlook Calendar.",
    checkAvailabilitySchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: OUTLOOK_CALENDAR_TOOL_NAME,
        agentLoopContext,
      },
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

  server.tool(
    "check_self_availability",
    "Check if the current user is available during a specific time period by analyzing " +
      "their calendar events. An event is considered blocking if its showAs status is 'busy', " +
      "'tentative', 'oof' (out of office), or 'workingElsewhere'.",
    checkSelfAvailabilitySchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: OUTLOOK_CALENDAR_TOOL_NAME,
        agentLoopContext,
      },
      async (
        { calendarId, startTime, endTime, userTimezone },
        { authInfo }
      ) => {
        const accessToken = authInfo?.token;
        if (!accessToken) {
          return new Err(new MCPError("Authentication required"));
        }

        const result = await OutlookApi.listEvents(accessToken, {
          calendarId,
          startTime,
          endTime,
          userTimezone,
        });

        if ("error" in result) {
          return new Err(new MCPError(result.error));
        }

        const formattedText = renderAvailabilityCheck(
          result.events,
          startTime,
          endTime
        );

        return new Ok([{ type: "text" as const, text: formattedText }]);
      }
    )
  );

  return server;
}

export default createServer;

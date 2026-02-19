import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { OUTLOOK_CALENDAR_TOOLS_METADATA } from "@app/lib/api/actions/servers/outlook/calendar_metadata";
import * as OutlookApi from "@app/lib/api/actions/servers/outlook/outlook_api_helper";
import {
  renderAvailabilityCheck,
  renderOutlookEvent,
  renderOutlookEventList,
} from "@app/lib/api/actions/servers/outlook/rendering";
import { Err, Ok } from "@app/types/shared/result";

const handlers: ToolHandlers<typeof OUTLOOK_CALENDAR_TOOLS_METADATA> = {
  get_user_timezone: async (_, { authInfo }) => {
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
  },

  list_calendars: async (
    { top = 250, skip = 0, userTimezone },
    { authInfo }
  ) => {
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
  },

  list_events: async (
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
  },

  get_event: async ({ calendarId, eventId, userTimezone }, { authInfo }) => {
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
  },

  create_event: async (
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
  },

  update_event: async (
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
  },

  delete_event: async ({ calendarId, eventId, userTimezone }, { authInfo }) => {
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
  },

  check_availability: async (
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
  },

  check_self_availability: async (
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
  },
};

export const TOOLS = buildTools(OUTLOOK_CALENDAR_TOOLS_METADATA, handlers);

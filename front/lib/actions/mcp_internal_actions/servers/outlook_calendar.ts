import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";

interface OutlookCalendar {
  id: string;
  name: string;
  color: string;
  canEdit?: boolean;
  canShare?: boolean;
  canViewPrivateItems?: boolean;
  owner?: {
    name?: string;
    address?: string;
  };
}

interface OutlookEvent {
  id: string;
  subject?: string;
  body?: {
    contentType: "text" | "html";
    content: string;
  };
  start: {
    dateTime: string;
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
  location?: {
    displayName?: string;
  };
  attendees?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
    status: {
      response: "none" | "accepted" | "declined" | "tentativelyAccepted";
      time?: string;
    };
  }>;
  organizer?: {
    emailAddress: {
      address: string;
      name?: string;
    };
  };
  isAllDay?: boolean;
  isCancelled?: boolean;
  importance?: "low" | "normal" | "high";
  sensitivity?: "normal" | "personal" | "private" | "confidential";
  showAs?:
    | "free"
    | "tentative"
    | "busy"
    | "oof"
    | "workingElsewhere"
    | "unknown";
  recurrence?: any;
}

const serverInfo: InternalMCPServerDefinitionType = {
  name: "outlook_calendar",
  version: "1.0.0",
  description: "Tools for managing Outlook calendars and events.",
  authorization: {
    provider: "microsoft_tools" as const,
    supported_use_cases: ["personal_actions"] as const,
    scope: "Calendars.ReadWrite Calendars.ReadWrite.Shared User.Read" as const,
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

      const params = new URLSearchParams();
      params.append("$top", Math.min(top, 999).toString());
      params.append("$skip", skip.toString());

      const response = await fetchFromOutlook(
        `/me/calendars?${params.toString()}`,
        accessToken,
        { method: "GET" }
      );

      if (!response.ok) {
        const errorText = await getErrorText(response);
        return makeMCPToolTextError(
          `Failed to list calendars: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const result = await response.json();

      return makeMCPToolJSONSuccess({
        message: "Calendars listed successfully",
        result: {
          calendars: (result.value || []) as OutlookCalendar[],
          nextLink: result["@odata.nextLink"],
        },
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

      const params = new URLSearchParams();
      params.append("$top", Math.min(top, 999).toString());
      params.append("$skip", skip.toString());
      params.append("$orderby", "start/dateTime");

      if (search) {
        params.append("$search", `"${search}"`);
      }

      if (startTime || endTime) {
        const filters = [];
        if (startTime) {
          filters.push(`start/dateTime ge '${startTime}'`);
        }
        if (endTime) {
          filters.push(`end/dateTime le '${endTime}'`);
        }
        if (filters.length > 0) {
          params.append("$filter", filters.join(" and "));
        }
      }

      const endpoint = calendarId
        ? `/me/calendars/${calendarId}/events`
        : `/me/events`;

      const response = await fetchFromOutlook(
        `${endpoint}?${params.toString()}`,
        accessToken,
        { method: "GET" }
      );

      if (!response.ok) {
        const errorText = await getErrorText(response);
        return makeMCPToolTextError(
          `Failed to list events: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const result = await response.json();

      return makeMCPToolJSONSuccess({
        message: "Events listed successfully",
        result: {
          events: (result.value || []) as OutlookEvent[],
          nextLink: result["@odata.nextLink"],
        },
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

      const endpoint = calendarId
        ? `/me/calendars/${calendarId}/events/${eventId}`
        : `/me/events/${eventId}`;

      const response = await fetchFromOutlook(endpoint, accessToken, {
        method: "GET",
      });

      if (!response.ok) {
        const errorText = await getErrorText(response);
        if (response.status === 404) {
          return makeMCPToolTextError(`Event not found: ${eventId}`);
        }
        return makeMCPToolTextError(
          `Failed to get event: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const result = await response.json();

      return makeMCPToolJSONSuccess({
        message: "Event fetched successfully",
        result: result as OutlookEvent,
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

      const event: any = {
        subject,
        start: {
          dateTime: startDateTime,
          timeZone,
        },
        end: {
          dateTime: endDateTime,
          timeZone,
        },
        isAllDay,
        importance,
        showAs,
      };

      if (body) {
        event.body = {
          contentType,
          content: body,
        };
      }

      if (attendees && attendees.length > 0) {
        event.attendees = attendees.map((email) => ({
          emailAddress: { address: email },
          type: "required",
        }));
      }

      if (location) {
        event.location = { displayName: location };
      }

      const endpoint = calendarId
        ? `/me/calendars/${calendarId}/events`
        : `/me/events`;

      const response = await fetchFromOutlook(endpoint, accessToken, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        const errorText = await getErrorText(response);
        return makeMCPToolTextError(
          `Failed to create event: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const result = await response.json();

      return makeMCPToolJSONSuccess({
        message: "Event created successfully",
        result: result as OutlookEvent,
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

      const event: any = {};

      if (subject !== undefined) {
        event.subject = subject;
      }
      if (body !== undefined) {
        event.body = {
          contentType: contentType || "text",
          content: body,
        };
      }
      if (startDateTime !== undefined) {
        event.start = {
          dateTime: startDateTime,
          timeZone: timeZone || "UTC",
        };
      }
      if (endDateTime !== undefined) {
        event.end = {
          dateTime: endDateTime,
          timeZone: timeZone || "UTC",
        };
      }
      if (attendees !== undefined) {
        event.attendees = attendees.map((email) => ({
          emailAddress: { address: email },
          type: "required",
        }));
      }
      if (location !== undefined) {
        event.location = { displayName: location };
      }
      if (isAllDay !== undefined) {
        event.isAllDay = isAllDay;
      }
      if (importance !== undefined) {
        event.importance = importance;
      }
      if (showAs !== undefined) {
        event.showAs = showAs;
      }

      const endpoint = calendarId
        ? `/me/calendars/${calendarId}/events/${eventId}`
        : `/me/events/${eventId}`;

      const response = await fetchFromOutlook(endpoint, accessToken, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        const errorText = await getErrorText(response);
        if (response.status === 404) {
          return makeMCPToolTextError(`Event not found: ${eventId}`);
        }
        return makeMCPToolTextError(
          `Failed to update event: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const result = await response.json();

      return makeMCPToolJSONSuccess({
        message: "Event updated successfully",
        result: result as OutlookEvent,
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

      const endpoint = calendarId
        ? `/me/calendars/${calendarId}/events/${eventId}`
        : `/me/events/${eventId}`;

      const response = await fetchFromOutlook(endpoint, accessToken, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorText = await getErrorText(response);
        if (response.status === 404) {
          return makeMCPToolTextError(`Event not found: ${eventId}`);
        }
        return makeMCPToolTextError(
          `Failed to delete event: ${response.status} ${response.statusText} - ${errorText}`
        );
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

      const requestBody = {
        schedules: emails,
        startTime: {
          dateTime: startTime,
          timeZone: "UTC",
        },
        endTime: {
          dateTime: endTime,
          timeZone: "UTC",
        },
        availabilityViewInterval: Math.min(
          Math.max(intervalInMinutes, 5),
          1440
        ),
      };

      const response = await fetchFromOutlook(
        "/me/calendar/getSchedule",
        accessToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorText = await getErrorText(response);
        return makeMCPToolTextError(
          `Failed to check availability: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const result = await response.json();

      // Transform the result to match Google Calendar format for consistency
      const availability =
        result.value?.map((schedule: any) => ({
          email: schedule.scheduleId,
          available: schedule.busyViewType === "free",
          busySlots:
            schedule.freeBusyViewType === "busy"
              ? [{ start: startTime, end: endTime }]
              : [],
          availabilityView: schedule.availabilityView,
        })) || [];

      return makeMCPToolJSONSuccess({
        message: "Availability checked successfully",
        result: {
          availability,
          timeSlot: { start: startTime, end: endTime },
        },
      });
    }
  );

  return server;
};

const fetchFromOutlook = async (
  endpoint: string,
  accessToken: string,
  options?: RequestInit
): Promise<Response> => {
  return fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...options?.headers,
    },
  });
};

const getErrorText = async (response: Response): Promise<string> => {
  try {
    const errorData = await response.json();
    return errorData.error?.message || errorData.error?.code || "Unknown error";
  } catch {
    return "Unknown error";
  }
};

export default createServer;

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { google } from "googleapis";
import { z } from "zod";

import { makeMCPToolPersonalAuthenticationRequiredError } from "@app/lib/actions/mcp_internal_actions/authentication";
import { getConnectionForInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/authentication";
import {
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import { GMAIL_SCOPE_TYPES } from "@app/lib/api/oauth";
import type { Authenticator } from "@app/lib/auth";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "google_calendar",
  version: "1.0.0",
  description: "Tools for managing Google calendars and events.",
  authorization: {
    provider: "gmail",
    use_case: "personal_actions",
    scope: GMAIL_SCOPE_TYPES.CALENDAR,
  },
  icon: "GcalLogo",
  documentationUrl: "https://docs.dust.tt/docs/google-calendar",
};

const createServer = (auth: Authenticator, mcpServerId: string): McpServer => {
  const server = new McpServer(serverInfo);

  async function getCalendarClient() {
    const connection = await getConnectionForInternalMCPServer(auth, {
      mcpServerId,
      connectionType: "personal",
    });
    const accessToken = connection?.access_token;
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
    async ({ pageToken, maxResults }) => {
      const calendar = await getCalendarClient();
      if (!calendar) {
        return makeMCPToolPersonalAuthenticationRequiredError(
          mcpServerId,
          serverInfo.authorization!
        );
      }
      try {
        const res = await calendar.calendarList.list({
          pageToken,
          maxResults: maxResults ? Math.min(maxResults, 250) : undefined,
        });
        return makeMCPToolJSONSuccess({
          message: "Calendars listed successfully",
          result: res.data,
        });
      } catch (err) {
        return makeMCPToolTextError(
          normalizeError(err).message || "Failed to list calendars"
        );
      }
    }
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
    async ({
      calendarId = "primary",
      q,
      timeMin,
      timeMax,
      maxResults,
      pageToken,
    }) => {
      const calendar = await getCalendarClient();
      if (!calendar) {
        return makeMCPToolPersonalAuthenticationRequiredError(
          mcpServerId,
          serverInfo.authorization!
        );
      }
      try {
        const res = await calendar.events.list({
          calendarId,
          q,
          timeMin,
          timeMax,
          maxResults: maxResults ? Math.min(maxResults, 2500) : undefined,
          pageToken,
        });
        return makeMCPToolJSONSuccess({
          message: "Events listed successfully",
          result: res.data,
        });
      } catch (err) {
        return makeMCPToolTextError(
          normalizeError(err).message || "Failed to list/search events"
        );
      }
    }
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
    async ({ calendarId = "primary", eventId }) => {
      const calendar = await getCalendarClient();
      if (!calendar) {
        return makeMCPToolPersonalAuthenticationRequiredError(
          mcpServerId,
          serverInfo.authorization!
        );
      }
      try {
        const res = await calendar.events.get({
          calendarId,
          eventId,
        });
        return makeMCPToolJSONSuccess({
          message: "Event fetched successfully",
          result: res.data,
        });
      } catch (err) {
        return makeMCPToolTextError(
          normalizeError(err).message || "Failed to get event"
        );
      }
    }
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
    async ({
      calendarId = "primary",
      summary,
      description,
      start,
      end,
      attendees,
      location,
      colorId,
    }) => {
      const calendar = await getCalendarClient();
      if (!calendar) {
        return makeMCPToolPersonalAuthenticationRequiredError(
          mcpServerId,
          serverInfo.authorization!
        );
      }
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
        return makeMCPToolJSONSuccess({
          message: "Event created successfully",
          result: res.data,
        });
      } catch (err) {
        return makeMCPToolTextError(
          normalizeError(err).message || "Failed to create event"
        );
      }
    }
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
    async ({
      calendarId = "primary",
      eventId,
      summary,
      description,
      start,
      end,
      attendees,
      location,
      colorId,
    }) => {
      const calendar = await getCalendarClient();
      if (!calendar) {
        return makeMCPToolPersonalAuthenticationRequiredError(
          mcpServerId,
          serverInfo.authorization!
        );
      }
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
        return makeMCPToolJSONSuccess({
          message: "Event updated successfully",
          result: res.data,
        });
      } catch (err) {
        return makeMCPToolTextError(
          normalizeError(err).message || "Failed to update event"
        );
      }
    }
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
    async ({ calendarId = "primary", eventId }) => {
      const calendar = await getCalendarClient();
      if (!calendar) {
        return makeMCPToolPersonalAuthenticationRequiredError(
          mcpServerId,
          serverInfo.authorization!
        );
      }
      try {
        await calendar.events.delete({
          calendarId,
          eventId,
        });
        return makeMCPToolJSONSuccess({
          message: "Event deleted successfully",
          result: "",
        });
      } catch (err) {
        return makeMCPToolTextError(
          normalizeError(err).message || "Failed to delete event"
        );
      }
    }
  );

  return server;
};

export default createServer;

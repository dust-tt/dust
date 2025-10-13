import { z } from "zod";

import logger from "@app/logger/logger";

const localLogger = logger.child({ module: "outlook_api_helper" });

export const OutlookCalendarSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  canEdit: z.boolean().optional(),
  canShare: z.boolean().optional(),
  canViewPrivateItems: z.boolean().optional(),
  owner: z
    .object({
      name: z.string().optional(),
      address: z.string().optional(),
    })
    .optional(),
});

export const OutlookEventSchema = z.object({
  id: z.string(),
  subject: z.string().optional(),
  body: z
    .object({
      contentType: z.string().default("text"),
      content: z.string(),
    })
    .optional(),
  start: z.object({
    dateTime: z.string(),
    timeZone: z.string().optional(),
  }),
  end: z.object({
    dateTime: z.string(),
    timeZone: z.string().optional(),
  }),
  location: z
    .object({
      displayName: z.string().optional(),
    })
    .optional(),
  attendees: z
    .array(
      z.object({
        emailAddress: z.object({
          address: z.string(),
          name: z.string().optional(),
        }),
        status: z.object({
          response: z.string().default("none"),
          time: z.string().optional(),
        }),
      })
    )
    .optional(),
  organizer: z
    .object({
      emailAddress: z.object({
        address: z.string(),
        name: z.string().optional(),
      }),
    })
    .optional(),
  isAllDay: z.boolean().optional(),
  isCancelled: z.boolean().optional(),
  importance: z.string().optional(),
  sensitivity: z.string().optional(),
  showAs: z.string().optional(),
  recurrence: z.any().optional(),
});

export type OutlookCalendar = z.infer<typeof OutlookCalendarSchema>;
export type OutlookEvent = z.infer<typeof OutlookEventSchema>;

export interface ListCalendarsParams {
  top?: number;
  skip?: number;
  userTimezone?: string;
}

export interface ListEventsParams {
  calendarId?: string;
  search?: string;
  startTime?: string;
  endTime?: string;
  top?: number;
  skip?: number;
  userTimezone?: string;
}

export interface GetEventParams {
  calendarId?: string;
  eventId: string;
  userTimezone?: string;
}

export interface CreateEventParams {
  calendarId?: string;
  subject: string;
  body?: string;
  contentType?: "text" | "html";
  startDateTime: string;
  endDateTime: string;
  timeZone?: string;
  attendees?: string[];
  location?: string;
  isAllDay?: boolean;
  importance?: "low" | "normal" | "high";
  showAs?: "free" | "tentative" | "busy" | "oof" | "workingElsewhere";
  userTimezone?: string;
}

export interface UpdateEventParams {
  calendarId?: string;
  eventId: string;
  subject?: string;
  body?: string;
  contentType?: "text" | "html";
  startDateTime?: string;
  endDateTime?: string;
  timeZone?: string;
  attendees?: string[];
  location?: string;
  isAllDay?: boolean;
  importance?: "low" | "normal" | "high";
  showAs?: "free" | "tentative" | "busy" | "oof" | "workingElsewhere";
  userTimezone?: string;
}

export interface DeleteEventParams {
  calendarId?: string;
  eventId: string;
  userTimezone?: string;
}

export interface CheckAvailabilityParams {
  emails: string[];
  startTime: string;
  endTime: string;
  intervalInMinutes?: number;
  userTimezone?: string;
}

const fetchFromOutlook = async (
  endpoint: string,
  accessToken: string,
  options?: RequestInit,
  userTimezone?: string
): Promise<Response> => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };

  // Add existing headers from options
  if (options?.headers) {
    const existingHeaders = options.headers as Record<string, string>;
    Object.assign(headers, existingHeaders);
  }

  // Add Prefer header with timezone if provided
  if (userTimezone) {
    headers["Prefer"] = `outlook.timezone="${userTimezone}"`;
  }

  return fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
    ...options,
    headers,
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

export async function getUserTimezone(
  accessToken: string
): Promise<string | { error: string }> {
  try {
    const response = await fetchFromOutlook(
      "/me/mailboxSettings",
      accessToken,
      { method: "GET" }
    );

    if (!response.ok) {
      const errorText = await getErrorText(response);
      return {
        error: `Failed to get user timezone: ${response.status} ${response.statusText} - ${errorText}`,
      };
    }

    const result = await response.json();
    return result.timeZone || "UTC";
  } catch (error) {
    localLogger.error({ error }, "Error getting user timezone");
    return { error: `Error getting user timezone: ${error}` };
  }
}

export async function listCalendars(
  accessToken: string,
  params: ListCalendarsParams
): Promise<
  { calendars: OutlookCalendar[]; nextLink?: string } | { error: string }
> {
  const { top = 250, skip = 0, userTimezone } = params;

  const urlParams = new URLSearchParams();
  urlParams.append("$top", Math.min(top, 999).toString());
  urlParams.append("$skip", skip.toString());

  try {
    const response = await fetchFromOutlook(
      `/me/calendars?${urlParams.toString()}`,
      accessToken,
      { method: "GET" },
      userTimezone
    );

    if (!response.ok) {
      const errorText = await getErrorText(response);
      return {
        error: `Failed to list calendars: ${response.status} ${response.statusText} - ${errorText}`,
      };
    }

    const result = await response.json();
    const calendarsResult = z
      .array(OutlookCalendarSchema)
      .safeParse(result.value || []);

    if (!calendarsResult.success) {
      localLogger.error(
        { error: calendarsResult.error },
        "Invalid calendar data format"
      );
      return {
        error: `Invalid calendar data format: ${calendarsResult.error.message}`,
      };
    }

    return {
      calendars: calendarsResult.data,
      nextLink: result["@odata.nextLink"],
    };
  } catch (error) {
    localLogger.error({ error }, "Error listing calendars");
    return { error: `Error listing calendars: ${error}` };
  }
}

export async function listEvents(
  accessToken: string,
  params: ListEventsParams
): Promise<{ events: OutlookEvent[]; nextLink?: string } | { error: string }> {
  const {
    calendarId,
    search,
    startTime,
    endTime,
    top = 50,
    skip = 0,
    userTimezone,
  } = params;

  // Use calendarView endpoint when date range is specified to get recurring events
  if (startTime && endTime && !search) {
    const urlParams = new URLSearchParams();
    urlParams.append("startDateTime", startTime);
    urlParams.append("endDateTime", endTime);
    urlParams.append("$top", Math.min(top, 999).toString());
    urlParams.append("$skip", skip.toString());
    urlParams.append("$orderby", "start/dateTime");

    const endpoint = calendarId
      ? `/me/calendars/${calendarId}/calendarView`
      : `/me/calendar/calendarView`;

    try {
      const response = await fetchFromOutlook(
        `${endpoint}?${urlParams.toString()}`,
        accessToken,
        { method: "GET" },
        userTimezone
      );

      if (!response.ok) {
        const errorText = await getErrorText(response);
        return {
          error: `Failed to list events: ${response.status} ${response.statusText} - ${errorText}`,
        };
      }

      const result = await response.json();
      const eventsResult = z
        .array(OutlookEventSchema)
        .safeParse(result.value || []);

      if (!eventsResult.success) {
        localLogger.error(
          { error: eventsResult.error },
          "Invalid events data format"
        );
        return {
          error: `Invalid events data format: ${eventsResult.error.message}`,
        };
      }

      return {
        events: eventsResult.data,
        nextLink: result["@odata.nextLink"],
      };
    } catch (error) {
      localLogger.error({ error }, "Error listing events");
      return { error: `Error listing events: ${error}` };
    }
  } else {
    // Fall back to regular events endpoint for search queries or when no date range
    const urlParams = new URLSearchParams();
    urlParams.append("$top", Math.min(top, 999).toString());
    urlParams.append("$orderby", "start/dateTime");

    if (search) {
      urlParams.append("$search", `"${search}"`);
    } else {
      urlParams.append("$skip", skip.toString());
    }

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    if (startTime || endTime) {
      const filters = [];
      if (startTime) {
        filters.push(`start/dateTime ge '${startTime}'`);
      }
      if (endTime) {
        filters.push(`end/dateTime le '${endTime}'`);
      }
      if (filters.length > 0) {
        urlParams.append("$filter", filters.join(" and "));
      }
    }

    const endpoint = calendarId
      ? `/me/calendars/${calendarId}/events`
      : `/me/events`;

    try {
      const response = await fetchFromOutlook(
        `${endpoint}?${urlParams.toString()}`,
        accessToken,
        { method: "GET" },
        userTimezone
      );

      if (!response.ok) {
        const errorText = await getErrorText(response);
        return {
          error: `Failed to list events: ${response.status} ${response.statusText} - ${errorText}`,
        };
      }

      const result = await response.json();
      const eventsResult = z
        .array(OutlookEventSchema)
        .safeParse(result.value || []);

      if (!eventsResult.success) {
        localLogger.error(
          { error: eventsResult.error },
          "Invalid events data format"
        );
        return {
          error: `Invalid events data format: ${eventsResult.error.message}`,
        };
      }

      return {
        events: eventsResult.data,
        nextLink: result["@odata.nextLink"],
      };
    } catch (error) {
      localLogger.error({ error }, "Error listing events");
      return { error: `Error listing events: ${error}` };
    }
  }
}

export async function getEvent(
  accessToken: string,
  params: GetEventParams
): Promise<OutlookEvent | { error: string }> {
  const { calendarId, eventId, userTimezone } = params;

  const endpoint = calendarId
    ? `/me/calendars/${calendarId}/events/${eventId}`
    : `/me/events/${eventId}`;

  try {
    const response = await fetchFromOutlook(
      endpoint,
      accessToken,
      { method: "GET" },
      userTimezone
    );

    if (!response.ok) {
      const errorText = await getErrorText(response);
      if (response.status === 404) {
        return { error: `Event not found: ${eventId}` };
      }
      return {
        error: `Failed to get event: ${response.status} ${response.statusText} - ${errorText}`,
      };
    }

    const result = await response.json();
    const eventResult = OutlookEventSchema.safeParse(result);

    if (!eventResult.success) {
      localLogger.error(
        { error: eventResult.error },
        "Invalid event data format"
      );
      return {
        error: `Invalid event data format: ${eventResult.error.message}`,
      };
    }

    return eventResult.data;
  } catch (error) {
    localLogger.error({ error }, "Error getting event");
    return { error: `Error getting event: ${error}` };
  }
}

export async function createEvent(
  accessToken: string,
  params: CreateEventParams
): Promise<OutlookEvent | { error: string }> {
  const {
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
  } = params;

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

  try {
    const response = await fetchFromOutlook(
      endpoint,
      accessToken,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      },
      userTimezone
    );

    if (!response.ok) {
      const errorText = await getErrorText(response);
      return {
        error: `Failed to create event: ${response.status} ${response.statusText} - ${errorText}`,
      };
    }

    const result = await response.json();
    const eventResult = OutlookEventSchema.safeParse(result);

    if (!eventResult.success) {
      localLogger.error(
        { error: eventResult.error },
        "Invalid event data format"
      );
      return {
        error: `Invalid event data format: ${eventResult.error.message}`,
      };
    }

    return eventResult.data;
  } catch (error) {
    localLogger.error({ error }, "Error creating event");
    return { error: `Error creating event: ${error}` };
  }
}

export async function updateEvent(
  accessToken: string,
  params: UpdateEventParams
): Promise<OutlookEvent | { error: string }> {
  const {
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
  } = params;

  const event: any = {};

  if (subject !== undefined) {
    event.subject = subject;
  }
  if (body !== undefined) {
    event.body = {
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      contentType: contentType || "text",
      content: body,
    };
  }
  if (startDateTime !== undefined) {
    event.start = {
      dateTime: startDateTime,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      timeZone: timeZone || "UTC",
    };
  }
  if (endDateTime !== undefined) {
    event.end = {
      dateTime: endDateTime,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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

  try {
    const response = await fetchFromOutlook(
      endpoint,
      accessToken,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      },
      userTimezone
    );

    if (!response.ok) {
      const errorText = await getErrorText(response);
      if (response.status === 404) {
        return { error: `Event not found: ${eventId}` };
      }
      return {
        error: `Failed to update event: ${response.status} ${response.statusText} - ${errorText}`,
      };
    }

    const result = await response.json();
    const eventResult = OutlookEventSchema.safeParse(result);

    if (!eventResult.success) {
      localLogger.error(
        { error: eventResult.error },
        "Invalid event data format"
      );
      return {
        error: `Invalid event data format: ${eventResult.error.message}`,
      };
    }

    return eventResult.data;
  } catch (error) {
    localLogger.error({ error }, "Error updating event");
    return { error: `Error updating event: ${error}` };
  }
}

export async function deleteEvent(
  accessToken: string,
  params: DeleteEventParams
): Promise<{ success: true } | { error: string }> {
  const { calendarId, eventId, userTimezone } = params;

  const endpoint = calendarId
    ? `/me/calendars/${calendarId}/events/${eventId}`
    : `/me/events/${eventId}`;

  try {
    const response = await fetchFromOutlook(
      endpoint,
      accessToken,
      { method: "DELETE" },
      userTimezone
    );

    if (!response.ok) {
      const errorText = await getErrorText(response);
      if (response.status === 404) {
        return { error: `Event not found: ${eventId}` };
      }
      return {
        error: `Failed to delete event: ${response.status} ${response.statusText} - ${errorText}`,
      };
    }

    return { success: true };
  } catch (error) {
    localLogger.error({ error }, "Error deleting event");
    return { error: `Error deleting event: ${error}` };
  }
}

export async function checkAvailability(
  accessToken: string,
  params: CheckAvailabilityParams
): Promise<
  | { availability: any[]; timeSlot: { start: string; end: string } }
  | { error: string }
> {
  const {
    emails,
    startTime,
    endTime,
    intervalInMinutes = 60,
    userTimezone,
  } = params;

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
    availabilityViewInterval: Math.min(Math.max(intervalInMinutes, 5), 1440),
  };

  try {
    const response = await fetchFromOutlook(
      "/me/calendar/getSchedule",
      accessToken,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
      userTimezone
    );

    if (!response.ok) {
      const errorText = await getErrorText(response);
      return {
        error: `Failed to check availability: ${response.status} ${response.statusText} - ${errorText}`,
      };
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

    return {
      availability,
      timeSlot: { start: startTime, end: endTime },
    };
  } catch (error) {
    localLogger.error({ error }, "Error checking availability");
    return { error: `Error checking availability: ${error}` };
  }
}

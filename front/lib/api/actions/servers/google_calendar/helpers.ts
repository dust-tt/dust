import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { google } from "googleapis";
import { DateTime, Interval } from "luxon";

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

export interface GoogleCalendarEvent {
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

export interface EnrichedGoogleCalendarEvent
  extends Omit<GoogleCalendarEvent, "start" | "end"> {
  start?: EnrichedGoogleCalendarEventDateTime;
  end?: EnrichedGoogleCalendarEventDateTime;
}

// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
export async function getCalendarClient(authInfo?: AuthInfo) {
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

export function getUserTimezone(
  agentLoopContext?: AgentLoopContextType
): string | null {
  const content = agentLoopContext?.runContext?.conversation?.content;
  if (!content) {
    return null;
  }

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

export function isGoogleCalendarEvent(
  event: any
): event is GoogleCalendarEvent {
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

export function enrichEventWithDayOfWeek(
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
    const endDate = new Date(event.end.date);
    enrichedEvent.end = {
      ...event.end,
      eventDayOfWeek: formatDayOfWeek(endDate),
      isAllDay: true,
    };
  }

  return enrichedEvent;
}

export function formatEventAsText(event: EnrichedGoogleCalendarEvent): string {
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

export function formatEventsListAsText(
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

export interface AvailabilityParticipant {
  email: string;
  timezone: string;
  dailyTimeWindowStart?: string;
  dailyTimeWindowEnd?: string;
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

export function buildUnavailableIntervals(
  range: Interval,
  participant: AvailabilityParticipant,
  excludeWeekends: boolean
): Interval[] {
  const rangeStartDate = range.start;
  const rangeEndDate = range.end;
  if (!rangeStartDate || !rangeEndDate) {
    return [];
  }

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

    if (excludeWeekends && (dayStart.weekday === 6 || dayStart.weekday === 7)) {
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

    if (participant.dailyTimeWindowStart) {
      const beforeStart = DateTime.max(dayStart, startInZone);
      const beforeEnd = DateTime.min(windowStart, endInZone);
      if (beforeStart < beforeEnd) {
        unavailable.push(
          Interval.fromDateTimes(beforeStart.toUTC(), beforeEnd.toUTC())
        );
      }
    }

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

export function mergeIntervals(intervals: Interval[]): Interval[] {
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

export function computeAvailability(
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

function formatDateTime(date: DateTime, timezone: string): string {
  return date.setZone(timezone).toFormat("EEE, MMM d yyyy 'at' HH:mm ZZZZ");
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

export function formatAvailabilitySummary({
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

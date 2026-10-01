import type { ToolContext } from "@app/lib/actions/types";
import {
  isAgentLoopRunContext,
  isSandboxFunctionRunContext,
} from "@app/lib/actions/types";
import { isValidTimezone } from "@app/lib/api/timezone";
import { TZDateMini } from "@date-fns/tz";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { parseISO } from "date-fns";
import { google } from "googleapis";

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
  focusTimeProperties?: {
    autoDeclineMode?: string;
    chatStatus?: string;
    declineMessage?: string;
  };
  outOfOfficeProperties?: {
    autoDeclineMode?: string;
    declineMessage?: string;
  };
  extendedProperties?: {
    private?: Record<string, string>;
  };
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
  attachments?: Array<{
    fileUrl?: string;
    title?: string;
    mimeType?: string;
    iconLink?: string;
    fileId?: string;
  }>;
}

export interface EnrichedGoogleCalendarEvent
  extends Omit<GoogleCalendarEvent, "start" | "end"> {
  start?: EnrichedGoogleCalendarEventDateTime;
  end?: EnrichedGoogleCalendarEventDateTime;
}

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

export function normalizeTimezone(
  timezone: string | null | undefined
): string | null {
  if (!timezone) {
    return null;
  }

  if (isValidTimezone(timezone)) {
    return timezone;
  }

  const offsetMatch = timezone
    .trim()
    .match(/^(?:GMT|UTC)\s*([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (offsetMatch) {
    const [, sign, hours, minutes = "00"] = offsetMatch;
    const candidate = `${sign}${hours.padStart(2, "0")}:${minutes}`;
    if (isValidTimezone(candidate)) {
      return candidate;
    }
  }

  return null;
}

export async function getUserTimezone(
  toolContext?: ToolContext
): Promise<string | null> {
  if (isAgentLoopRunContext(toolContext?.runContext)) {
    const content = toolContext?.runContext?.conversation?.content;
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
          return normalizeTimezone(userMessage.context.timezone);
        }
      }
    }
  }

  if (isSandboxFunctionRunContext(toolContext?.runContext)) {
    const context = await toolContext.runContext.invocation.getContext();
    return normalizeTimezone(context?.timezone);
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

function formatTimedEventDateTime(dateTime: string, timeZone?: string): string {
  const date = new Date(dateTime);
  const normalizedZone = normalizeTimezone(timeZone);

  if (timeZone && !normalizedZone) {
    return dateTime;
  }

  const zone = normalizedZone ?? undefined;
  return `${formatDate(date, zone)} at ${formatTime(date, zone)}`;
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
          const formatted = formatTimedEventDateTime(
            start.dateTime,
            start.timeZone
          );
          lines.push(
            `Start: ${start.eventDayOfWeek}, ${formatted}${start.timeZone ? ` (${start.timeZone})` : ""}`
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
          const formatted = formatTimedEventDateTime(
            end.dateTime,
            end.timeZone
          );
          lines.push(
            `End: ${end.eventDayOfWeek}, ${formatted}${end.timeZone ? ` (${end.timeZone})` : ""}`
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

  if (event.conferenceData?.entryPoints) {
    const meetingLinks = event.conferenceData.entryPoints
      .filter((ep) => ep.uri)
      .map((ep) => {
        const type = ep.entryPointType ?? "Meeting";
        return `${ep.uri}${ep.label ? ` (${ep.label})` : ` (${type})`}`;
      });
    if (meetingLinks.length > 0) {
      lines.push(
        `Meeting Link${meetingLinks.length > 1 ? "s" : ""}: ${meetingLinks.join(", ")}`
      );
    }
  }

  if (event.description) {
    lines.push(`Description: ${event.description}`);
  }

  if (event.attachments && event.attachments.length > 0) {
    const attachmentList = event.attachments
      .filter((a) => a.fileUrl)
      .map((a) => {
        const title = a.title ?? "Untitled";
        const mimeType = a.mimeType ? ` [${a.mimeType}]` : "";
        return `${title}${mimeType}: ${a.fileUrl}`;
      });
    if (attachmentList.length > 0) {
      lines.push(`Attachments: ${attachmentList.join(", ")}`);
    }
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

  if (event.transparency === "transparent") {
    lines.push("Availability: Free");
  }

  if (event.visibility && event.visibility !== "default") {
    lines.push(`Visibility: ${event.visibility}`);
  }

  if (event.reminders?.overrides && event.reminders.overrides.length > 0) {
    const formatted = event.reminders.overrides
      .filter((r) => r.method !== undefined && r.minutes !== undefined)
      .map((r) => `${r.method} ${r.minutes} min before`);
    if (formatted.length > 0) {
      lines.push(`Reminders: ${formatted.join(", ")}`);
    }
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

interface AvailabilityParticipant {
  email: string;
  timezone: string;
  dailyTimeWindowStart?: string;
  dailyTimeWindowEnd?: string;
}

/**
 * @cc [owner:aubin-tchoi,label:product] availability-iso-utc
 * ISO timestamps without an explicit offset MUST be interpreted in UTC, independently
 * of the host timezone. Invalid timestamps MUST produce an invalid Date.
 */
export function parseAvailabilityDateTime(value: string): Date {
  const hasTime = /[T ]/.test(value);
  const hasOffset = hasTime && /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(value);
  const utcValue = hasOffset
    ? value
    : hasTime
      ? `${value}Z`
      : `${value}T00:00:00Z`;
  return parseISO(utcValue);
}

export interface CalendarInterval {
  start: Date;
  end: Date;
}

function applyTimeToDate(base: Date, timeStr: string, timezone: string): Date {
  const [hourStr, minuteStr = "0", secondStr = "0"] = timeStr.split(":");
  const date = new TZDateMini(base, timezone);
  date.setHours(Number(hourStr), Number(minuteStr), Number(secondStr), 0);
  return date;
}

/**
 * @cc [owner:aubin-tchoi,label:product] participant-local-calendar
 * Daily windows and excluded weekends MUST use each participant's timezone, including
 * DST changes. Returned unavailable intervals MUST be clipped to the requested range.
 */
export function buildUnavailableIntervals(
  range: CalendarInterval,
  participant: AvailabilityParticipant,
  excludeWeekends: boolean
): CalendarInterval[] {
  if (!isValidInterval(range)) {
    return [];
  }
  if (
    !participant.dailyTimeWindowStart &&
    !participant.dailyTimeWindowEnd &&
    !excludeWeekends
  ) {
    return [];
  }

  const unavailable: CalendarInterval[] = [];
  const { timezone } = participant;
  let cursor = new TZDateMini(range.start, timezone);
  cursor.setHours(0, 0, 0, 0);

  function addUnavailable(start: Date, end: Date): void {
    const clippedStart = new Date(
      Math.max(start.getTime(), range.start.getTime())
    );
    const clippedEnd = new Date(Math.min(end.getTime(), range.end.getTime()));
    if (clippedStart < clippedEnd) {
      unavailable.push({ start: clippedStart, end: clippedEnd });
    }
  }

  while (cursor < range.end) {
    const dayStart = cursor;
    const weekday = dayStart.getDay();
    const dayEnd = new TZDateMini(dayStart, timezone);
    dayEnd.setDate(dayEnd.getDate() + 1);

    if (excludeWeekends && (weekday === 0 || weekday === 6)) {
      addUnavailable(dayStart, dayEnd);
    } else {
      if (participant.dailyTimeWindowStart) {
        addUnavailable(
          dayStart,
          applyTimeToDate(dayStart, participant.dailyTimeWindowStart, timezone)
        );
      }
      if (participant.dailyTimeWindowEnd) {
        addUnavailable(
          applyTimeToDate(dayStart, participant.dailyTimeWindowEnd, timezone),
          dayEnd
        );
      }
    }
    cursor = dayEnd;
  }

  return unavailable;
}

export function isValidInterval(interval: CalendarInterval): boolean {
  return interval.start < interval.end;
}

export function mergeIntervals(
  intervals: CalendarInterval[]
): CalendarInterval[] {
  const sorted = intervals
    .filter(isValidInterval)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged: CalendarInterval[] = [];
  for (const interval of sorted) {
    const prev = merged[merged.length - 1];
    if (prev && prev.end >= interval.start) {
      merged[merged.length - 1] = {
        start: prev.start,
        end: new Date(Math.max(prev.end.getTime(), interval.end.getTime())),
      };
    } else {
      merged.push(interval);
    }
  }
  return merged;
}

/**
 * @cc [owner:aubin-tchoi,label:product] sorted-busy-intervals
 * `busyIntervals` MUST be sorted by start with overlaps merged. Availability MUST
 * contain only the gaps within `range`, excluding every supplied busy interval.
 */
export function computeAvailability(
  range: CalendarInterval,
  busyIntervals: CalendarInterval[]
): CalendarInterval[] {
  if (!isValidInterval(range)) {
    return [];
  }
  const availability: CalendarInterval[] = [];
  let cursor = range.start;
  for (const busy of busyIntervals) {
    const clampedStart = new Date(
      Math.max(busy.start.getTime(), range.start.getTime())
    );
    const clampedEnd = new Date(
      Math.min(busy.end.getTime(), range.end.getTime())
    );
    if (clampedStart >= clampedEnd) {
      continue;
    }
    if (cursor < clampedStart) {
      availability.push({ start: cursor, end: clampedStart });
    }
    cursor = new Date(Math.max(cursor.getTime(), clampedEnd.getTime()));
  }
  if (cursor < range.end) {
    availability.push({ start: cursor, end: range.end });
  }
  return mergeIntervals(availability);
}

function formatDateTime(date: Date, timezone: string): string {
  const parts = new Map(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value] as const)
  );
  return `${parts.get("weekday")}, ${parts.get("month")} ${parts.get("day")} ${parts.get("year")} at ${parts.get("hour")}:${parts.get("minute")} ${parts.get("timeZoneName")}`;
}

function formatIntervalForDisplay(
  interval: CalendarInterval,
  timezone: string
): string {
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
  range: CalendarInterval;
  availabilitySlots: CalendarInterval[];
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

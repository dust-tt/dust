import type { OutlookEvent } from "@app/lib/api/actions/servers/outlook/outlook_api_helper";
import logger from "@app/logger/logger";
import { isValidTimeZone } from "@app/types/shared/utils/date_utils";
import { pluralize } from "@app/types/shared/utils/string_utils";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

// Falls back to UTC and logs rather than throwing, so one malformed timezone
// from an external source doesn't fail the whole event render.
function resolveTimeZone(timeZone: string): string {
  if (isValidTimeZone(timeZone)) {
    return timeZone;
  }
  logger.warn(
    { timeZone },
    "Invalid IANA timezone in Outlook event, falling back to UTC"
  );
  return "UTC";
}

interface EnrichedOutlookEventDateTime {
  dateTime: string;
  timeZone?: string;
  eventDayOfWeek?: string;
  isAllDay?: boolean;
}

interface EnrichedOutlookEvent extends Omit<OutlookEvent, "start" | "end"> {
  start: EnrichedOutlookEventDateTime;
  end: EnrichedOutlookEventDateTime;
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[^>]*>.*?<\/style>/gi, "")
    .replace(/<script[^>]*>.*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function enrichEventWithDayOfWeek(
  event: OutlookEvent,
  userTimezone?: string
): EnrichedOutlookEvent {
  const startTz = resolveTimeZone(
    userTimezone ?? event.start.timeZone ?? "UTC"
  );
  const endTz = resolveTimeZone(userTimezone ?? event.end.timeZone ?? "UTC");

  const startInstant = fromZonedTime(
    event.start.dateTime,
    resolveTimeZone(event.start.timeZone ?? "UTC")
  );
  const endInstant = fromZonedTime(
    event.end.dateTime,
    resolveTimeZone(event.end.timeZone ?? "UTC")
  );
  const startDayOfWeek = formatInTimeZone(startInstant, startTz, "EEEE");
  const endDayOfWeek = formatInTimeZone(endInstant, endTz, "EEEE");

  return {
    ...event,
    start: {
      dateTime: event.start.dateTime,
      timeZone: event.start.timeZone,
      isAllDay: event.isAllDay ?? false,
      eventDayOfWeek: startDayOfWeek,
    },
    end: {
      dateTime: event.end.dateTime,
      timeZone: event.end.timeZone,
      isAllDay: event.isAllDay ?? false,
      eventDayOfWeek: endDayOfWeek,
    },
  };
}

// Graph fills the whole pattern object whatever the pattern type is, defaulting
// the fields the type does not use — a weekly pattern still carries
// `index: "first"` and `dayOfMonth: 0`. So only read the fields the type gives
// meaning to: rendering `index` unconditionally turns "every monday" into
// "the first monday", and dropping it turns "the second thursday of every third
// month" into "every thursday".
// https://learn.microsoft.com/en-us/graph/api/resources/recurrencepattern
function renderRecurrencePattern(
  recurrence: OutlookEvent["recurrence"]
): string | null {
  const pattern = recurrence?.pattern;
  if (!pattern?.type) {
    return null;
  }

  const parts = [pattern.type];
  if (pattern.interval && pattern.interval > 1) {
    parts.push(`(every ${pattern.interval})`);
  }

  const days = pattern.daysOfWeek?.length
    ? pattern.daysOfWeek.join(", ")
    : null;

  switch (pattern.type) {
    case "relativeMonthly":
    case "relativeYearly":
      if (days) {
        parts.push(`on the ${pattern.index ?? "first"} ${days}`);
      }
      break;
    case "absoluteMonthly":
    case "absoluteYearly":
      if (pattern.dayOfMonth) {
        parts.push(`on day ${pattern.dayOfMonth}`);
      }
      break;
    // `daily` has no day qualifier, `weekly` lists its days plainly.
    default:
      if (days) {
        parts.push(`on ${days}`);
      }
  }

  if (
    pattern.month &&
    (pattern.type === "absoluteYearly" || pattern.type === "relativeYearly")
  ) {
    parts.push(`of month ${pattern.month}`);
  }

  return parts.join(" ");
}

// `recurrence` is only populated on the series master: occurrences returned by
// /calendarView carry `type` but a null recurrence, hence the two signals.
function renderRecurrence(
  event: Pick<OutlookEvent, "type" | "recurrence">
): string | null {
  const pattern = renderRecurrencePattern(event.recurrence);
  const suffix = pattern ? ` - ${pattern}` : "";

  switch (event.type) {
    case "seriesMaster":
      return `Recurring: yes, series master${suffix}`;
    case "occurrence":
      return `Recurring: yes, occurrence of a series${suffix}`;
    case "exception":
      return `Recurring: yes, modified occurrence of a series${suffix}`;
    case "singleInstance":
      return "Recurring: no";
    default:
      return pattern ? `Recurring: yes${suffix}` : null;
  }
}

export function renderOutlookEvent(
  event: OutlookEvent,
  userTimezone?: string
): string {
  const enrichedEvent = enrichEventWithDayOfWeek(event, userTimezone);

  const lines: string[] = [];

  lines.push(`# ${enrichedEvent.subject ?? "Untitled event"}`);
  if (enrichedEvent.subject) {
    lines.push(`Title: ${enrichedEvent.subject}`);
  }

  if (enrichedEvent.start) {
    const start = enrichedEvent.start;
    const targetTz = resolveTimeZone(userTimezone ?? start.timeZone ?? "UTC");
    const startInstant = fromZonedTime(
      start.dateTime,
      resolveTimeZone(start.timeZone ?? "UTC")
    );

    if (start.isAllDay) {
      const dateStr = formatInTimeZone(startInstant, targetTz, "MMMM d, yyyy");
      lines.push(`Date: ${start.eventDayOfWeek}, ${dateStr} (All day)`);
    } else {
      const timeStr = formatInTimeZone(startInstant, targetTz, "h:mm a");
      const dateStr = formatInTimeZone(startInstant, targetTz, "MMMM d, yyyy");
      lines.push(
        `Start: ${start.eventDayOfWeek}, ${dateStr} at ${timeStr} (${targetTz})`
      );
    }
  }

  if (enrichedEvent.end && !enrichedEvent.isAllDay) {
    const end = enrichedEvent.end;
    const targetTz = resolveTimeZone(userTimezone ?? end.timeZone ?? "UTC");
    const endInstant = fromZonedTime(
      end.dateTime,
      resolveTimeZone(end.timeZone ?? "UTC")
    );

    const timeStr = formatInTimeZone(endInstant, targetTz, "h:mm a");
    const dateStr = formatInTimeZone(endInstant, targetTz, "MMMM d, yyyy");
    lines.push(
      `End: ${end.eventDayOfWeek}, ${dateStr} at ${timeStr} (${targetTz})`
    );
  }

  const joinUrl = enrichedEvent.onlineMeeting?.joinUrl;
  const location = enrichedEvent.location?.displayName;

  // Skip the auto-generated "Microsoft Teams Meeting" location when we have
  // the actual join URL — otherwise keep it as the only Teams signal available.
  if (location && (location !== "Microsoft Teams Meeting" || !joinUrl)) {
    lines.push(`Location: ${location}`);
  }

  if (joinUrl?.startsWith("https://")) {
    lines.push(`Teams Meeting: [Join](${joinUrl})`);
  }

  if (enrichedEvent.body?.content) {
    const bodyContent =
      enrichedEvent.body.contentType === "html"
        ? stripHtmlTags(enrichedEvent.body.content)
        : enrichedEvent.body.content;

    if (bodyContent.trim()) {
      lines.push(`## Description\n${bodyContent.trim()}`);
    }
  }

  if (enrichedEvent.organizer) {
    const organizer = enrichedEvent.organizer.emailAddress.name
      ? `${enrichedEvent.organizer.emailAddress.name} (${enrichedEvent.organizer.emailAddress.address})`
      : enrichedEvent.organizer.emailAddress.address;
    lines.push(`Organizer: ${organizer}`);
  }

  if (enrichedEvent.attendees && enrichedEvent.attendees.length > 0) {
    const attendeeList = enrichedEvent.attendees
      .map((a) => {
        const name = a.emailAddress.name
          ? `${a.emailAddress.name} (${a.emailAddress.address})`
          : (a.emailAddress.address ?? "Unknown");
        const status = a.status.response ? ` - ${a.status.response}` : "";
        return `${name}${status}`;
      })
      .join(", ");
    lines.push(`Attendees: ${attendeeList}`);
  }

  if (enrichedEvent.importance && enrichedEvent.importance !== "normal") {
    lines.push(`Importance: ${enrichedEvent.importance}`);
  }

  if (enrichedEvent.showAs) {
    lines.push(`Show as: ${enrichedEvent.showAs}`);
  }

  if (enrichedEvent.categories && enrichedEvent.categories.length > 0) {
    lines.push(`Categories: ${enrichedEvent.categories.join(", ")}`);
  }

  const recurrence = renderRecurrence(enrichedEvent);
  if (recurrence) {
    lines.push(recurrence);
  }

  if (enrichedEvent.isCancelled) {
    lines.push("Status: Cancelled");
  }

  if (enrichedEvent.id) {
    lines.push(`Event ID: ${enrichedEvent.id}`);
  }

  if (enrichedEvent.seriesMasterId) {
    lines.push(`Series Master Event ID: ${enrichedEvent.seriesMasterId}`);
  }

  return lines.join("\n");
}

export function renderOutlookEventList(
  events: OutlookEvent[],
  {
    userTimezone,
    hasMore,
  }: {
    userTimezone?: string;
    hasMore: boolean;
  }
): string {
  if (events.length === 0) {
    return "No event found.";
  }

  const eventCount = events.length;

  const lines: string[] = [
    `Found ${eventCount} event${pluralize(eventCount)}${hasMore ? " (more available)" : ""}`,
  ];

  for (const event of events) {
    lines.push("\n---");
    lines.push(renderOutlookEvent(event, userTimezone));
  }

  return lines.join("\n");
}

export function renderAvailabilityCheck(
  allEvents: OutlookEvent[],
  startTime: string,
  endTime: string
): string {
  // Possible values for showAs are free, tentative, busy, oof, workingElsewhere, unknown.
  // cf. https://learn.microsoft.com/fr-fr/graph/api/resources/event?view=graph-rest-1.0
  const blockingStatuses = ["busy", "tentative", "oof"];
  const blockingEvents = allEvents.filter((event) => {
    if (event.isCancelled) {
      return false;
    }
    return blockingStatuses.includes(event.showAs ?? "busy");
  });

  const available = blockingEvents.length === 0;

  const lines: string[] = [];
  if (available) {
    lines.push("User is AVAILABLE during this time period");
    lines.push("");
    lines.push(`Period: ${startTime} to ${endTime}`);
    if (allEvents.length > 0) {
      const freeEvents = allEvents.filter(
        (e) => !e.isCancelled && (e.showAs === "free" || !e.showAs)
      );
      if (freeEvents.length > 0) {
        lines.push("");
        lines.push(
          `Note: There ${freeEvents.length === 1 ? "is" : "are"} ${freeEvents.length} event${pluralize(freeEvents.length)} during this period marked as 'free'`
        );
      }
    }
  } else {
    lines.push("User is NOT AVAILABLE during this time period");
    lines.push("");
    lines.push(`Period: ${startTime} to ${endTime}`);
    lines.push(
      `Blocking events: ${blockingEvents.length} event${pluralize(blockingEvents.length)}`
    );
    lines.push("");
    lines.push("Conflicting events:");
    lines.push("");
    blockingEvents.forEach((event, index) => {
      if (index > 0) {
        lines.push("");
      }
      lines.push(
        `${index + 1}. ${event.subject ?? "(No title)"} - ${event.showAs ?? "busy"}`
      );
      lines.push(`   ${event.start.dateTime} to ${event.end.dateTime}`);
      if (event.location?.displayName) {
        lines.push(`   Location: ${event.location.displayName}`);
      }
    });
  }

  return lines.join("\n");
}

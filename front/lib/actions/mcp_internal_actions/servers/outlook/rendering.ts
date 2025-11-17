import type { OutlookEvent } from "@app/lib/actions/mcp_internal_actions/servers/outlook/outlook_api_helper";
import { pluralize } from "@app/types";

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
    .replace(/<style[^>]*>.*?<\/style>/gis, "")
    .replace(/<script[^>]*>.*?<\/script>/gis, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim();
}

function enrichEventWithDayOfWeek(
  event: OutlookEvent,
  userTimezone?: string
): EnrichedOutlookEvent {
  const enrichedEvent: EnrichedOutlookEvent = {
    ...event,
    start: {
      dateTime: event.start.dateTime,
      timeZone: event.start.timeZone,
      isAllDay: event.isAllDay ?? false,
    },
    end: {
      dateTime: event.end.dateTime,
      timeZone: event.end.timeZone,
      isAllDay: event.isAllDay ?? false,
    },
  };

  const startDate = new Date(event.start.dateTime);
  enrichedEvent.start.eventDayOfWeek = startDate.toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: userTimezone ?? event.start.timeZone ?? undefined,
  });

  const endDate = new Date(event.end.dateTime);
  enrichedEvent.end.eventDayOfWeek = endDate.toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: userTimezone ?? event.end.timeZone ?? undefined,
  });

  return enrichedEvent;
}

export function renderOutlookEvent(
  event: OutlookEvent,
  userTimezone?: string
): string {
  const enrichedEvent = enrichEventWithDayOfWeek(event, userTimezone);
  const lines: string[] = [];

  if (enrichedEvent.subject) {
    lines.push(`Title: ${enrichedEvent.subject}`);
  }

  if (enrichedEvent.start) {
    const start = enrichedEvent.start;
    if (start.isAllDay) {
      const startDate = new Date(start.dateTime);
      const dateStr = startDate.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      lines.push(`Date: ${start.eventDayOfWeek}, ${dateStr} (All day)`);
    } else {
      const startDate = new Date(start.dateTime);
      const timeStr = startDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: userTimezone ?? start.timeZone ?? undefined,
      });
      const dateStr = startDate.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: userTimezone ?? start.timeZone ?? undefined,
      });
      lines.push(
        `Start: ${start.eventDayOfWeek}, ${dateStr} at ${timeStr}${start.timeZone ? ` (${start.timeZone})` : ""}`
      );
    }
  }

  if (enrichedEvent.end && !enrichedEvent.isAllDay) {
    const end = enrichedEvent.end;
    const endDate = new Date(end.dateTime);
    const timeStr = endDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: userTimezone ?? end.timeZone ?? undefined,
    });
    const dateStr = endDate.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: userTimezone ?? end.timeZone ?? undefined,
    });
    lines.push(
      `End: ${end.eventDayOfWeek}, ${dateStr} at ${timeStr}${end.timeZone ? ` (${end.timeZone})` : ""}`
    );
  }

  if (enrichedEvent.location?.displayName) {
    lines.push(`Location: ${enrichedEvent.location.displayName}`);
  }

  if (enrichedEvent.body?.content) {
    const bodyContent =
      enrichedEvent.body.contentType === "html"
        ? stripHtmlTags(enrichedEvent.body.content)
        : enrichedEvent.body.content;

    if (bodyContent.trim()) {
      lines.push(`Description: ${bodyContent}`);
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
        const name = a.emailAddress.name ?? a.emailAddress.address ?? "Unknown";
        const status = a.status.response ? ` (${a.status.response})` : "";
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

  if (enrichedEvent.isCancelled) {
    lines.push("Status: Cancelled");
  }

  if (enrichedEvent.id) {
    lines.push(`Event ID: ${enrichedEvent.id}`);
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
    lines.push("\n---\n");
    lines.push(renderOutlookEvent(event, userTimezone));
  }

  return lines.join("\n");
}

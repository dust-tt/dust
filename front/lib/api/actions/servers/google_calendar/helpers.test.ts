import type {
  EnrichedGoogleCalendarEvent,
  GoogleCalendarEvent,
} from "@app/lib/api/actions/servers/google_calendar/helpers";
import {
  enrichEventWithDayOfWeek,
  formatEventAsText,
  normalizeTimezone,
} from "@app/lib/api/actions/servers/google_calendar/helpers";
import { describe, expect, it } from "vitest";

describe("formatEventAsText - attachments", () => {
  it("surfaces attachment title, mime type and file URL", () => {
    const event: EnrichedGoogleCalendarEvent = {
      summary: "Weekly 1:1",
      attachments: [
        {
          fileUrl: "https://docs.google.com/document/d/abc123/edit",
          title: "1:1 Rolling Notes",
          mimeType: "application/vnd.google-apps.document",
          fileId: "abc123",
        },
      ],
    };

    const text = formatEventAsText(event);

    expect(text).toContain(
      "Attachments: 1:1 Rolling Notes [application/vnd.google-apps.document]: https://docs.google.com/document/d/abc123/edit"
    );
  });

  it("lists multiple attachments separated by commas", () => {
    const event: EnrichedGoogleCalendarEvent = {
      summary: "Comex",
      attachments: [
        { fileUrl: "https://drive.google.com/file/1", title: "Agenda" },
        { fileUrl: "https://drive.google.com/file/2", title: "Notes" },
      ],
    };

    const text = formatEventAsText(event);

    expect(text).toContain(
      "Attachments: Agenda: https://drive.google.com/file/1, Notes: https://drive.google.com/file/2"
    );
  });

  it("ignores attachments without a file URL", () => {
    const event: EnrichedGoogleCalendarEvent = {
      summary: "No links",
      attachments: [{ title: "Broken attachment" }],
    };

    const text = formatEventAsText(event);

    expect(text).not.toContain("Attachments:");
  });

  it("does not emit an attachments line when there are none", () => {
    const event: EnrichedGoogleCalendarEvent = {
      summary: "Plain event",
    };

    const text = formatEventAsText(event);

    expect(text).not.toContain("Attachments:");
  });
});

describe("normalizeTimezone", () => {
  it("keeps valid IANA timezone names", () => {
    expect(normalizeTimezone("Europe/Paris")).toBe("Europe/Paris");
    expect(normalizeTimezone("America/New_York")).toBe("America/New_York");
    expect(normalizeTimezone("UTC")).toBe("UTC");
  });

  it("converts GMT/UTC offset strings to Intl-compatible offsets", () => {
    expect(normalizeTimezone("GMT+02:00")).toBe("+02:00");
    expect(normalizeTimezone("GMT-05:00")).toBe("-05:00");
    expect(normalizeTimezone("UTC+1")).toBe("+01:00");
    expect(normalizeTimezone("GMT+05:30")).toBe("+05:30");
  });

  it("returns null for empty or unparseable values", () => {
    expect(normalizeTimezone(null)).toBeNull();
    expect(normalizeTimezone(undefined)).toBeNull();
    expect(normalizeTimezone("")).toBeNull();
    expect(normalizeTimezone("Not/AZone")).toBeNull();
  });
});

describe("enrichEventWithDayOfWeek - timezone handling", () => {
  it("does not throw on UTC offset timezones once normalized", () => {
    const event: GoogleCalendarEvent = {
      summary: "Timed meeting",
      start: { dateTime: "2026-06-30T10:00:00Z" },
      end: { dateTime: "2026-06-30T11:00:00Z" },
    };

    expect(() =>
      enrichEventWithDayOfWeek(event, normalizeTimezone("GMT+02:00"))
    ).not.toThrow();

    const enriched = enrichEventWithDayOfWeek(
      event,
      normalizeTimezone("GMT+02:00")
    );
    expect(enriched.start?.eventDayOfWeek).toBe("Tuesday");
  });
});

describe("formatEventAsText - timezone handling", () => {
  it("does not throw when the event carries a UTC offset timeZone", () => {
    const enriched = enrichEventWithDayOfWeek(
      {
        summary: "Timed meeting",
        start: { dateTime: "2026-06-30T10:00:00Z", timeZone: "GMT+02:00" },
        end: { dateTime: "2026-06-30T11:00:00Z", timeZone: "GMT+02:00" },
      },
      normalizeTimezone("GMT+02:00")
    );

    expect(() => formatEventAsText(enriched)).not.toThrow();

    const text = formatEventAsText(enriched);
    expect(text).toContain("Start: Tuesday, June 30, 2026 at 12:00 PM");
    expect(text).toContain("End: Tuesday, June 30, 2026 at 1:00 PM");
  });

  it("still formats correctly when the event timeZone is a valid IANA name", () => {
    const enriched = enrichEventWithDayOfWeek(
      {
        summary: "Timed meeting",
        start: { dateTime: "2026-06-30T10:00:00Z", timeZone: "Europe/Paris" },
        end: { dateTime: "2026-06-30T11:00:00Z", timeZone: "Europe/Paris" },
      },
      "Europe/Paris"
    );

    const text = formatEventAsText(enriched);
    expect(text).toContain("Start: Tuesday, June 30, 2026 at 12:00 PM");
  });

  it("keeps the raw timestamp when the event timeZone cannot be resolved", () => {
    const enriched = enrichEventWithDayOfWeek(
      {
        summary: "Timed meeting",
        start: {
          dateTime: "2026-06-30T10:00:00Z",
          timeZone: "Romance Standard Time",
        },
        end: {
          dateTime: "2026-06-30T11:00:00Z",
          timeZone: "Romance Standard Time",
        },
      },
      normalizeTimezone("GMT+02:00")
    );

    expect(() => formatEventAsText(enriched)).not.toThrow();

    const text = formatEventAsText(enriched);
    // The raw ISO timestamp (whose offset is authoritative) is preserved
    // rather than silently reformatted in the server's local timezone.
    expect(text).toContain(
      "Start: Tuesday, 2026-06-30T10:00:00Z (Romance Standard Time)"
    );
    expect(text).not.toContain("at 12:00 PM");
  });
});

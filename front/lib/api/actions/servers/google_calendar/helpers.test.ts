import type {
  EnrichedGoogleCalendarEvent,
  GoogleCalendarEvent,
} from "@app/lib/api/actions/servers/google_calendar/helpers";
import {
  buildUnavailableIntervals,
  computeAvailability,
  enrichEventWithDayOfWeek,
  formatAvailabilitySummary,
  formatEventAsText,
  mergeIntervals,
  normalizeTimezone,
  parseAvailabilityDateTime,
} from "@app/lib/api/actions/servers/google_calendar/helpers";
import { GOOGLE_CALENDAR_TOOLS_METADATA } from "@app/lib/api/actions/servers/google_calendar/metadata";
import assert from "assert";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function interval(start: string, end: string) {
  return { start: new Date(start), end: new Date(end) };
}

describe.each(["UTC", "Europe/Paris", "America/New_York"])(
  "calendar availability with host timezone %s",
  (hostTimezone) => {
    beforeEach(() => {
      vi.stubEnv("TZ", hostTimezone);
      expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(
        hostTimezone
      );
    });
    afterEach(() => vi.unstubAllEnvs());
    it("merges overlapping and adjacent intervals without mutating inputs", () => {
      const intervals = [
        interval("2026-07-01T12:00Z", "2026-07-01T13:00Z"),
        interval("2026-07-01T09:00Z", "2026-07-01T10:00Z"),
        interval("2026-07-01T10:00Z", "2026-07-01T12:30Z"),
        interval("2026-07-01T14:00Z", "2026-07-01T14:00Z"),
        interval("invalid", "2026-07-01T15:00Z"),
      ];
      const original = structuredClone(intervals);
      expect(mergeIntervals(intervals)).toEqual([
        interval("2026-07-01T09:00Z", "2026-07-01T13:00Z"),
      ]);
      expect(intervals).toEqual(original);
    });

    it("clips busy intervals and returns only the gaps in the requested range", () => {
      const range = interval("2026-07-01T09:00Z", "2026-07-01T17:00Z");
      const busy = mergeIntervals([
        interval("2026-07-01T08:00Z", "2026-07-01T10:00Z"),
        interval("2026-07-01T12:00Z", "2026-07-01T13:00Z"),
        interval("2026-07-01T16:00Z", "2026-07-01T18:00Z"),
      ]);
      expect(computeAvailability(range, busy)).toEqual([
        interval("2026-07-01T10:00Z", "2026-07-01T12:00Z"),
        interval("2026-07-01T13:00Z", "2026-07-01T16:00Z"),
      ]);
      expect(computeAvailability(range, [])).toEqual([range]);
      expect(computeAvailability(interval("invalid", "invalid"), [])).toEqual(
        []
      );
    });

    it("keeps daily windows in participant local time across DST", () => {
      const range = interval("2026-03-07T05:00Z", "2026-03-09T04:00Z");
      const participant = {
        email: "user@example.com",
        timezone: "America/New_York",
        dailyTimeWindowStart: "09:00",
        dailyTimeWindowEnd: "17:00",
      };
      const unavailable = buildUnavailableIntervals(range, participant, false);
      expect(computeAvailability(range, mergeIntervals(unavailable))).toEqual([
        interval("2026-03-07T14:00Z", "2026-03-07T22:00Z"),
        interval("2026-03-08T13:00Z", "2026-03-08T21:00Z"),
      ]);
    });

    it("excludes weekends in each participant's timezone and clips partial days", () => {
      const range = interval("2026-07-03T14:00Z", "2026-07-05T18:00Z");
      expect(
        buildUnavailableIntervals(
          range,
          {
            email: "user@example.com",
            timezone: "Asia/Tokyo",
          },
          true
        )
      ).toEqual([
        interval("2026-07-03T15:00Z", "2026-07-04T15:00Z"),
        interval("2026-07-04T15:00Z", "2026-07-05T15:00Z"),
      ]);
    });

    it("supports one-sided windows and a window in a skipped hour", () => {
      const range = interval("2026-03-08T05:00Z", "2026-03-09T04:00Z");
      expect(
        computeAvailability(
          range,
          mergeIntervals(
            buildUnavailableIntervals(
              range,
              {
                email: "user@example.com",
                timezone: "America/New_York",
                dailyTimeWindowStart: "02:30",
              },
              false
            )
          )
        )
      ).toEqual([interval("2026-03-08T07:30Z", "2026-03-09T04:00Z")]);
      expect(
        buildUnavailableIntervals(
          range,
          {
            email: "user@example.com",
            timezone: "America/New_York",
            dailyTimeWindowEnd: "17:00",
          },
          false
        )
      ).toEqual([interval("2026-03-08T21:00Z", "2026-03-09T04:00Z")]);
    });

    it("preserves London's valid window across a cross-zone rollback", () => {
      const range = interval("2026-10-24T00:00Z", "2026-10-27T00:00Z");
      const unavailable = buildUnavailableIntervals(
        range,
        {
          email: "user@example.com",
          timezone: "Europe/London",
          dailyTimeWindowStart: "02:30",
          dailyTimeWindowEnd: "03:30",
        },
        false
      );
      expect(computeAvailability(range, mergeIntervals(unavailable))).toEqual([
        interval("2026-10-24T01:30Z", "2026-10-24T02:30Z"),
        interval("2026-10-25T02:30Z", "2026-10-25T03:30Z"),
        interval("2026-10-26T02:30Z", "2026-10-26T03:30Z"),
      ]);
    });

    it("selects the earlier Paris window start in a repeated hour", () => {
      const range = interval("2026-10-24T00:00Z", "2026-10-27T00:00Z");
      const unavailable = buildUnavailableIntervals(
        range,
        {
          email: "user@example.com",
          timezone: "Europe/Paris",
          dailyTimeWindowStart: "02:30",
          dailyTimeWindowEnd: "03:30",
        },
        false
      );
      expect(computeAvailability(range, mergeIntervals(unavailable))).toEqual([
        interval("2026-10-24T00:30Z", "2026-10-24T01:30Z"),
        interval("2026-10-25T00:30Z", "2026-10-25T02:30Z"),
        interval("2026-10-26T01:30Z", "2026-10-26T02:30Z"),
      ]);
    });

    it("selects the earlier Paris window end in a repeated hour", () => {
      const range = interval("2026-10-24T22:00Z", "2026-10-25T23:00Z");
      const unavailable = buildUnavailableIntervals(
        range,
        {
          email: "user@example.com",
          timezone: "Europe/Paris",
          dailyTimeWindowStart: "01:30",
          dailyTimeWindowEnd: "02:30",
        },
        false
      );
      expect(computeAvailability(range, mergeIntervals(unavailable))).toEqual([
        interval("2026-10-24T23:30Z", "2026-10-25T00:30Z"),
      ]);
    });

    it("ends an excluded weekend at midnight after a skipped midnight", () => {
      const range = interval("2026-09-05T04:00Z", "2026-09-08T03:00Z");
      const unavailable = buildUnavailableIntervals(
        range,
        {
          email: "user@example.com",
          timezone: "America/Santiago",
        },
        true
      );
      expect(computeAvailability(range, mergeIntervals(unavailable))).toEqual([
        interval("2026-09-07T03:00Z", "2026-09-08T03:00Z"),
      ]);
    });

    it("skips a missing calendar day when excluding weekends", () => {
      const range = interval("2011-12-29T10:00Z", "2012-01-01T10:00Z");
      const unavailable = buildUnavailableIntervals(
        range,
        {
          email: "user@example.com",
          timezone: "Pacific/Apia",
          dailyTimeWindowStart: "09:00",
          dailyTimeWindowEnd: "17:00",
        },
        true
      );
      expect(computeAvailability(range, mergeIntervals(unavailable))).toEqual([
        interval("2011-12-29T19:00Z", "2011-12-30T03:00Z"),
      ]);
    });

    it("preserves availability summary formatting in the reference timezone", () => {
      const range = interval("2026-07-01T14:00Z", "2026-07-01T15:00Z");
      const text = formatAvailabilitySummary({
        participants: [
          { email: "user@example.com", timezone: "America/New_York" },
        ],
        range,
        availabilitySlots: [range],
        excludeWeekends: false,
      });
      expect(text).toContain("Wed, Jul 1 2026 at 10:00 EDT");
      expect(text).toContain("Wed, Jul 1 2026 at 11:00 EDT");
      expect(text).toContain("user@example.com (America/New_York)");
    });
  }
);

describe("parseAvailabilityDateTime", () => {
  it.each([
    ["2026-07-01T10:00:00+02:00", "2026-07-01T08:00:00.000Z"],
    ["2026-07-01T10:00:00+02", "2026-07-01T08:00:00.000Z"],
    ["2026-07-01T10:00:00+0200", "2026-07-01T08:00:00.000Z"],
    ["2026-07-01T10:00:00-0530", "2026-07-01T15:30:00.000Z"],
    ["2026-07-01T10:00:00.123", "2026-07-01T10:00:00.123Z"],
    ["2026-07-01T10:30.5", "2026-07-01T10:30:30.000Z"],
    ["2026-07-01T10:30,5", "2026-07-01T10:30:30.000Z"],
    ["2026-07-01T10.5", "2026-07-01T10:30:00.000Z"],
    ["2026-07-01T10:30.5+02:00", "2026-07-01T08:30:30.000Z"],
    ["2026-03-29T02:30:00", "2026-03-29T02:30:00.000Z"],
    ["2026-07-01", "2026-07-01T00:00:00.000Z"],
    ["2026-07-01T24:00:00Z", "2026-07-02T00:00:00.000Z"],
  ])("parses %s with UTC as the default timezone", (value, expected) => {
    expect(parseAvailabilityDateTime(value).toISOString()).toBe(expected);
  });

  it.each([
    "invalid",
    "2026-02-30T10:00:00Z",
    "2026-07-01T24:30:00Z",
    "2026-07-01T10:00:00+02:0",
    "2026-07-01T10:00:00+02:",
    "2026-07-01T10:00:00+02:000",
    "2026-07-01T10:00:00+02:60",
    "2026-07-01T10:00:00+24:00",
    "2026-07-01T10:00:00+02:00Z",
    "2026-07-01T10:00:00ZZ",
    "2026-07-01T10:00:00junk",
    "2026-07-01T24.5",
    "2026-07-01T10.5:30",
    "2026-07-01T10:30.5:20",
  ])("rejects invalid timestamp %s", (value) => {
    expect(Number.isNaN(parseAvailabilityDateTime(value).getTime())).toBe(true);
  });
});

describe("availability participant timezone validation", () => {
  const tool = GOOGLE_CALENDAR_TOOLS_METADATA.find(
    (tool) => tool.name === "check_availability"
  );
  assert(tool);

  it.each([0, 1])(
    "rejects an invalid timezone for participant %i",
    (invalidIndex) => {
      const participants = [
        { email: "first@example.com", timezone: "Europe/Paris" },
        { email: "second@example.com", timezone: "America/New_York" },
      ].map((participant, index) => ({
        ...participant,
        timezone:
          index === invalidIndex ? "America/NewYork" : participant.timezone,
      }));
      const result = tool.schema.participants.safeParse(participants);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual([
          invalidIndex,
          "timezone",
        ]);
      }
    }
  );

  it("accepts valid participant timezones", () => {
    expect(
      tool.schema.participants.safeParse([
        { email: "first@example.com", timezone: "UTC" },
        { email: "second@example.com", timezone: "America/New_York" },
      ]).success
    ).toBe(true);
  });
});

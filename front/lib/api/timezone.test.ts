import {
  dayBoundaryInTimezone,
  isValidTimezone,
  localTimeOfDayToUtc,
  parseCalendarDate,
  timezoneSchema,
} from "@app/lib/api/timezone";
import { describe, expect, it } from "vitest";

describe("isValidTimezone", () => {
  it("accepts valid IANA timezones", () => {
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Europe/Paris")).toBe(true);
    expect(isValidTimezone("America/New_York")).toBe(true);
  });

  it("rejects invalid, empty, or Windows-style timezones", () => {
    expect(isValidTimezone("Not/AZone")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone("Pacific Standard Time")).toBe(false);
  });
});

describe("localTimeOfDayToUtc", () => {
  it("passes through unchanged for UTC", () => {
    expect(localTimeOfDayToUtc(9, 30, "UTC")).toEqual({ hour: 9, minute: 30 });
  });

  it("falls back to UTC for an unrecognized timezone", () => {
    expect(localTimeOfDayToUtc(9, 30, "Not/AZone")).toEqual({
      hour: 9,
      minute: 30,
    });
  });

  it("applies a half-hour offset", () => {
    // Midnight IST (UTC+5:30) is 18:30 UTC the previous day.
    const reference = new Date("2024-06-15T00:00:00Z");
    expect(localTimeOfDayToUtc(0, 0, "Asia/Kolkata", reference)).toEqual({
      hour: 18,
      minute: 30,
    });
  });

  it("resolves against the reference date's own DST offset", () => {
    const winter = new Date("2024-01-15T00:00:00Z"); // EST, UTC-5
    const summer = new Date("2024-07-15T00:00:00Z"); // EDT, UTC-4
    expect(localTimeOfDayToUtc(23, 0, "America/New_York", winter)).toEqual({
      hour: 4,
      minute: 0,
    });
    expect(localTimeOfDayToUtc(23, 0, "America/New_York", summer)).toEqual({
      hour: 3,
      minute: 0,
    });
  });

  it("resolves against the true offset for an instant just before a DST transition", () => {
    // US spring-forward on 2024-03-10: 2am EST (07:00 UTC) becomes 3am EDT.
    // 04:00 UTC is still EST (UTC-5), not yet EDT (UTC-4).
    const reference = new Date("2024-03-10T04:00:00Z");
    expect(localTimeOfDayToUtc(23, 0, "America/New_York", reference)).toEqual({
      hour: 4,
      minute: 0,
    });
  });
});

describe("dayBoundaryInTimezone", () => {
  it("resolves the start of a bare calendar date as local midnight, not a UTC-then-reobserved instant", () => {
    // If the bare date were parsed as UTC first, this would resolve to June 14 (America/New_York
    // is behind UTC), not June 15.
    expect(
      dayBoundaryInTimezone("2024-06-15", "America/New_York").toISOString()
    ).toBe("2024-06-15T04:00:00.000Z");
  });

  it("resolves the end of the same date to 23:59:59.999 local", () => {
    expect(
      dayBoundaryInTimezone("2024-06-15", "America/New_York", {
        boundary: "end",
      }).toISOString()
    ).toBe("2024-06-16T03:59:59.999Z");
  });

  it("applies offsetDays as whole calendar days", () => {
    expect(
      dayBoundaryInTimezone("2024-06-15", "America/New_York", {
        offsetDays: -1,
      }).toISOString()
    ).toBe("2024-06-14T04:00:00.000Z");
    expect(
      dayBoundaryInTimezone("2024-06-15", "America/New_York", {
        offsetDays: 1,
      }).toISOString()
    ).toBe("2024-06-16T04:00:00.000Z");
  });

  it("counts a DST spring-forward (23h) day as exactly one day", () => {
    // 2024-03-10 is the DST transition day in America/New_York (2am -> 3am), so
    // stepping over it covers only 23 real hours.
    expect(
      dayBoundaryInTimezone("2024-03-10", "America/New_York", {
        offsetDays: 1,
      }).toISOString()
    ).toBe("2024-03-11T04:00:00.000Z");
  });

  it("returns an Invalid Date for a non-existent day, an unparseable string, or an unknown zone", () => {
    expect(
      dayBoundaryInTimezone("2024-02-30", "America/New_York").getTime()
    ).toBeNaN();
    expect(
      dayBoundaryInTimezone("2024-06-15T00:00:00.000Z", "UTC").getTime()
    ).toBeNaN();
    expect(dayBoundaryInTimezone("2024-06-15", "Bad/Zone").getTime()).toBeNaN();
  });
});

describe("parseCalendarDate", () => {
  it("accepts a real calendar day", () => {
    expect(parseCalendarDate("2024-02-29")).toEqual({
      year: 2024,
      month: 2,
      day: 29,
    });
  });

  it("rejects days that do not exist and non-bare inputs", () => {
    expect(parseCalendarDate("2024-02-30")).toBeNull();
    expect(parseCalendarDate("2023-02-29")).toBeNull();
    expect(parseCalendarDate("2024-13-01")).toBeNull();
    expect(parseCalendarDate("2024-6-15")).toBeNull();
    expect(parseCalendarDate("2024-06-15T00:00:00Z")).toBeNull();
  });
});

describe("timezoneSchema", () => {
  it("defaults to UTC when omitted", () => {
    expect(timezoneSchema.parse(undefined)).toBe("UTC");
  });

  it("passes through a valid timezone", () => {
    expect(timezoneSchema.parse("Europe/Paris")).toBe("Europe/Paris");
  });

  it("rejects an invalid timezone", () => {
    expect(timezoneSchema.safeParse("Not/AZone").success).toBe(false);
  });
});

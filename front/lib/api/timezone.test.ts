import {
  isValidTimezone,
  localTimeOfDayToUtc,
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

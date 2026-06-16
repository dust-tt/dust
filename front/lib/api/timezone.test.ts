import { isValidTimezone, timezoneSchema } from "@app/lib/api/timezone";
import { describe, expect, it } from "vitest";

describe("isValidTimezone", () => {
  it("accepts valid IANA timezones", () => {
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Europe/Paris")).toBe(true);
    expect(isValidTimezone("America/New_York")).toBe(true);
  });

  it("rejects invalid or empty timezones", () => {
    expect(isValidTimezone("Not/AZone")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone("utc")).toBe(false);
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

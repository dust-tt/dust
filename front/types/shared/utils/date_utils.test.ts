import { describe, expect, it } from "vitest";

import { formatDateFromMillis, ordinalDay } from "./date_utils";

describe("formatDateFromMillis", () => {
  // 2026-06-09T15:00:00Z is local midnight 2026-06-10 in Asia/Tokyo (UTC+9):
  // the kind of date_histogram bucket key that was mis-rendered as 2026-06-09.
  const ms = Date.parse("2026-06-09T15:00:00Z");

  it("formats the day in UTC", () => {
    expect(formatDateFromMillis(ms, "UTC")).toBe("2026-06-09");
  });

  it("rolls to the local day for a positive-offset timezone", () => {
    expect(formatDateFromMillis(ms, "Asia/Tokyo")).toBe("2026-06-10");
  });

  it("keeps the local day for a negative-offset timezone", () => {
    expect(formatDateFromMillis(ms, "America/New_York")).toBe("2026-06-09");
  });
});

describe("ordinalDay", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
    [23, "23rd"],
    [31, "31st"],
  ])("formats %i as %s", (day, expected) => {
    expect(ordinalDay(day)).toBe(expected);
  });
});

import { setFormatLocale } from "@app/lib/i18n/format";
import { SUPPORTED_LOCALES } from "@app/types/locale";
import { format } from "date-fns";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { formatDateFromMillis, getTime, ordinalDay } from "./date_utils";

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

describe.each(
  SUPPORTED_LOCALES
)("getTime with %s as the format locale", (locale) => {
  beforeAll(() => {
    vi.stubEnv("TZ", "UTC");
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    setFormatLocale(undefined);
  });

  it.each([
    [Date.UTC(2025, 8, 23, 0, 5, 0), "00:05"],
    [Date.UTC(2025, 8, 23, 9, 7, 59), "09:07"],
    [Date.UTC(2025, 8, 23, 15, 37, 32), "15:37"],
    [Date.UTC(2025, 8, 23, 23, 59, 0), "23:59"],
  ])("formats %i as date-fns HH:mm", (timestamp, expected) => {
    setFormatLocale(locale);
    expect(getTime(timestamp)).toBe(expected);
    expect(getTime(timestamp)).toBe(format(timestamp, "HH:mm"));
  });
});

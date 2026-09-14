import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  formatCalendarDate,
  formatCalendarDateTime,
  formatDate,
  formatRelativeTime,
  getRelativeDateBucket,
} from "./timestamps";

// Built from local date components (not ISO/UTC strings) so assertions hold
// regardless of the timezone the test runner executes in — these helpers
// format and bucket dates in the system's local timezone, matching moment's
// default (timezone-naive) behavior.
const NOW = new Date(2026, 8, 10, 15, 0, 0); // Thu 2026-09-10 15:00 local

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("formatDate", () => {
  it("formats a Date object with the given pattern", () => {
    expect(formatDate(NOW, "yyyy-MM-dd")).toBe("2026-09-10");
  });

  it("formats a timestamp with the given pattern", () => {
    expect(formatDate(NOW.getTime(), "dd-MM-yyyy")).toBe("10-09-2026");
  });

  it("formats a date string with the given pattern", () => {
    expect(formatDate("2026-09-10T09:30:00", "h:mm a")).toBe("9:30 AM");
  });

  it("renders an invalid date like moment instead of throwing", () => {
    expect(formatDate(Number.NaN, "yyyy-MM-dd")).toBe("Invalid date");
    expect(formatDate("not-a-date", "yyyy-MM-dd")).toBe("Invalid date");
  });
});

describe("formatCalendarDate", () => {
  it("labels a time today as 'Today'", () => {
    expect(formatCalendarDate(new Date(2026, 8, 10, 9, 30, 0))).toBe("Today");
  });

  it("labels a time tomorrow as 'Tomorrow'", () => {
    expect(formatCalendarDate(new Date(2026, 8, 11, 9, 30, 0))).toBe(
      "Tomorrow"
    );
  });

  it("labels a time yesterday as 'Yesterday'", () => {
    expect(formatCalendarDate(new Date(2026, 8, 9, 9, 30, 0))).toBe(
      "Yesterday"
    );
  });

  it("labels a time within the last week as 'Last <weekday>'", () => {
    const lastSunday = new Date(2026, 8, 6, 15, 0, 0); // 4 days ago.
    expect(formatCalendarDate(lastSunday)).toBe("Last Sunday");
    const sevenDaysAgo = new Date(2026, 8, 3, 15, 0, 0);
    expect(formatCalendarDate(sevenDaysAgo)).toBe("Last Thursday");
  });

  it("labels a time within the next week as the plain weekday", () => {
    const inSixDays = new Date(2026, 8, 16, 15, 0, 0);
    expect(formatCalendarDate(inSixDays)).toBe("Wednesday");
    const inSevenDays = new Date(2026, 8, 17, 15, 0, 0);
    expect(formatCalendarDate(inSevenDays)).toBe("Thursday");
  });

  it("falls back to a plain date beyond a week in either direction", () => {
    const eightDaysAgo = new Date(2026, 8, 2, 15, 0, 0);
    expect(formatCalendarDate(eightDaysAgo)).toBe("02/09/2026");
    const eightDaysAhead = new Date(2026, 8, 18, 15, 0, 0);
    expect(formatCalendarDate(eightDaysAhead)).toBe("18/09/2026");
  });

  it("renders an invalid date like moment instead of throwing", () => {
    expect(formatCalendarDate(Number.NaN)).toBe("Invalid date");
    expect(formatCalendarDate(new Date(Number.NaN))).toBe("Invalid date");
  });
});

describe("formatRelativeTime", () => {
  it("formats a past date with the 'ago' suffix", () => {
    expect(formatRelativeTime(NOW.getTime() - 3 * HOUR)).toMatch(/ago$/);
  });

  it("formats a future date with the 'in' prefix", () => {
    expect(formatRelativeTime(NOW.getTime() + 2 * DAY)).toMatch(/^in /);
  });

  it("accepts a Date object", () => {
    expect(formatRelativeTime(new Date(NOW.getTime() - HOUR))).toMatch(/ago$/);
  });

  it("renders an invalid date like moment instead of throwing", () => {
    expect(formatRelativeTime(Number.NaN)).toBe("Invalid date");
    expect(formatRelativeTime(new Date(Number.NaN))).toBe("Invalid date");
  });
});

describe("formatCalendarDateTime", () => {
  it("labels a time today as 'Today at ...'", () => {
    const today = new Date(2026, 8, 10, 9, 30, 0);
    expect(formatCalendarDateTime(today)).toBe("Today at 9:30:00 AM");
  });

  it("labels a time yesterday as 'Yesterday at ...'", () => {
    const yesterday = new Date(2026, 8, 9, 9, 30, 0);
    expect(formatCalendarDateTime(yesterday)).toBe("Yesterday at 9:30:00 AM");
  });

  it("labels a time within the last week as 'Last <weekday> at ...'", () => {
    const lastSunday = new Date(2026, 8, 6, 9, 30, 0); // 2026-09-06 is a Sunday
    expect(formatCalendarDateTime(lastSunday)).toBe(
      "Last Sunday at 9:30:00 AM"
    );
    const sixDaysAgo = new Date(2026, 8, 4, 23, 59, 59);
    expect(formatCalendarDateTime(sixDaysAgo)).toBe(
      "Last Friday at 11:59:59 PM"
    );
  });

  it("falls back to a plain date from seven days ago", () => {
    const sevenDaysAgo = new Date(2026, 8, 3, 23, 59, 59);
    expect(formatCalendarDateTime(sevenDaysAgo)).toBe("09/03/2026");
    const twoWeeksAgo = new Date(2026, 7, 27, 9, 30, 0);
    expect(formatCalendarDateTime(twoWeeksAgo)).toBe("08/27/2026");
  });

  it("keeps moment's default future formats, which omit seconds", () => {
    expect(formatCalendarDateTime(new Date(2026, 8, 11, 0, 0, 30))).toBe(
      "Tomorrow at 12:00 AM"
    );
    expect(formatCalendarDateTime(new Date(2026, 8, 12, 9, 30, 15))).toBe(
      "Saturday at 9:30 AM"
    );
    expect(formatCalendarDateTime(new Date(2026, 8, 16, 9, 30, 0))).toBe(
      "Wednesday at 9:30 AM"
    );
    expect(formatCalendarDateTime(new Date(2026, 8, 17, 9, 30, 0))).toBe(
      "09/17/2026"
    );
  });

  it("uses the same reference instant for every comparison", () => {
    const now = new Date(2026, 8, 10, 0, 0, 0);
    expect(formatCalendarDateTime(new Date(2026, 8, 9, 23, 59, 59), now)).toBe(
      "Yesterday at 11:59:59 PM"
    );
  });

  it("renders an invalid date like moment instead of throwing", () => {
    expect(formatCalendarDateTime(Number.NaN)).toBe("Invalid date");
  });
});

describe("getRelativeDateBucket", () => {
  it("buckets a time today as 'Today'", () => {
    const today = new Date(2026, 8, 10, 1, 0, 0);
    expect(getRelativeDateBucket(today)).toBe("Today");
  });

  it("buckets a time yesterday as 'Yesterday'", () => {
    const yesterday = new Date(2026, 8, 9, 23, 0, 0);
    expect(getRelativeDateBucket(yesterday)).toBe("Yesterday");
  });

  it("buckets a time within the last week as 'Last Week'", () => {
    const fourDaysAgo = new Date(2026, 8, 6, 12, 0, 0);
    expect(getRelativeDateBucket(fourDaysAgo)).toBe("Last Week");
  });

  it("buckets a time within the last month as 'Last Month'", () => {
    const threeWeeksAgo = new Date(2026, 7, 20, 12, 0, 0);
    expect(getRelativeDateBucket(threeWeeksAgo)).toBe("Last Month");
  });

  it("buckets a time within the last 12 months as 'Last 12 Months'", () => {
    const sixMonthsAgo = new Date(2026, 2, 10, 12, 0, 0);
    expect(getRelativeDateBucket(sixMonthsAgo)).toBe("Last 12 Months");
  });

  it("buckets an older time as 'Older'", () => {
    const twoYearsAgo = new Date(2024, 8, 10, 12, 0, 0);
    expect(getRelativeDateBucket(twoYearsAgo)).toBe("Older");
  });

  it("treats each boundary as the local start of that day, inclusive", () => {
    expect(getRelativeDateBucket(new Date(2026, 8, 10, 0, 0, 0))).toBe("Today");
    expect(getRelativeDateBucket(new Date(2026, 8, 9, 23, 59, 59))).toBe(
      "Yesterday"
    );
    expect(getRelativeDateBucket(new Date(2026, 8, 9, 0, 0, 0))).toBe(
      "Yesterday"
    );
    expect(getRelativeDateBucket(new Date(2026, 8, 8, 23, 59, 59))).toBe(
      "Last Week"
    );
    expect(getRelativeDateBucket(new Date(2026, 8, 3, 0, 0, 0))).toBe(
      "Last Week"
    );
    expect(getRelativeDateBucket(new Date(2026, 8, 2, 23, 59, 59))).toBe(
      "Last Month"
    );
    expect(getRelativeDateBucket(new Date(2026, 7, 10, 0, 0, 0))).toBe(
      "Last Month"
    );
    expect(getRelativeDateBucket(new Date(2026, 7, 9, 23, 59, 59))).toBe(
      "Last 12 Months"
    );
    expect(getRelativeDateBucket(new Date(2025, 8, 10, 0, 0, 0))).toBe(
      "Last 12 Months"
    );
    expect(getRelativeDateBucket(new Date(2025, 8, 9, 23, 59, 59))).toBe(
      "Older"
    );
  });

  it("clamps the month boundary to the end of shorter months", () => {
    const now = new Date(2026, 2, 31, 12, 0, 0); // Mar 31: one month ago clamps to Feb 28.
    expect(getRelativeDateBucket(new Date(2026, 1, 28, 0, 0, 0), now)).toBe(
      "Last Month"
    );
    expect(getRelativeDateBucket(new Date(2026, 1, 27, 23, 59, 59), now)).toBe(
      "Last 12 Months"
    );
  });
});

describe("DST switch at midnight", () => {
  // In Chile clocks jump from 00:00 to 01:00 on the first Sunday of September, so the
  // start of 2026-09-06 is 01:00 local. Boundaries shifted from that instant must still
  // land on 00:00 of the earlier days, not 01:00.
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "America/Santiago";
  });

  afterEach(() => {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  });

  it("keeps the first hour of each boundary day in the right bucket", () => {
    const now = new Date(2026, 8, 6, 1, 0, 0);
    expect(now.getHours()).toBe(1);
    expect(new Date(2026, 8, 6, 0, 30, 0).getHours()).toBe(1);

    expect(getRelativeDateBucket(new Date(2026, 8, 5, 0, 30, 0), now)).toBe(
      "Yesterday"
    );
    expect(getRelativeDateBucket(new Date(2026, 7, 30, 0, 30, 0), now)).toBe(
      "Last Week"
    );
    expect(getRelativeDateBucket(new Date(2026, 7, 6, 0, 30, 0), now)).toBe(
      "Last Month"
    );
    expect(getRelativeDateBucket(new Date(2025, 8, 6, 0, 30, 0), now)).toBe(
      "Last 12 Months"
    );
  });

  it("labels the first hour of yesterday as 'Yesterday'", () => {
    const now = new Date(2026, 8, 6, 1, 0, 0);
    expect(formatCalendarDateTime(new Date(2026, 8, 5, 0, 30, 0), now)).toBe(
      "Yesterday at 12:30:00 AM"
    );
  });
});

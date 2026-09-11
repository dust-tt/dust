import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  formatCalendarDateTime,
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

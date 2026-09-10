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

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("formatRelativeTime", () => {
  it("formats a past date with a suffix", () => {
    const threeHoursAgo = new Date(NOW.getTime() - 3 * 60 * 60 * 1000);
    expect(formatRelativeTime(threeHoursAgo)).toBe("about 3 hours ago");
  });

  it("formats a future date with a suffix", () => {
    const inTwoDays = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(inTwoDays)).toBe("in 2 days");
  });

  it("accepts a timestamp number", () => {
    const oneHourAgoMs = NOW.getTime() - 60 * 60 * 1000;
    expect(formatRelativeTime(oneHourAgoMs)).toBe("about 1 hour ago");
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
  });

  it("falls back to a plain date beyond a week", () => {
    const twoWeeksAgo = new Date(2026, 7, 27, 9, 30, 0);
    expect(formatCalendarDateTime(twoWeeksAgo)).toBe("08/27/2026");
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
});

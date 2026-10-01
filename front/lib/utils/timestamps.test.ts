import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatDate, getRelativeDateBucket } from "./timestamps";

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
});

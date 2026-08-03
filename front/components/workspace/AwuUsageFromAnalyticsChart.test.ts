import { formatBucketRange } from "@app/components/workspace/AwuUsageFromAnalyticsChart";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("formatBucketRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Monday Jul 6, 2026. Last 30 days window: Jun 7 - Jul 6 (UTC).
    vi.setSystemTime(new Date("2026-07-06T15:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("month granularity", () => {
    it("clamps the first bucket to the window start", () => {
      expect(formatBucketRange(Date.UTC(2026, 5, 1), "month", 30)).toBe(
        "Jun 7 - 30"
      );
    });

    it("clamps the last bucket to today", () => {
      expect(formatBucketRange(Date.UTC(2026, 6, 1), "month", 30)).toBe(
        "Jul 1 - 6"
      );
    });

    it("shows the full range for an untruncated month", () => {
      expect(formatBucketRange(Date.UTC(2026, 4, 1), "month", 90)).toBe(
        "May 1 - 31"
      );
    });
  });

  describe("week granularity", () => {
    it("shows the full range for an untruncated week", () => {
      expect(formatBucketRange(Date.UTC(2026, 5, 8), "week", 30)).toBe(
        "Jun 8 - 14"
      );
    });

    it("repeats the month for a week spanning two months", () => {
      expect(formatBucketRange(Date.UTC(2026, 5, 29), "week", 30)).toBe(
        "Jun 29 - Jul 5"
      );
    });

    it("collapses a single-day bucket to one date", () => {
      // The week starting today only covers today.
      expect(formatBucketRange(Date.UTC(2026, 6, 6), "week", 30)).toBe("Jul 6");
    });

    it("collapses the first bucket when only its last day is in the window", () => {
      // Week of Jun 1 - 7 clamped to the Jun 7 window start.
      expect(formatBucketRange(Date.UTC(2026, 5, 1), "week", 30)).toBe("Jun 7");
    });

    it("repeats the month for a week spanning two years", () => {
      expect(formatBucketRange(Date.UTC(2025, 11, 29), "week", 365)).toBe(
        "Dec 29 - Jan 4"
      );
    });
  });
});

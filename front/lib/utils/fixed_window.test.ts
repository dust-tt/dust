import { computeCalendarWindowBounds } from "@app/lib/utils/rate_limiter";
import { describe, expect, it } from "vitest";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("computeCalendarWindowBounds", () => {
  describe("calendar_day", () => {
    it("labels by UTC date and expires at the next UTC midnight", () => {
      const now = new Date("2026-07-28T13:45:00.000Z");
      const { label, windowEndMs } = computeCalendarWindowBounds(
        "calendar_day",
        now
      );

      expect(label).toBe("2026-07-28");
      expect(windowEndMs).toBe(Date.UTC(2026, 6, 29));
      expect(now.getTime()).toBeLessThan(windowEndMs);
      expect(windowEndMs - Date.UTC(2026, 6, 28)).toBe(DAY_MS);
    });

    it("rolls over year boundaries", () => {
      const now = new Date("2026-12-31T23:59:59.000Z");
      const { label, windowEndMs } = computeCalendarWindowBounds(
        "calendar_day",
        now
      );

      expect(label).toBe("2026-12-31");
      expect(windowEndMs).toBe(Date.UTC(2027, 0, 1));
    });
  });

  describe("calendar_week", () => {
    it("anchors on the ISO Monday and spans exactly 7 days", () => {
      const now = new Date("2026-07-28T13:45:00.000Z"); // A Tuesday.
      const { label, windowEndMs } = computeCalendarWindowBounds(
        "calendar_week",
        now
      );

      // Label encodes the week's Monday.
      const [y, m, d] = label.replace("-w", "").split("-").map(Number);
      const mondayMs = Date.UTC(y, m - 1, d);
      const monday = new Date(mondayMs);

      expect(monday.getUTCDay()).toBe(1); // Monday.
      expect(mondayMs).toBeLessThanOrEqual(now.getTime());
      expect(now.getTime()).toBeLessThan(windowEndMs);
      expect(windowEndMs - mondayMs).toBe(7 * DAY_MS);
    });

    it("puts a Sunday in the week that ends that same day", () => {
      const now = new Date("2026-08-02T10:00:00.000Z"); // A Sunday.
      const { windowEndMs } = computeCalendarWindowBounds("calendar_week", now);
      const { windowEndMs: mondayWindowEndMs } = computeCalendarWindowBounds(
        "calendar_week",
        // The Monday six days earlier belongs to the same window.
        new Date("2026-07-27T10:00:00.000Z")
      );

      expect(windowEndMs).toBe(mondayWindowEndMs);
    });

    it("handles a week that straddles a month/year boundary", () => {
      const now = new Date("2027-01-01T00:00:00.000Z"); // A Friday.
      const { label, windowEndMs } = computeCalendarWindowBounds(
        "calendar_week",
        now
      );

      const [y, m, d] = label.replace("-w", "").split("-").map(Number);
      const monday = new Date(Date.UTC(y, m - 1, d));

      expect(monday.getUTCDay()).toBe(1);
      // The Monday is in the previous year/month.
      expect(monday.getTime()).toBeLessThan(now.getTime());
      expect(windowEndMs - monday.getTime()).toBe(7 * DAY_MS);
    });
  });

  describe("calendar_month", () => {
    it("labels by UTC month and expires at the first of the next month", () => {
      const now = new Date("2026-07-28T13:45:00.000Z");
      const { label, windowEndMs } = computeCalendarWindowBounds(
        "calendar_month",
        now
      );

      expect(label).toBe("2026-07");
      expect(windowEndMs).toBe(Date.UTC(2026, 7, 1));
    });

    it("rolls December over to the next January", () => {
      const now = new Date("2026-12-15T00:00:00.000Z");
      const { label, windowEndMs } = computeCalendarWindowBounds(
        "calendar_month",
        now
      );

      expect(label).toBe("2026-12");
      expect(windowEndMs).toBe(Date.UTC(2027, 0, 1));
    });
  });
});

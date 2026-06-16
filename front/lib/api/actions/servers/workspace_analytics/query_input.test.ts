import {
  MAX_QUERY_WINDOW_DAYS,
  resolveTimeWindow,
} from "@app/lib/api/actions/servers/workspace_analytics/query_input";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("resolveTimeWindow", () => {
  describe("explicit range", () => {
    it("resolves a valid range to inclusive day bounds", () => {
      const r = resolveTimeWindow({
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      });
      expect(r.isOk()).toBe(true);
      if (r.isOk()) {
        expect(r.value.startDate).toBe("2026-01-01T00:00:00.000Z");
        expect(r.value.endDate).toBe("2026-01-31T23:59:59.999Z");
        expect(r.value.label).toBe("2026-01-01 to 2026-01-31");
        expect(r.value.timezone).toBe("UTC");
      }
    });

    it("errors when only one bound is provided", () => {
      expect(resolveTimeWindow({ startDate: "2026-01-01" }).isErr()).toBe(true);
      expect(resolveTimeWindow({ endDate: "2026-01-01" }).isErr()).toBe(true);
    });

    it("errors when endDate is before startDate", () => {
      expect(
        resolveTimeWindow({
          startDate: "2026-02-01",
          endDate: "2026-01-01",
        }).isErr()
      ).toBe(true);
    });

    it(`accepts an inclusive span of exactly ${MAX_QUERY_WINDOW_DAYS} days`, () => {
      // 2026-01-01 .. 2026-04-10 inclusive = 100 days.
      expect(
        resolveTimeWindow({
          startDate: "2026-01-01",
          endDate: "2026-04-10",
        }).isOk()
      ).toBe(true);
    });

    it(`errors when the inclusive span exceeds ${MAX_QUERY_WINDOW_DAYS} days`, () => {
      // 2026-01-01 .. 2026-04-11 inclusive = 101 days.
      expect(
        resolveTimeWindow({
          startDate: "2026-01-01",
          endDate: "2026-04-11",
        }).isErr()
      ).toBe(true);
    });

    it("errors on an invalid calendar date", () => {
      expect(
        resolveTimeWindow({
          startDate: "2026-13-40",
          endDate: "2026-13-41",
        }).isErr()
      ).toBe(true);
    });
  });

  it("errors on an invalid timezone", () => {
    expect(
      resolveTimeWindow({ period: "this_month", timezone: "Not/AZone" }).isErr()
    ).toBe(true);
  });

  describe("relative periods (fixed clock at 2026-06-15T12:00:00Z)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("resolves this_month to the calendar month to date (UTC)", () => {
      const r = resolveTimeWindow({ period: "this_month" });
      expect(r.isOk()).toBe(true);
      if (r.isOk()) {
        expect(r.value.startDate).toBe("2026-06-01T00:00:00.000Z");
        expect(r.value.endDate).toBe("2026-06-15T12:00:00.000Z");
        expect(r.value.label).toBe("June 2026");
      }
    });

    it("resolves last_7_days to a 7-day window ending now", () => {
      const r = resolveTimeWindow({ period: "last_7_days" });
      expect(r.isOk()).toBe(true);
      if (r.isOk()) {
        expect(r.value.startDate).toBe("2026-06-09T00:00:00.000Z");
      }
    });

    it("falls back to the provided default period when none is given", () => {
      const r = resolveTimeWindow({}, "last_30_days");
      expect(r.isOk()).toBe(true);
      if (r.isOk()) {
        expect(r.value.startDate).toBe("2026-05-17T00:00:00.000Z");
        expect(r.value.label).toBe("the last 30 days");
      }
    });
  });
});

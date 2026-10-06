import { getNextOccurrences } from "@app/lib/utils/schedule_next_occurrences";
import type { IntervalScheduleConfig } from "@app/types/assistant/triggers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const config: IntervalScheduleConfig = {
  type: "interval",
  intervalDays: 1,
  dayOfWeek: null,
  hour: 9,
  minute: 0,
  timezone: "America/New_York",
};

function occurrences(
  overrides: Partial<IntervalScheduleConfig> = {}
): string[] {
  return getNextOccurrences({ ...config, ...overrides }, 3).map((date) =>
    date.toISOString()
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe.each(["UTC", "Europe/Paris", "America/New_York"])(
  "getNextOccurrences with host timezone %s",
  (hostTimezone) => {
    beforeEach(() => {
      vi.stubEnv("TZ", hostTimezone);
      expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(
        hostTimezone
      );
    });
    it("keeps local daily times across spring DST", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-07T12:00:00Z"));
      expect(occurrences()).toEqual([
        "2026-03-07T14:00:00.000Z",
        "2026-03-08T13:00:00.000Z",
        "2026-03-09T13:00:00.000Z",
      ]);
    });

    it("moves a nonexistent time forward and preserves subsequent interval times", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-08T05:00:00Z"));
      expect(occurrences({ hour: 2, minute: 30 })).toEqual([
        "2026-03-08T07:30:00.000Z",
        "2026-03-09T07:30:00.000Z",
        "2026-03-10T07:30:00.000Z",
      ]);
    });

    it("selects Sunday for biweekly schedules and skips a time equal to now", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-25T13:00:00Z"));
      expect(occurrences({ intervalDays: 14, dayOfWeek: 0 })).toEqual([
        "2026-11-08T14:00:00.000Z",
        "2026-11-22T14:00:00.000Z",
        "2026-12-06T14:00:00.000Z",
      ]);
    });

    it("ignores DST transitions in the host timezone for a UTC schedule", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-29T00:00:00Z"));
      expect(occurrences({ timezone: "UTC", hour: 2, minute: 30 })).toEqual([
        "2026-03-29T02:30:00.000Z",
        "2026-03-30T02:30:00.000Z",
        "2026-03-31T02:30:00.000Z",
      ]);
    });

    it.each([
      ["2026-11-01T04:00:00Z", "2026-11-01T05:30:00.000Z"],
      ["2026-11-01T06:10:00Z", "2026-11-02T06:30:00.000Z"],
    ])(
      "uses the earlier occurrence of a repeated time (now: %s)",
      (now, expected) => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(now));
        expect(occurrences({ hour: 1, minute: 30 })[0]).toBe(expected);
      }
    );

    it.each(["2026-10-24T00:00:00Z", "2026-10-25T00:00:00Z"])(
      "preserves London's valid 02:30 when initializing and advancing (now: %s)",
      (now) => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(now));
        const startDay = new Date(now).getUTCDate();
        expect(
          occurrences({ timezone: "Europe/London", hour: 2, minute: 30 })
        ).toEqual(
          startDay === 24
            ? [
                "2026-10-24T01:30:00.000Z",
                "2026-10-25T02:30:00.000Z",
                "2026-10-26T02:30:00.000Z",
              ]
            : [
                "2026-10-25T02:30:00.000Z",
                "2026-10-26T02:30:00.000Z",
                "2026-10-27T02:30:00.000Z",
              ]
        );
      }
    );

    it.each(["2026-10-24T00:00:00Z", "2026-10-25T00:00:00Z"])(
      "selects Paris's earlier 02:30 when initializing and advancing (now: %s)",
      (now) => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(now));
        const startDay = new Date(now).getUTCDate();
        expect(
          occurrences({ timezone: "Europe/Paris", hour: 2, minute: 30 })
        ).toEqual(
          startDay === 24
            ? [
                "2026-10-24T00:30:00.000Z",
                "2026-10-25T00:30:00.000Z",
                "2026-10-26T01:30:00.000Z",
              ]
            : [
                "2026-10-25T00:30:00.000Z",
                "2026-10-26T01:30:00.000Z",
                "2026-10-27T01:30:00.000Z",
              ]
        );
      }
    );

    it("skips Paris's repeated time once its earlier occurrence has passed", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-25T00:45:00Z"));
      expect(
        occurrences({ timezone: "Europe/Paris", hour: 2, minute: 30 })[0]
      ).toBe("2026-10-26T01:30:00.000Z");
    });

    it("continues to support cron schedules and invalid cron expressions", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-01T12:00:00Z"));
      expect(
        getNextOccurrences(
          { cron: "0 9 * * *", timezone: config.timezone },
          3
        ).map((date) => date.toISOString())
      ).toEqual([
        "2026-07-01T13:00:00.000Z",
        "2026-07-02T13:00:00.000Z",
        "2026-07-03T13:00:00.000Z",
      ]);
      expect(
        getNextOccurrences({ cron: "invalid", timezone: "UTC" }, 3)
      ).toEqual([]);
    });
  }
);

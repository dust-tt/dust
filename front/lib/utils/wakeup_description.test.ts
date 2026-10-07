import {
  formatWakeUpSidebarLabel,
  getNextWakeUpFireAtFromScheduleConfig,
} from "@app/lib/utils/wakeup_description";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("formatWakeUpSidebarLabel", () => {
  // Anchor "now" at a known instant so the >24h cutoff is deterministic.
  // 2026-04-27 is a Monday in local time (the date we use elsewhere in
  // the file).
  const NOW_MS = new Date(2026, 3, 27, 12, 0).getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_MS));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the abbreviated weekday when the wake-up is more than 24h away", () => {
    // 25h after Monday noon -> Tuesday afternoon.
    const justOverADayMs = NOW_MS + 25 * 60 * 60 * 1000;
    expect(formatWakeUpSidebarLabel(justOverADayMs, "en-US")).toBe("Tue");
  });

  it("renders the abbreviated weekday for far-future wake-ups", () => {
    const fiveDaysMs = NOW_MS + 5 * 24 * 60 * 60 * 1000;
    expect(formatWakeUpSidebarLabel(fiveDaysMs, "en-US")).toBe("Sat");
  });
});

describe("getNextWakeUpFireAtFromScheduleConfig", () => {
  it("returns fireAt as-is for one-shot schedules", () => {
    const fireAt = new Date(2026, 3, 27, 9, 0).getTime();
    expect(
      getNextWakeUpFireAtFromScheduleConfig({ type: "one_shot", fireAt })
    ).toBe(fireAt);
  });

  it("resolves the next cron firing in the schedule's stored timezone", () => {
    // Anchor "now" so cron-parser's "next" is deterministic. 2026-04-27
    // is a Monday.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 27, 12, 0));
    const nextFire = getNextWakeUpFireAtFromScheduleConfig({
      type: "cron",
      cron: "0 9 * * *",
      timezone: "America/New_York",
    });
    expect(nextFire).toBeGreaterThan(Date.now());
    vi.useRealTimers();
  });
});

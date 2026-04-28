import {
  describeWakeUpSchedule,
  formatWakeUpSidebarLabel,
  formatWakeUpTimeOfDay,
  getNextWakeUpFireAt,
} from "@app/lib/utils/wakeup_description";
import type { WakeUpType } from "@app/types/assistant/wakeups";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Builds a WakeUpType with placeholder fields so tests can focus on
// scheduleConfig, the only field describeWakeUpSchedule reads.
function makeWakeUp(scheduleConfig: WakeUpType["scheduleConfig"]): WakeUpType {
  return {
    id: 1,
    sId: "wu_test",
    createdAt: 0,
    agentConfigurationId: "agent_test",
    scheduleConfig,
    reason: "Test",
    status: "scheduled",
    fireCount: 0,
    maxFires: 1,
    user: {
      sId: "u_test",
      id: 1,
      createdAt: 0,
      provider: null,
      username: "tester",
      email: "tester@example.com",
      firstName: "Test",
      lastName: null,
      fullName: "Test",
      image: null,
      lastLoginAt: null,
    },
  };
}

// `new Date(year, month, day, hour, minute)` interprets its arguments in
// the local timezone, so .getHours() / .getMinutes() return those exact
// values regardless of the test environment's zone.
function localTimestamp(hour: number, minute: number): number {
  return new Date(2026, 3, 27, hour, minute).getTime();
}

describe("formatWakeUpTimeOfDay", () => {
  it("zero-pads single-digit hours", () => {
    expect(formatWakeUpTimeOfDay(localTimestamp(9, 5))).toBe("09:05");
  });

  it("renders afternoon hours in 24-hour form", () => {
    expect(formatWakeUpTimeOfDay(localTimestamp(14, 0))).toBe("14:00");
  });

  it("renders midnight as 00:00", () => {
    expect(formatWakeUpTimeOfDay(localTimestamp(0, 0))).toBe("00:00");
  });

  it("renders noon as 12:00", () => {
    expect(formatWakeUpTimeOfDay(localTimestamp(12, 0))).toBe("12:00");
  });

  it("renders 1 PM as 13:00", () => {
    expect(formatWakeUpTimeOfDay(localTimestamp(13, 0))).toBe("13:00");
  });
});

describe("describeWakeUpSchedule (one_shot)", () => {
  it("prefixes the time with 'at'", () => {
    const wakeUp = makeWakeUp({
      type: "one_shot",
      fireAt: localTimestamp(9, 30),
    });
    expect(describeWakeUpSchedule(wakeUp)).toBe("at 09:30");
  });
});

describe("describeWakeUpSchedule (cron)", () => {
  it("describes a single weekday at a fixed time", () => {
    const wakeUp = makeWakeUp({
      type: "cron",
      cron: "0 9 * * 1",
      timezone: "America/New_York",
    });
    expect(describeWakeUpSchedule(wakeUp)).toBe("at 09:00, only on Monday");
  });

  it("describes a weekday range", () => {
    const wakeUp = makeWakeUp({
      type: "cron",
      cron: "30 8 * * 1-5",
      timezone: "America/New_York",
    });
    expect(describeWakeUpSchedule(wakeUp)).toBe(
      "at 08:30, Monday through Friday"
    );
  });

  it("describes an interval cron without referencing a time", () => {
    const wakeUp = makeWakeUp({
      type: "cron",
      cron: "*/15 * * * *",
      timezone: "America/New_York",
    });
    expect(describeWakeUpSchedule(wakeUp)).toBe("every 15 minutes");
  });

  it("describes hourly cron", () => {
    const wakeUp = makeWakeUp({
      type: "cron",
      cron: "0 * * * *",
      timezone: "America/New_York",
    });
    expect(describeWakeUpSchedule(wakeUp)).toBe("every hour");
  });

  it("renders multi-time crons in 24-hour form", () => {
    const wakeUp = makeWakeUp({
      type: "cron",
      cron: "0 9,17 * * *",
      timezone: "America/New_York",
    });
    expect(describeWakeUpSchedule(wakeUp)).toBe("at 09:00 and 17:00");
  });

  it("rewords every-other-day DOM steps", () => {
    const wakeUp = makeWakeUp({
      type: "cron",
      cron: "0 9 */2 * *",
      timezone: "America/New_York",
    });
    expect(describeWakeUpSchedule(wakeUp)).toBe("at 09:00, every other day");
  });

  it("rewords larger DOM steps", () => {
    const wakeUp = makeWakeUp({
      type: "cron",
      cron: "0 9 */3 * *",
      timezone: "America/New_York",
    });
    expect(describeWakeUpSchedule(wakeUp)).toBe("at 09:00, every 3 days");
  });
});

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

  it("renders the time of day when the wake-up is within 24h", () => {
    const oneHourLaterMs = NOW_MS + 60 * 60 * 1000;
    expect(formatWakeUpSidebarLabel(oneHourLaterMs)).toBe("13:00");
  });

  it("renders the time of day for a wake-up exactly 24h away", () => {
    const exactlyOneDayMs = NOW_MS + 24 * 60 * 60 * 1000;
    expect(formatWakeUpSidebarLabel(exactlyOneDayMs)).toBe("12:00");
  });

  it("renders the abbreviated weekday when the wake-up is more than 24h away", () => {
    // 25h after Monday noon -> Tuesday afternoon.
    const justOverADayMs = NOW_MS + 25 * 60 * 60 * 1000;
    expect(formatWakeUpSidebarLabel(justOverADayMs)).toBe("Tue");
  });

  it("renders the abbreviated weekday for far-future wake-ups", () => {
    const fiveDaysMs = NOW_MS + 5 * 24 * 60 * 60 * 1000;
    expect(formatWakeUpSidebarLabel(fiveDaysMs)).toBe("Sat");
  });

  it("renders the time of day for past timestamps", () => {
    const oneHourAgoMs = NOW_MS - 60 * 60 * 1000;
    expect(formatWakeUpSidebarLabel(oneHourAgoMs)).toBe("11:00");
  });
});

describe("getNextWakeUpFireAt", () => {
  it("returns fireAt as-is for one-shot schedules", () => {
    const fireAt = new Date(2026, 3, 27, 9, 0).getTime();
    const wakeUp = makeWakeUp({ type: "one_shot", fireAt });
    expect(getNextWakeUpFireAt(wakeUp)).toBe(fireAt);
  });

  it("resolves the next cron firing in the schedule's stored timezone", () => {
    // Anchor "now" so cron-parser's "next" is deterministic. 2026-04-27
    // is a Monday.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 27, 12, 0));
    const wakeUp = makeWakeUp({
      type: "cron",
      cron: "0 9 * * *",
      timezone: "America/New_York",
    });
    const nextFire = getNextWakeUpFireAt(wakeUp);
    expect(nextFire).toBeGreaterThan(Date.now());
    vi.useRealTimers();
  });
});

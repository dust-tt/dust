import { describeWakeUpSchedule } from "@app/lib/client/wakeup_schedule";
import { i18n } from "@app/lib/i18n/i18n";
import type { WakeUpType } from "@app/types/assistant/wakeups";
import type { MessageDescriptor } from "@lingui/core";
import { describe, expect, it } from "vitest";

const translate = (descriptor: MessageDescriptor) => i18n._(descriptor);

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
      pronouns: null,
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

describe("describeWakeUpSchedule (one_shot)", () => {
  it("prefixes the time with 'at'", () => {
    const wakeUp = makeWakeUp({
      type: "one_shot",
      fireAt: localTimestamp(9, 30),
    });
    expect(describeWakeUpSchedule(wakeUp, translate)).toMatch(
      /^at \d{1,2}:\d{2}(?:\s?[AP]M)?$/
    );
  });
});

describe("describeWakeUpSchedule (cron)", () => {
  // The time portion of a cron description is locale-dependent (12h vs.
  // 24h). These assertions match either form so the suite is portable
  // across test environments.
  const TIME = String.raw`\d{1,2}:\d{2}(?:\s?[AP]M)?`;

  it("describes a single weekday at a fixed time", () => {
    const wakeUp = makeWakeUp({
      type: "cron",
      cron: "0 9 * * 1",
      timezone: "America/New_York",
    });
    expect(describeWakeUpSchedule(wakeUp, translate)).toMatch(
      new RegExp(`^at ${TIME}, only on Monday$`)
    );
  });

  it("describes a weekday range", () => {
    const wakeUp = makeWakeUp({
      type: "cron",
      cron: "30 8 * * 1-5",
      timezone: "America/New_York",
    });
    expect(describeWakeUpSchedule(wakeUp, translate)).toMatch(
      new RegExp(`^at ${TIME}, Monday through Friday$`)
    );
  });

  it("describes an interval cron without referencing a time", () => {
    const wakeUp = makeWakeUp({
      type: "cron",
      cron: "*/15 * * * *",
      timezone: "America/New_York",
    });
    expect(describeWakeUpSchedule(wakeUp, translate)).toBe("every 15 minutes");
  });

  it("describes hourly cron", () => {
    const wakeUp = makeWakeUp({
      type: "cron",
      cron: "0 * * * *",
      timezone: "America/New_York",
    });
    expect(describeWakeUpSchedule(wakeUp, translate)).toBe("every hour");
  });

  it("renders multi-time crons", () => {
    const wakeUp = makeWakeUp({
      type: "cron",
      cron: "0 9,17 * * *",
      timezone: "America/New_York",
    });
    expect(describeWakeUpSchedule(wakeUp, translate)).toMatch(
      new RegExp(`^at ${TIME} and ${TIME}$`)
    );
  });

  it("rewords every-other-day DOM steps", () => {
    const wakeUp = makeWakeUp({
      type: "cron",
      cron: "0 9 */2 * *",
      timezone: "America/New_York",
    });
    expect(describeWakeUpSchedule(wakeUp, translate)).toMatch(
      new RegExp(`^at ${TIME}, every other day$`)
    );
  });

  it("rewords larger DOM steps", () => {
    const wakeUp = makeWakeUp({
      type: "cron",
      cron: "0 9 */3 * *",
      timezone: "America/New_York",
    });
    expect(describeWakeUpSchedule(wakeUp, translate)).toMatch(
      new RegExp(`^at ${TIME}, every 3 days$`)
    );
  });
});

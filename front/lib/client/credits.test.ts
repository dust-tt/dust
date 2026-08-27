import { describe, expect, it } from "vitest";
import { formatCreditResetCountdown, formatFairUseAllowance } from "./credits";

describe("formatFairUseAllowance", () => {
  it.each([
    ["day", "Daily allowance"],
    ["week", "Weekly allowance"],
    ["month", "Monthly allowance"],
    ["lifetime", "Monthly allowance"],
  ] as const)("formats the %s timeframe", (timeframe, expected) => {
    expect(formatFairUseAllowance(timeframe)).toBe(expected);
  });
});

describe("formatCreditResetCountdown", () => {
  const nowMs = Date.parse("2026-08-26T12:00:00.000Z");

  it.each([
    ["2026-08-26T12:00:00.000Z", "Reset today"],
    ["2026-08-27T11:59:59.000Z", "Reset in 1 day"],
    ["2026-09-01T12:00:00.000Z", "Reset in 6 days"],
  ])("formats %s", (nextResetAt, expected) => {
    expect(formatCreditResetCountdown(nextResetAt, nowMs)).toBe(expected);
  });

  it("returns null for an invalid date", () => {
    expect(formatCreditResetCountdown("not-a-date", nowMs)).toBeNull();
  });
});

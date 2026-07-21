import {
  getNudgeSlotAtMs,
  getPodNudgeSlotMinutes,
} from "@app/temporal/activation_scheduler/slots";
import { describe, expect, it } from "vitest";

const WINDOW_MINUTES = 420; // 9:30 - 16:30.

describe("getPodNudgeSlotMinutes", () => {
  it("is deterministic", () => {
    expect(getPodNudgeSlotMinutes(123, WINDOW_MINUTES)).toBe(
      getPodNudgeSlotMinutes(123, WINDOW_MINUTES)
    );
  });

  it("returns an offset within the configured window", () => {
    for (const podModelId of [1, 123, 987_654]) {
      const slotMinutes = getPodNudgeSlotMinutes(podModelId, WINDOW_MINUTES);

      expect(slotMinutes).toBeGreaterThanOrEqual(0);
      expect(slotMinutes).toBeLessThan(WINDOW_MINUTES);
    }
  });

  it("spreads nearby pod model ids", () => {
    const slots = new Set(
      Array.from({ length: 10 }, (_, index) =>
        getPodNudgeSlotMinutes(index, WINDOW_MINUTES)
      )
    );

    expect(slots.size).toBeGreaterThan(1);
  });
});

describe("getNudgeSlotAtMs", () => {
  const timezone = "America/New_York";
  const windowStartMinutes = 9 * 60 + 30;
  const now = new Date("2026-07-21T18:00:00.000Z");

  it("is deterministic for the same day", () => {
    const first = getNudgeSlotAtMs({
      podModelId: 123,
      timezone,
      windowStartMinutes,
      windowMinutes: WINDOW_MINUTES,
      now,
    });
    const second = getNudgeSlotAtMs({
      podModelId: 123,
      timezone,
      windowStartMinutes,
      windowMinutes: WINDOW_MINUTES,
      now,
    });

    expect(first).toBe(second);
  });

  it("falls within the window on the given day", () => {
    const slotAtMs = getNudgeSlotAtMs({
      podModelId: 123,
      timezone,
      windowStartMinutes,
      windowMinutes: WINDOW_MINUTES,
      now,
    });

    const windowStartMs = getNudgeSlotAtMs({
      podModelId: 123,
      timezone,
      windowStartMinutes,
      windowMinutes: 1,
      now,
    });

    expect(slotAtMs).toBeGreaterThanOrEqual(windowStartMs);
    expect(slotAtMs).toBeLessThan(windowStartMs + WINDOW_MINUTES * 60 * 1000);
  });
});

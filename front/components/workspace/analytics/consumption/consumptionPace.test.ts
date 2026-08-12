import { consumptionPace } from "@app/components/workspace/analytics/consumption/consumptionPace";
import { describe, expect, it } from "vitest";

const PERIOD = {
  startDate: "2026-07-01T00:00:00.000Z",
  endDate: "2026-07-11T00:00:00.000Z",
};

// 40% into a 10-day cycle.
const NOW_MS = new Date("2026-07-05T00:00:00.000Z").getTime();

describe("consumptionPace", () => {
  it("reports the used and elapsed shares of the cycle", () => {
    expect(
      consumptionPace({
        usedCredits: 4000,
        capCredits: 10000,
        period: PERIOD,
        nowMs: NOW_MS,
      })
    ).toEqual({ status: "on_pace", usedRatio: 0.4, elapsedRatio: 0.4 });
  });

  it("flags spending faster than the cycle elapses", () => {
    expect(
      consumptionPace({
        usedCredits: 8000,
        capCredits: 10000,
        period: PERIOD,
        nowMs: NOW_MS,
      })?.status
    ).toBe("off_pace");
  });

  it("leaves underspending on pace", () => {
    expect(
      consumptionPace({
        usedCredits: 1000,
        capCredits: 10000,
        period: PERIOD,
        nowMs: NOW_MS,
      })?.status
    ).toBe("on_pace");
  });

  it("stays on pace within the tolerance band", () => {
    expect(
      consumptionPace({
        usedCredits: 4900,
        capCredits: 10000,
        period: PERIOD,
        nowMs: NOW_MS,
      })?.status
    ).toBe("on_pace");
  });

  it("clamps overspend and a cycle read past its end", () => {
    expect(
      consumptionPace({
        usedCredits: 15000,
        capCredits: 10000,
        period: PERIOD,
        nowMs: new Date("2026-07-20T00:00:00.000Z").getTime(),
      })
    ).toEqual({ status: "on_pace", usedRatio: 1, elapsedRatio: 1 });
  });

  it("returns null without a cap", () => {
    expect(
      consumptionPace({
        usedCredits: 4000,
        capCredits: 0,
        period: PERIOD,
        nowMs: NOW_MS,
      })
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { computeCreditUsageStatus } from "./usage_status";

const billingCycle = {
  cycleStart: new Date("2026-08-01T00:00:00.000Z"),
  cycleEnd: new Date("2026-09-01T00:00:00.000Z"),
};

describe("computeCreditUsageStatus", () => {
  it("marks usage with enough remaining-cycle coverage as on target", () => {
    expect(
      computeCreditUsageStatus({
        consumedAwuCredits: 80,
        limitAwuCredits: 100,
        billingCycle,
        nowMs: new Date("2026-08-31T00:00:00.000Z").getTime(),
      })
    ).toEqual({
      usedPercentage: 80,
      resetAt: "2026-09-01T00:00:00.000Z",
      target: "on_target",
    });
  });

  it("marks moderately ahead usage as elevated", () => {
    expect(
      computeCreditUsageStatus({
        consumedAwuCredits: 65,
        limitAwuCredits: 100,
        billingCycle,
        nowMs: new Date("2026-08-16T12:00:00.000Z").getTime(),
      })
    ).toMatchObject({
      usedPercentage: 65,
      target: "elevated",
    });
  });

  it("marks high early-cycle usage as critical", () => {
    expect(
      computeCreditUsageStatus({
        consumedAwuCredits: 80,
        limitAwuCredits: 100,
        billingCycle,
        nowMs: new Date("2026-08-07T00:00:00.000Z").getTime(),
      })
    ).toMatchObject({
      usedPercentage: 80,
      target: "critical",
    });
  });

  it("always marks exhausted credits as critical", () => {
    expect(
      computeCreditUsageStatus({
        consumedAwuCredits: 100,
        limitAwuCredits: 100,
        billingCycle,
        nowMs: billingCycle.cycleEnd.getTime(),
      })
    ).toMatchObject({
      usedPercentage: 100,
      target: "critical",
    });
  });

  it("does not return a status when no positive limit applies", () => {
    expect(
      computeCreditUsageStatus({
        consumedAwuCredits: 0,
        limitAwuCredits: 0,
        billingCycle,
        nowMs: billingCycle.cycleStart.getTime(),
      })
    ).toBeNull();
  });
});

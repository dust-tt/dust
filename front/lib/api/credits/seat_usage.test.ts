import { describe, expect, it } from "vitest";

import { computeSeatUsage, splitConsumedAwuCredits } from "./seat_usage";

describe("splitConsumedAwuCredits", () => {
  it.each([
    { total: 0, allowance: 100, fromAllowance: 0, fromPool: 0 },
    { total: 60, allowance: 100, fromAllowance: 60, fromPool: 0 },
    { total: 100, allowance: 100, fromAllowance: 100, fromPool: 0 },
    { total: 150, allowance: 100, fromAllowance: 100, fromPool: 50 },
    { total: 150, allowance: 0, fromAllowance: 0, fromPool: 150 },
    { total: 150, allowance: -10, fromAllowance: 0, fromPool: 150 },
  ])("splits $total against allowance $allowance", ({
    total,
    allowance,
    fromAllowance,
    fromPool,
  }) => {
    const split = splitConsumedAwuCredits({
      totalConsumedAwuCredits: total,
      allowanceAwuCredits: allowance,
    });
    expect(split).toEqual({
      consumedFromAllowanceAwuCredits: fromAllowance,
      consumedFromPoolAwuCredits: fromPool,
    });
    expect(
      split.consumedFromAllowanceAwuCredits + split.consumedFromPoolAwuCredits
    ).toBe(total);
  });
});

describe("computeSeatUsage", () => {
  it("derives the percent from allowance consumption for paid seats", () => {
    expect(
      computeSeatUsage({
        seatType: "pro",
        memberUsageLimit: 200,
        seatBalanceAwu: null,
        consumedFromAllowanceAwuCredits: 50,
      })
    ).toEqual({
      percent: 25,
      consumed: 50,
      allowance: 200,
      isFreeWithBalance: false,
    });
  });

  it("caps the percent at 100", () => {
    expect(
      computeSeatUsage({
        seatType: "max",
        memberUsageLimit: 100,
        seatBalanceAwu: null,
        consumedFromAllowanceAwuCredits: 250,
      }).percent
    ).toBe(100);
  });

  it("derives free-seat consumption from the live balance when known", () => {
    expect(
      computeSeatUsage({
        seatType: "free",
        memberUsageLimit: 100,
        seatBalanceAwu: 30,
        consumedFromAllowanceAwuCredits: 5,
      })
    ).toEqual({
      percent: 70,
      consumed: 70,
      allowance: 100,
      isFreeWithBalance: true,
    });
  });

  it("floors free-seat consumption at 0 when the balance exceeds the limit", () => {
    expect(
      computeSeatUsage({
        seatType: "free",
        memberUsageLimit: 100,
        seatBalanceAwu: 120,
        consumedFromAllowanceAwuCredits: 5,
      }).consumed
    ).toBe(0);
  });

  it("falls back to allowance consumption for a free seat with unknown balance", () => {
    expect(
      computeSeatUsage({
        seatType: "free",
        memberUsageLimit: 100,
        seatBalanceAwu: null,
        consumedFromAllowanceAwuCredits: 40,
      })
    ).toEqual({
      percent: 40,
      consumed: 40,
      allowance: 100,
      isFreeWithBalance: false,
    });
  });

  it("ignores the balance for non-free seats", () => {
    expect(
      computeSeatUsage({
        seatType: "pro",
        memberUsageLimit: 100,
        seatBalanceAwu: 10,
        consumedFromAllowanceAwuCredits: 40,
      }).consumed
    ).toBe(40);
  });

  it.each([
    { seatType: "workspace" as const, memberUsageLimit: null },
    { seatType: "workspace" as const, memberUsageLimit: 0 },
    { seatType: "workspace" as const, memberUsageLimit: 100 },
    { seatType: "workspace_yearly" as const, memberUsageLimit: 100 },
    { seatType: "pro" as const, memberUsageLimit: 0 },
    { seatType: "pro" as const, memberUsageLimit: null },
    { seatType: null, memberUsageLimit: 100 },
    { seatType: "none" as const, memberUsageLimit: 100 },
  ])("returns a null percent for seatType=$seatType limit=$memberUsageLimit", ({
    seatType,
    memberUsageLimit,
  }) => {
    const usage = computeSeatUsage({
      seatType,
      memberUsageLimit,
      seatBalanceAwu: null,
      consumedFromAllowanceAwuCredits: 10,
    });
    expect(usage.percent).toBeNull();
    expect(usage.consumed).toBe(10);
  });
});

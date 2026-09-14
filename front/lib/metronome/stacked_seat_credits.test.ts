import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import type { TierCredit } from "@app/lib/metronome/stacked_seat_credits";
import { computeSeatIdsWithStrays } from "@app/lib/metronome/stacked_seat_credits";
import type { MetronomeSeatBalance } from "@app/lib/metronome/types";
import type { MembershipSeatType } from "@app/types/memberships";
import { describe, expect, it } from "vitest";

const AWU = getCreditTypeAwuId();
const OTHER_CREDIT_TYPE = `${AWU}-not-awu`;

const CREDIT_PRO = "credit-pro";
const CREDIT_MAX = "credit-max";

function tier(seatType: MembershipSeatType, creditId: string): TierCredit {
  return {
    seatType,
    recurringCreditId: `recurring-${creditId}`,
    creditId,
    segmentId: `segment-${creditId}`,
    allocation: seatType === "max" ? 40_000 : 8_000,
    adjustmentTimestamp: new Date("2026-06-10T00:00:00.000Z"),
  };
}

const TIER_BY_CREDIT_ID = new Map<string, TierCredit>([
  [CREDIT_PRO, tier("pro", CREDIT_PRO)],
  [CREDIT_MAX, tier("max", CREDIT_MAX)],
]);

function seat(
  seatId: string,
  credits: Array<{ id: string; balance: number; credit_type_id?: string }>
): MetronomeSeatBalance {
  return {
    seat_id: seatId,
    balances: [],
    credits: credits.map((c) => ({
      id: c.id,
      balance: c.balance,
      credit_type_id: c.credit_type_id ?? AWU,
    })),
  };
}

describe("computeSeatIdsWithStrays", () => {
  it("returns only seats carrying a credit for a tier other than their own", () => {
    const seatBalances = [
      // Home credit only — not a stray.
      seat("home-only", [{ id: CREDIT_MAX, balance: 40_000 }]),
      // Live stray (pro credit on a max seat).
      seat("fresh-stray", [
        { id: CREDIT_MAX, balance: 40_000 },
        { id: CREDIT_PRO, balance: 8_000 },
      ]),
      // Drained stray (balance 0) still counts: its home credit may need a carry.
      seat("drained-stray", [
        { id: CREDIT_MAX, balance: 40_000 },
        { id: CREDIT_PRO, balance: 0 },
      ]),
    ];
    const currentSeatTypeBySeatId = new Map<string, MembershipSeatType>([
      ["home-only", "max"],
      ["fresh-stray", "max"],
      ["drained-stray", "max"],
    ]);

    expect(
      computeSeatIdsWithStrays({
        seatBalances,
        currentSeatTypeBySeatId,
        tierByCreditId: TIER_BY_CREDIT_ID,
      })
    ).toEqual(["fresh-stray", "drained-stray"]);
  });

  it("ignores unrecognized credit ids and non-AWU credit types", () => {
    const seatBalances = [
      // Excess/pool credit not in the tier map — not a stray.
      seat("unknown-credit", [{ id: "credit-excess", balance: 100 }]),
      // A pro-tier credit id but of a non-AWU credit type — ignored.
      seat("non-awu", [
        { id: CREDIT_MAX, balance: 40_000 },
        { id: CREDIT_PRO, balance: 5_000, credit_type_id: OTHER_CREDIT_TYPE },
      ]),
    ];
    const currentSeatTypeBySeatId = new Map<string, MembershipSeatType>([
      ["unknown-credit", "max"],
      ["non-awu", "max"],
    ]);

    expect(
      computeSeatIdsWithStrays({
        seatBalances,
        currentSeatTypeBySeatId,
        tierByCreditId: TIER_BY_CREDIT_ID,
      })
    ).toEqual([]);
  });

  it("skips seats absent from the current-seat-type map", () => {
    const seatBalances = [
      seat("not-tracked", [{ id: CREDIT_PRO, balance: 8_000 }]),
    ];

    expect(
      computeSeatIdsWithStrays({
        seatBalances,
        currentSeatTypeBySeatId: new Map(),
        tierByCreditId: TIER_BY_CREDIT_ID,
      })
    ).toEqual([]);
  });
});

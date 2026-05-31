import type { CachedContract } from "@app/lib/metronome/plan_type";
import { getDefaultSeatTypeForContract } from "@app/lib/metronome/seat_types";
import type { MembershipSeatType } from "@app/types/memberships";
import { describe, expect, it } from "vitest";

// A seat tier billed on the contract: a subscription tagged with a seat type
// plus a recurring credit carrying its AWU allowance (used for tier ordering).
type Tier = {
  seatType: MembershipSeatType;
  awu: number;
};

// SDK types carry many fields we don't exercise; cast partial fixtures through
// `unknown` so the test stays focused on what the resolver actually reads:
// product IDs (→ seat type) and recurring-credit allocations (→ ordering).
function makeContract(tiers: Tier[]): {
  contract: Pick<CachedContract, "subscriptions" | "recurring_credits">;
  productSeatTypes: Map<string, MembershipSeatType>;
} {
  const productSeatTypes = new Map<string, MembershipSeatType>();
  const subscriptions = tiers.map(({ seatType }) => {
    const productId = `${seatType}-product`;
    productSeatTypes.set(productId, seatType);
    return {
      id: `sub_${seatType}`,
      subscription_rate: { product: { id: productId, name: seatType } },
    };
  });
  const recurring_credits = tiers.map(({ seatType, awu }) => ({
    access_amount: { unit_price: awu },
    commit_duration: { value: 1 },
    recurrence_frequency: "MONTHLY",
    subscription_config: { subscription_id: `sub_${seatType}` },
  }));
  return {
    contract: { subscriptions, recurring_credits } as unknown as Pick<
      CachedContract,
      "subscriptions" | "recurring_credits"
    >,
    productSeatTypes,
  };
}

describe("getDefaultSeatTypeForContract", () => {
  it("returns 'workspace' for legacy contracts with no seat subscriptions", () => {
    const { contract, productSeatTypes } = makeContract([]);
    expect(getDefaultSeatTypeForContract(contract, productSeatTypes)).toBe(
      "workspace"
    );
  });

  it("picks the lowest-allowance tier (free) by default", () => {
    const { contract, productSeatTypes } = makeContract([
      { seatType: "free", awu: 300 },
      { seatType: "pro", awu: 8000 },
      { seatType: "max", awu: 40000 },
    ]);
    expect(getDefaultSeatTypeForContract(contract, productSeatTypes)).toBe(
      "free"
    );
  });

  it("skips 'free' and picks the next tier when useFreeSeat is false", () => {
    const { contract, productSeatTypes } = makeContract([
      { seatType: "free", awu: 300 },
      { seatType: "pro", awu: 8000 },
      { seatType: "max", awu: 40000 },
    ]);
    expect(
      getDefaultSeatTypeForContract(contract, productSeatTypes, {
        useFreeSeat: false,
      })
    ).toBe("pro");
  });

  it("skips a tier that has reached its configured max-seat cap", () => {
    const { contract, productSeatTypes } = makeContract([
      { seatType: "pro", awu: 8000 },
      { seatType: "max", awu: 40000 },
    ]);
    expect(
      getDefaultSeatTypeForContract(contract, productSeatTypes, {
        useFreeSeat: false,
        seatMaxCounts: {
          counts: { pro: 2 },
          maxBySeatType: new Map([["pro", 2]]),
        },
      })
    ).toBe("max");
  });

  it("treats a null max as uncapped", () => {
    const { contract, productSeatTypes } = makeContract([
      { seatType: "pro", awu: 8000 },
    ]);
    expect(
      getDefaultSeatTypeForContract(contract, productSeatTypes, {
        useFreeSeat: false,
        seatMaxCounts: {
          counts: { pro: 1000 },
          maxBySeatType: new Map([["pro", null]]),
        },
      })
    ).toBe("pro");
  });

  it("falls back to 'none' when every billable tier is at its max", () => {
    const { contract, productSeatTypes } = makeContract([
      { seatType: "pro", awu: 8000 },
      { seatType: "max", awu: 40000 },
    ]);
    expect(
      getDefaultSeatTypeForContract(contract, productSeatTypes, {
        useFreeSeat: false,
        seatMaxCounts: {
          counts: { pro: 5, max: 3 },
          maxBySeatType: new Map([
            ["pro", 5],
            ["max", 3],
          ]),
        },
      })
    ).toBe("none");
  });

  it("falls back to 'none' for a free-only contract once free is unavailable", () => {
    const { contract, productSeatTypes } = makeContract([
      { seatType: "free", awu: 300 },
    ]);
    // Returning member can't get free again, and there's no other tier.
    expect(
      getDefaultSeatTypeForContract(contract, productSeatTypes, {
        isReturningMember: true,
      })
    ).toBe("none");
  });
});

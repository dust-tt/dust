import type { CachedContract } from "@app/lib/metronome/plan_type";
import {
  classifySeatChange,
  computeSeatCreditTransfers,
  getSeatCreditNameForSeatType,
  hasContractSeatSubscription,
  resolveRemappedSeatType,
} from "@app/lib/metronome/seats";
import {
  MAX_SEAT_CREDIT_NAME,
  PRO_SEAT_CREDIT_NAME,
} from "@app/lib/metronome/setup_common";
import type { SeatLimit } from "@app/lib/resources/workspace_seat_limit_resource";
import type { MembershipSeatType } from "@app/types/memberships";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/client", () => ({
  getMetronomeContractById: vi.fn(),
  updateSubscriptionQuantity: vi.fn(),
}));

// Use `vi.hoisted` so the mock fn exists when the `vi.mock` factory below
// runs (vi.mock is hoisted above top-level declarations).
const { mockGetProductSeatTypes } = vi.hoisted(() => ({
  mockGetProductSeatTypes: vi.fn(),
}));
vi.mock("@app/lib/metronome/seat_types", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/seat_types")
  >("@app/lib/metronome/seat_types");
  return {
    ...actual,
    getProductSeatTypes: mockGetProductSeatTypes,
  };
});

// A single seat tier on a fixture contract.
type SeatFixture = {
  seatType: MembershipSeatType;
  // Per-seat AWU recurring credit. Omit for tiers with no AWU allocation (e.g.
  // legacy `workspace`); they sort to 0 in `getDefaultSeatTypeForContract`.
  awu?: number;
  frequency?: "ANNUAL" | "MONTHLY";
  // Adds an `entitled: true` override for this seat's product. Non-legacy rate
  // cards carry every seat product but entitle only the ones they sell.
  entitled?: boolean;
};

// Build a `CachedContract` (and the matching `productId → seatType` map) from a
// concise seat spec, so tests describe only what they exercise. The SDK's
// Subscription has many required fields we don't touch; the partial fixture is
// cast through `unknown`.
function makeContract({
  seats = [],
  isMau = false,
  currentBillingPeriodStartingAt,
  nextBillingPeriodStartingAt,
}: {
  seats?: SeatFixture[];
  isMau?: boolean;
  // ISO timestamp for `subscriptions[].billing_periods.current.starting_at`,
  // the recurrence anchor `getNextSeatCreditRenewalDate` steps from.
  currentBillingPeriodStartingAt?: string;
  // ISO timestamp for `subscriptions[].billing_periods.next.starting_at`, the
  // fallback anchor used when a seat has no recurring credit.
  nextBillingPeriodStartingAt?: string;
} = {}): {
  contract: CachedContract;
  productSeatTypes: Map<string, MembershipSeatType>;
} {
  const productSeatTypes = new Map<string, MembershipSeatType>();
  const subscriptions = [];
  const recurringCredits = [];
  const overrides = [];

  const billingPeriods =
    currentBillingPeriodStartingAt || nextBillingPeriodStartingAt
      ? {
          ...(currentBillingPeriodStartingAt
            ? { current: { starting_at: currentBillingPeriodStartingAt } }
            : {}),
          ...(nextBillingPeriodStartingAt
            ? { next: { starting_at: nextBillingPeriodStartingAt } }
            : {}),
        }
      : undefined;

  for (const seat of seats) {
    const productId = `${seat.seatType}-product`;
    const subscriptionId = `sub_${seat.seatType}`;
    productSeatTypes.set(productId, seat.seatType);
    subscriptions.push({
      id: subscriptionId,
      subscription_rate: { product: { id: productId, name: seat.seatType } },
      ...(billingPeriods ? { billing_periods: billingPeriods } : {}),
    });
    if (seat.awu != null) {
      recurringCredits.push({
        access_amount: { unit_price: seat.awu },
        commit_duration: { value: 1 },
        recurrence_frequency: seat.frequency ?? "MONTHLY",
        subscription_config: { subscription_id: subscriptionId },
      });
    }
    if (seat.entitled) {
      overrides.push({ entitled: true, product: { id: productId } });
    }
  }

  return {
    contract: {
      custom_fields: isMau ? { MAU_THRESHOLD: "1" } : undefined,
      subscriptions,
      ...(recurringCredits.length > 0
        ? { recurring_credits: recurringCredits }
        : {}),
      ...(overrides.length > 0 ? { overrides } : {}),
    } as unknown as CachedContract,
    productSeatTypes,
  };
}

describe("hasContractSeatSubscription", () => {
  beforeEach(() => {
    mockGetProductSeatTypes.mockReset();
  });

  it("returns true when a subscription references a seat-tagged product", async () => {
    const { contract, productSeatTypes } = makeContract({
      seats: [{ seatType: "pro" }],
    });
    mockGetProductSeatTypes.mockResolvedValue(productSeatTypes);
    expect(await hasContractSeatSubscription(contract)).toBe(true);
  });

  it("returns false when subscriptions reference only untagged products", async () => {
    const { contract } = makeContract({ seats: [{ seatType: "pro" }] });
    // No product is tagged as a seat.
    mockGetProductSeatTypes.mockResolvedValue(new Map());
    expect(await hasContractSeatSubscription(contract)).toBe(false);
  });

  it("returns false on MAU contracts even if a tagged product is present", async () => {
    const { contract, productSeatTypes } = makeContract({
      seats: [{ seatType: "workspace" }],
      isMau: true,
    });
    mockGetProductSeatTypes.mockResolvedValue(productSeatTypes);
    expect(await hasContractSeatSubscription(contract)).toBe(false);
  });

  it("returns false when the contract has no subscriptions", async () => {
    const { contract } = makeContract();
    mockGetProductSeatTypes.mockResolvedValue(new Map());
    expect(await hasContractSeatSubscription(contract)).toBe(false);
  });
});

describe("resolveRemappedSeatType — keep / yearly-convert", () => {
  // Contract bills `pro_yearly` (8000 AWU) and `max` (40000 AWU).
  const { contract, productSeatTypes } = makeContract({
    seats: [
      { seatType: "pro_yearly", awu: 8000, frequency: "ANNUAL" },
      { seatType: "max", awu: 40000, frequency: "MONTHLY" },
    ],
  });

  it("keeps a seat type the contract still bills", () => {
    expect(resolveRemappedSeatType("max", contract, productSeatTypes)).toBe(
      "max"
    );
    expect(
      resolveRemappedSeatType("pro_yearly", contract, productSeatTypes)
    ).toBe("pro_yearly");
  });

  it("converts a monthly seat to its yearly equivalent when present", () => {
    expect(resolveRemappedSeatType("pro", contract, productSeatTypes)).toBe(
      "pro_yearly"
    );
  });

  it("converts a yearly seat to its monthly equivalent when only monthly is billed", () => {
    // Contract bills `pro_yearly` and `max` — no `max_yearly`. A member on
    // `max_yearly` (not on contract) should fall back to `max` (monthly).
    expect(
      resolveRemappedSeatType("max_yearly", contract, productSeatTypes)
    ).toBe("max");
  });

  it("returns none for returning members when no seat matches", () => {
    // `free` not on contract, no yearly equivalent, no committed seatLimits → none.
    expect(resolveRemappedSeatType("free", contract, productSeatTypes)).toBe(
      "none"
    );
  });
});

describe("resolveRemappedSeatType — fallback via getDefaultSeatTypeForContract", () => {
  // Contract bills `free` (0 AWU) and `pro` (8000 AWU).
  const { contract, productSeatTypes } = makeContract({
    seats: [{ seatType: "free" }, { seatType: "pro", awu: 8000 }],
  });

  it("returns none for returning members (free blocked by one-shot rule)", () => {
    // Default isReturningMember=true → free blocked → none.
    expect(resolveRemappedSeatType("none", contract, productSeatTypes)).toBe(
      "none"
    );
  });

  it("assigns free for members who only ever had none seats", () => {
    // isReturningMember=false → free on contract → free.
    expect(
      resolveRemappedSeatType("none", contract, productSeatTypes, {
        isReturningMember: false,
      })
    ).toBe("free");
  });

  it("assigns committed seat in fallback when slots available", () => {
    const seatLimits = new Map<MembershipSeatType, SeatLimit>([
      ["pro", { minSeats: 5, maxSeats: null }],
    ]);
    const seatCounts = { pro: 2 };
    expect(
      resolveRemappedSeatType("none", contract, productSeatTypes, {
        isReturningMember: false,
        seatLimits,
        seatCounts,
      })
    ).toBe("pro");
  });
});

describe("resolveRemappedSeatType — entitlement-aware", () => {
  // Contract carries every seat subscription, but only `pro_yearly` is
  // entitled (the others are dormant `entitled:false` baseline).
  const { contract, productSeatTypes } = makeContract({
    seats: [
      { seatType: "pro" },
      { seatType: "pro_yearly", entitled: true },
      { seatType: "max" },
    ],
  });

  it("does not keep a seat whose subscription exists but is not entitled", () => {
    // `pro` has a (dormant) subscription but isn't entitled → convert to yearly.
    expect(resolveRemappedSeatType("pro", contract, productSeatTypes)).toBe(
      "pro_yearly"
    );
  });

  it("keeps an entitled seat type", () => {
    expect(
      resolveRemappedSeatType("pro_yearly", contract, productSeatTypes)
    ).toBe("pro_yearly");
  });

  it("returns none for unrelated seats with no committed config", () => {
    // `max` not entitled on the new contract, no `max_yearly`, no committed
    // seatLimits → none.
    expect(resolveRemappedSeatType("max", contract, productSeatTypes)).toBe(
      "none"
    );
  });
});

describe("classifySeatChange", () => {
  const NOW = new Date("2026-06-11T12:00:00Z");
  // Current monthly credit period started mid-month; recurrences land on the
  // 15th. The next one after NOW (Jun 11) is Jun 15.
  const CURRENT_PERIOD = "2026-01-15T00:00:00Z";
  const NEXT_RENEWAL = new Date("2026-06-15T00:00:00Z");

  // `workspace` carries no AWU allocation, `pro`/`max` recur MONTHLY. The
  // current period started months ago to show the renewal is the next monthly
  // recurrence — not the billing-period boundary a year out.
  const { contract, productSeatTypes } = makeContract({
    seats: [
      { seatType: "workspace" },
      { seatType: "pro", awu: 100 },
      { seatType: "max", awu: 500 },
    ],
    currentBillingPeriodStartingAt: CURRENT_PERIOD,
    nextBillingPeriodStartingAt: "2027-01-15T00:00:00Z",
  });

  const classify = (
    previousSeatType: MembershipSeatType,
    newSeatType: MembershipSeatType,
    pendingScheduledChange?: { seatType: MembershipSeatType; at: Date }
  ) =>
    classifySeatChange({
      contract,
      productSeatTypes,
      now: NOW,
      change: {
        userId: "u1",
        previousSeatType,
        newSeatType,
        pendingScheduledChange,
      },
    });

  it("removes a zero-allowance seat (workspace → none) immediately", () => {
    expect(classify("workspace", "none")).toEqual({ kind: "immediate" });
  });

  it("defers removal of a seat that carried allowance (pro → none) to the next credit renewal", () => {
    // Anchored on the monthly credit recurrence, NOT the (year-out) billing
    // period.
    expect(classify("pro", "none")).toEqual({
      kind: "deferred",
      at: NEXT_RENEWAL,
    });
  });

  it("defers a downgrade between allowance tiers (max → pro) to the next credit renewal", () => {
    expect(classify("max", "pro")).toEqual({
      kind: "deferred",
      at: NEXT_RENEWAL,
    });
  });

  it("defers an annually-billed downgrade (max_yearly → pro_yearly) to the next MONTHLY renewal, not next year", () => {
    // The seats are billed annually (current → next billing period a year
    // apart) but their AWU credit recurs monthly, so the downgrade lands on
    // the next monthly recurrence (Jun 15), not the year-out billing boundary
    // (Jan 15 2027).
    const { contract: yearly, productSeatTypes: types } = makeContract({
      seats: [
        { seatType: "pro_yearly", awu: 100, frequency: "MONTHLY" },
        { seatType: "max_yearly", awu: 500, frequency: "MONTHLY" },
      ],
      currentBillingPeriodStartingAt: CURRENT_PERIOD,
      nextBillingPeriodStartingAt: "2027-01-15T00:00:00Z",
    });
    expect(
      classifySeatChange({
        contract: yearly,
        productSeatTypes: types,
        now: NOW,
        change: {
          userId: "u1",
          previousSeatType: "max_yearly",
          newSeatType: "pro_yearly",
        },
      })
    ).toEqual({ kind: "deferred", at: NEXT_RENEWAL });
  });

  it("applies an upgrade immediately (pro → max)", () => {
    expect(classify("pro", "max")).toEqual({ kind: "immediate" });
  });

  it("is a noop when selecting the current seat with no pending change", () => {
    expect(classify("pro", "pro")).toEqual({ kind: "noop" });
  });

  it("cancels a pending change when re-selecting the current seat", () => {
    expect(
      classify("pro", "pro", { seatType: "none", at: NEXT_RENEWAL })
    ).toEqual({ kind: "cancelled" });
  });

  it("anchors an annually-recurring credit on its yearly recurrence", () => {
    // A seat whose credit recurs ANNUALLY renews on the yearly anniversary of
    // the period start, not monthly.
    const { contract: annual, productSeatTypes: types } = makeContract({
      seats: [
        { seatType: "pro", awu: 100, frequency: "ANNUAL" },
        { seatType: "max", awu: 500, frequency: "ANNUAL" },
      ],
      currentBillingPeriodStartingAt: CURRENT_PERIOD,
    });
    expect(
      classifySeatChange({
        contract: annual,
        productSeatTypes: types,
        now: NOW,
        change: { userId: "u1", previousSeatType: "max", newSeatType: "pro" },
      })
    ).toEqual({ kind: "deferred", at: new Date("2027-01-15T00:00:00Z") });
  });

  it("uses the next billing period as the anchor when there is no current one", () => {
    // With no `current` period to step from, the recurrence anchor falls back
    // to `next.starting_at` (which is already in the future).
    const { contract: c, productSeatTypes: types } = makeContract({
      seats: [{ seatType: "pro", awu: 100 }],
      nextBillingPeriodStartingAt: "2026-07-01T00:00:00Z",
    });
    expect(
      classifySeatChange({
        contract: c,
        productSeatTypes: types,
        now: NOW,
        change: { userId: "u1", previousSeatType: "pro", newSeatType: "none" },
      })
    ).toEqual({ kind: "deferred", at: new Date("2026-07-01T00:00:00Z") });
  });

  it("treats free → none as a no-op (free is a one-shot tier)", () => {
    expect(classify("free", "none")).toEqual({ kind: "noop" });
  });

  it("returns undefined for a deferral when no anchor date exists", () => {
    const { contract: noPeriod, productSeatTypes: types } = makeContract({
      seats: [
        { seatType: "pro", awu: 100 },
        { seatType: "max", awu: 500 },
      ],
    });
    expect(
      classifySeatChange({
        contract: noPeriod,
        productSeatTypes: types,
        now: NOW,
        change: { userId: "u1", previousSeatType: "max", newSeatType: "pro" },
      })
    ).toBeUndefined();
  });
});

describe("getSeatCreditNameForSeatType", () => {
  it("maps pro tiers to the Pro seat credit", () => {
    expect(getSeatCreditNameForSeatType("pro")).toBe(PRO_SEAT_CREDIT_NAME);
    expect(getSeatCreditNameForSeatType("pro_yearly")).toBe(
      PRO_SEAT_CREDIT_NAME
    );
  });

  it("maps max tiers to the Max seat credit", () => {
    expect(getSeatCreditNameForSeatType("max")).toBe(MAX_SEAT_CREDIT_NAME);
    expect(getSeatCreditNameForSeatType("max_yearly")).toBe(
      MAX_SEAT_CREDIT_NAME
    );
  });

  it("returns null for seats with no recurring seat credit", () => {
    // `free` is a one-shot per-user credit, not a recurring seat credit.
    expect(getSeatCreditNameForSeatType("free")).toBeNull();
    expect(getSeatCreditNameForSeatType("workspace")).toBeNull();
    expect(getSeatCreditNameForSeatType("workspace_yearly")).toBeNull();
    expect(getSeatCreditNameForSeatType("none")).toBeNull();
  });
});

describe("computeSeatCreditTransfers", () => {
  const ALLOCATIONS = new Map<MembershipSeatType, number>([
    ["pro", 8000],
    ["pro_yearly", 8000],
    ["max", 40000],
    ["max_yearly", 40000],
  ]);

  it("transfers consumption for an upgrade between allowance seats (pro → max)", () => {
    // 2000/8000 consumed on pro → carry over: empty 6000 from pro, debit 2000
    // from max (40000 → 38000).
    const transfers = computeSeatCreditTransfers({
      metronomeSeatByUser: new Map([["u1", "pro"]]),
      desiredSeatByUser: new Map([["u1", "max"]]),
      balanceByUser: new Map([["u1", 6000]]),
      allocationBySeatType: ALLOCATIONS,
    });
    expect(transfers).toEqual([
      {
        userSId: "u1",
        oldSeatType: "pro",
        newSeatType: "max",
        oldCreditName: PRO_SEAT_CREDIT_NAME,
        newCreditName: MAX_SEAT_CREDIT_NAME,
        remaining: 6000,
        consumed: 2000,
      },
    ]);
  });

  it("ignores users whose Metronome seat already matches the DB", () => {
    expect(
      computeSeatCreditTransfers({
        metronomeSeatByUser: new Map([["u1", "max"]]),
        desiredSeatByUser: new Map([["u1", "max"]]),
        balanceByUser: new Map([["u1", 30000]]),
        allocationBySeatType: ALLOCATIONS,
      })
    ).toEqual([]);
  });

  it("is idempotent: skips an already-emptied origin credit", () => {
    // After a prior transfer the old credit is at 0 → nothing to carry over.
    expect(
      computeSeatCreditTransfers({
        metronomeSeatByUser: new Map([["u1", "pro"]]),
        desiredSeatByUser: new Map([["u1", "max"]]),
        balanceByUser: new Map([["u1", 0]]),
        allocationBySeatType: ALLOCATIONS,
      })
    ).toEqual([]);
  });

  it("transfers across billing frequencies of the same tier (max → max_yearly)", () => {
    // Same allowance/credit name but distinct recurring credits — consumption
    // still carries over.
    const transfers = computeSeatCreditTransfers({
      metronomeSeatByUser: new Map([["u1", "max"]]),
      desiredSeatByUser: new Map([["u1", "max_yearly"]]),
      balanceByUser: new Map([["u1", 30000]]),
      allocationBySeatType: ALLOCATIONS,
    });
    expect(transfers).toEqual([
      {
        userSId: "u1",
        oldSeatType: "max",
        newSeatType: "max_yearly",
        oldCreditName: MAX_SEAT_CREDIT_NAME,
        newCreditName: MAX_SEAT_CREDIT_NAME,
        remaining: 30000,
        consumed: 10000,
      },
    ]);
  });

  it("derives consumption from the origin allocation, not the aggregate balance", () => {
    // After a prior pro→max transfer the max seat shows 39994/40000 used 6. The
    // consumed amount must be 6 (40000 − 39994), NOT inflated by an emptied
    // prior tier's starting balance.
    const transfers = computeSeatCreditTransfers({
      metronomeSeatByUser: new Map([["u1", "max"]]),
      desiredSeatByUser: new Map([["u1", "max_yearly"]]),
      balanceByUser: new Map([["u1", 39994]]),
      allocationBySeatType: ALLOCATIONS,
    });
    expect(transfers[0]).toMatchObject({ remaining: 39994, consumed: 6 });
  });

  it("skips moves involving non-recurring-credit seats (workspace, free, none)", () => {
    const balanceByUser = new Map([["u1", 6000]]);
    // workspace → pro: origin has no recurring seat credit.
    expect(
      computeSeatCreditTransfers({
        metronomeSeatByUser: new Map([["u1", "workspace"]]),
        desiredSeatByUser: new Map([["u1", "pro"]]),
        balanceByUser,
        allocationBySeatType: ALLOCATIONS,
      })
    ).toEqual([]);
    // pro → none: destination has no recurring seat credit (downgrade anyway).
    expect(
      computeSeatCreditTransfers({
        metronomeSeatByUser: new Map([["u1", "pro"]]),
        desiredSeatByUser: new Map([["u1", "none"]]),
        balanceByUser,
        allocationBySeatType: ALLOCATIONS,
      })
    ).toEqual([]);
  });

  it("handles multiple users moving in one sync", () => {
    const transfers = computeSeatCreditTransfers({
      metronomeSeatByUser: new Map([
        ["u1", "pro"],
        ["u2", "max"],
        ["u3", "pro"],
      ]),
      desiredSeatByUser: new Map([
        ["u1", "max"],
        ["u2", "max"], // unchanged
        ["u3", "max"],
      ]),
      balanceByUser: new Map([
        ["u1", 6000],
        ["u2", 30000],
        ["u3", 8000],
      ]),
      allocationBySeatType: ALLOCATIONS,
    });
    expect(transfers.map((t) => t.userSId).sort()).toEqual(["u1", "u3"]);
    expect(transfers.find((t) => t.userSId === "u3")).toMatchObject({
      remaining: 8000,
      consumed: 0,
    });
  });
});

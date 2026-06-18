import type { CachedContract } from "@app/lib/metronome/plan_type";
import {
  getDefaultSeatTypeForContract,
  getSeatSubscriptionsFromContract,
  resolveRequestedSeatTypeForContract,
} from "@app/lib/metronome/seat_types";
import type { SeatLimit } from "@app/lib/resources/workspace_seat_limit_resource";
import type { MembershipSeatType } from "@app/types/memberships";
import { describe, expect, it } from "vitest";

// Drives new-member seat assignment (`resolveSeatTypeForNewMembership`).
describe("getDefaultSeatTypeForContract — entitlement", () => {
  const productSeatTypes = new Map<string, MembershipSeatType>([
    ["pro-product", "pro"],
    ["pro-yearly-product", "pro_yearly"],
  ]);

  // Contract carries both the monthly and yearly pro seat subscriptions,
  // but only `pro_yearly` is entitled (the monthly one is dormant).
  const contract = {
    subscriptions: [
      {
        id: "sub_pro",
        subscription_rate: {
          product: { id: "pro-product", name: "Pro" },
        },
      },
      {
        id: "sub_pro_yearly",
        subscription_rate: {
          product: { id: "pro-yearly-product", name: "Pro (Yearly)" },
        },
      },
    ],
    recurring_credits: [],
    overrides: [{ entitled: true, product: { id: "pro-yearly-product" } }],
  } as unknown as CachedContract;

  it("assigns the entitled committed seat, not a dormant lower-name subscription", () => {
    // Both seats are 0 AWU; without entitlement filtering the tie-break would
    // pick "pro" (< "pro_yearly"). Entitlement must win: only pro_yearly is in
    // onContract, so its committed slot is assigned.
    const seatLimits = new Map<MembershipSeatType, SeatLimit>([
      ["pro_yearly", { minSeats: 10, maxSeats: null }],
    ]);
    const seatCounts: Partial<Record<MembershipSeatType, number>> = {
      pro_yearly: 0,
    };
    expect(
      getDefaultSeatTypeForContract(contract, productSeatTypes, {
        seatLimits,
        seatCounts,
      })
    ).toBe("pro_yearly");
  });
});

// Committed-seat assignment: fills minSeats slots first, then falls through to
// free, then none.
describe("getDefaultSeatTypeForContract — committed seats", () => {
  const productSeatTypes = new Map<string, MembershipSeatType>([
    ["pro-product", "pro"],
    ["free-product", "free"],
  ]);

  // Contract bills both `pro` and `free`.
  const contract = {
    subscriptions: [
      {
        id: "sub_pro",
        subscription_rate: { product: { id: "pro-product", name: "Pro" } },
      },
      {
        id: "sub_free",
        subscription_rate: { product: { id: "free-product", name: "Free" } },
      },
    ],
    recurring_credits: [],
    overrides: [
      { entitled: true, product: { id: "pro-product" } },
      { entitled: true, product: { id: "free-product" } },
    ],
  } as unknown as CachedContract;

  it("assigns a committed seat when slots remain", () => {
    const seatLimits = new Map<MembershipSeatType, SeatLimit>([
      ["pro", { minSeats: 5, maxSeats: null }],
    ]);
    const seatCounts: Partial<Record<MembershipSeatType, number>> = { pro: 3 };
    expect(
      getDefaultSeatTypeForContract(contract, productSeatTypes, {
        seatLimits,
        seatCounts,
      })
    ).toBe("pro");
  });

  it("falls through to free when all committed slots are taken", () => {
    const seatLimits = new Map<MembershipSeatType, SeatLimit>([
      ["pro", { minSeats: 5, maxSeats: null }],
    ]);
    const seatCounts: Partial<Record<MembershipSeatType, number>> = { pro: 5 };
    expect(
      getDefaultSeatTypeForContract(contract, productSeatTypes, {
        seatLimits,
        seatCounts,
      })
    ).toBe("free");
  });

  it("returns none when committed exhausted and free blocked (returning member)", () => {
    const seatLimits = new Map<MembershipSeatType, SeatLimit>([
      ["pro", { minSeats: 5, maxSeats: null }],
    ]);
    const seatCounts: Partial<Record<MembershipSeatType, number>> = { pro: 5 };
    expect(
      getDefaultSeatTypeForContract(contract, productSeatTypes, {
        isReturningMember: true,
        seatLimits,
        seatCounts,
      })
    ).toBe("none");
  });

  it("returns none when no committed seats configured and free not available", () => {
    // No seatLimits — committed phase skipped entirely → free → none (returning)
    expect(
      getDefaultSeatTypeForContract(contract, productSeatTypes, {
        isReturningMember: true,
      })
    ).toBe("none");
  });

  it("assigns free (no committed seats, new member)", () => {
    // No committed seat configured; free is the only option and the member is new.
    expect(getDefaultSeatTypeForContract(contract, productSeatTypes)).toBe(
      "free"
    );
  });

  it("skips max even when it has committed slots, falls through to free", () => {
    // max is not auto-assignable regardless of committed configuration.
    const maxProductSeatTypes = new Map<string, MembershipSeatType>([
      ["max-product", "max"],
      ["free-product", "free"],
    ]);
    const maxContract = {
      subscriptions: [
        {
          id: "sub_max",
          subscription_rate: { product: { id: "max-product", name: "Max" } },
        },
        {
          id: "sub_free",
          subscription_rate: { product: { id: "free-product", name: "Free" } },
        },
      ],
      recurring_credits: [],
      overrides: [
        { entitled: true, product: { id: "max-product" } },
        { entitled: true, product: { id: "free-product" } },
      ],
    } as unknown as CachedContract;
    const seatLimits = new Map<MembershipSeatType, SeatLimit>([
      ["max", { minSeats: 5, maxSeats: null }],
    ]);
    const seatCounts: Partial<Record<MembershipSeatType, number>> = { max: 0 };
    expect(
      getDefaultSeatTypeForContract(maxContract, maxProductSeatTypes, {
        seatLimits,
        seatCounts,
      })
    ).toBe("free");
  });

  it("legacy: no-seat-subscription contract returns none", () => {
    const legacyContract = {
      subscriptions: [],
      recurring_credits: [],
      overrides: [],
    } as unknown as CachedContract;
    expect(
      getDefaultSeatTypeForContract(legacyContract, productSeatTypes)
    ).toBe("none");
  });
});

// An explicit seat carried on an accepted invitation is honored when the
// contract entitles it and its maxSeats cap is not hit, then falls back to
// free → none — never to a committed paid seat the user did not request.
describe("getDefaultSeatTypeForContract — requested seat (invitation)", () => {
  const productSeatTypes = new Map<string, MembershipSeatType>([
    ["free-product", "free"],
    ["pro-product", "pro"],
    ["max-product", "max"],
  ]);

  // Contract entitles free, pro and max.
  const contract = {
    subscriptions: [
      {
        id: "sub_free",
        subscription_rate: { product: { id: "free-product", name: "Free" } },
      },
      {
        id: "sub_pro",
        subscription_rate: { product: { id: "pro-product", name: "Pro" } },
      },
      {
        id: "sub_max",
        subscription_rate: { product: { id: "max-product", name: "Max" } },
      },
    ],
    recurring_credits: [],
    overrides: [
      { entitled: true, product: { id: "free-product" } },
      { entitled: true, product: { id: "pro-product" } },
      { entitled: true, product: { id: "max-product" } },
    ],
  } as unknown as CachedContract;

  it("honors a requested paid tier when uncapped", () => {
    expect(
      resolveRequestedSeatTypeForContract(contract, productSeatTypes, {
        requestedSeatType: "max",
      })
    ).toBe("max");
  });

  it("honors a requested paid tier under its maxSeats cap", () => {
    const seatLimits = new Map<MembershipSeatType, SeatLimit>([
      ["pro", { minSeats: 0, maxSeats: 5 }],
    ]);
    expect(
      resolveRequestedSeatTypeForContract(contract, productSeatTypes, {
        requestedSeatType: "pro",
        seatLimits,
        seatCounts: { pro: 4 },
      })
    ).toBe("pro");
  });

  it("falls back to free when the requested paid tier hit its maxSeats cap", () => {
    const seatLimits = new Map<MembershipSeatType, SeatLimit>([
      ["pro", { minSeats: 0, maxSeats: 5 }],
    ]);
    expect(
      resolveRequestedSeatTypeForContract(contract, productSeatTypes, {
        requestedSeatType: "pro",
        seatLimits,
        seatCounts: { pro: 5 },
      })
    ).toBe("free");
  });

  it("falls back to free when the requested tier is not entitled", () => {
    const proOnly = {
      subscriptions: [
        {
          id: "sub_free",
          subscription_rate: { product: { id: "free-product", name: "Free" } },
        },
        {
          id: "sub_pro",
          subscription_rate: { product: { id: "pro-product", name: "Pro" } },
        },
      ],
      recurring_credits: [],
      overrides: [
        { entitled: true, product: { id: "free-product" } },
        { entitled: true, product: { id: "pro-product" } },
      ],
    } as unknown as CachedContract;
    expect(
      resolveRequestedSeatTypeForContract(proOnly, productSeatTypes, {
        requestedSeatType: "max",
      })
    ).toBe("free");
  });

  it("does not fall back to a committed paid seat; uses free instead", () => {
    // max requested but capped; pro has open committed slots. The default path
    // would hand out the committed pro seat — the fallback must not, to avoid
    // billing a user for a seat they did not request.
    const seatLimits = new Map<MembershipSeatType, SeatLimit>([
      ["pro", { minSeats: 10, maxSeats: null }],
      ["max", { minSeats: 0, maxSeats: 2 }],
    ]);
    expect(
      resolveRequestedSeatTypeForContract(contract, productSeatTypes, {
        requestedSeatType: "max",
        seatLimits,
        seatCounts: { pro: 0, max: 2 },
      })
    ).toBe("free");
  });

  it("honors a requested free seat within the free caps", () => {
    expect(
      resolveRequestedSeatTypeForContract(contract, productSeatTypes, {
        requestedSeatType: "free",
        freeSeatCounts: { active: 2, lifetime: 2 },
        freeSeatLimits: { maxActiveFreeUsers: 5, maxLifetimeFreeUsers: 10 },
      })
    ).toBe("free");
  });

  it("falls back to none when free is requested but the free cap is exhausted", () => {
    expect(
      resolveRequestedSeatTypeForContract(contract, productSeatTypes, {
        requestedSeatType: "free",
        freeSeatCounts: { active: 5, lifetime: 5 },
        freeSeatLimits: { maxActiveFreeUsers: 5, maxLifetimeFreeUsers: 10 },
      })
    ).toBe("none");
  });

  it("enterprise pooled (no free): an unassignable paid request → none", () => {
    const noFree = {
      subscriptions: [
        {
          id: "sub_pro",
          subscription_rate: { product: { id: "pro-product", name: "Pro" } },
        },
      ],
      recurring_credits: [],
      overrides: [{ entitled: true, product: { id: "pro-product" } }],
    } as unknown as CachedContract;
    expect(
      resolveRequestedSeatTypeForContract(noFree, productSeatTypes, {
        requestedSeatType: "max",
      })
    ).toBe("none");
  });

  it("requestedSeatType null applies the default resolution", () => {
    expect(
      resolveRequestedSeatTypeForContract(contract, productSeatTypes, {
        requestedSeatType: null,
      })
    ).toBe("free");
  });
});

// A contract switch can entitle a seat the package doesn't sell and disable one
// it does, layering `entitled: true`/`false` overrides on the same product. The
// effective entitlement is the latest override per product (ties → disable).
describe("getSeatSubscriptionsFromContract — effective entitlement", () => {
  const productSeatTypes = new Map<string, MembershipSeatType>([
    ["pro-product", "pro"],
    ["pro-yearly-product", "pro_yearly"],
  ]);

  const baseSubscriptions = [
    {
      id: "sub_pro",
      subscription_rate: { product: { id: "pro-product", name: "Pro" } },
    },
    {
      id: "sub_pro_yearly",
      subscription_rate: {
        product: { id: "pro-yearly-product", name: "Pro (Yearly)" },
      },
    },
  ];

  it("drops a seat disabled by a later override and keeps a newly entitled one", () => {
    const contract = {
      subscriptions: baseSubscriptions,
      recurring_credits: [],
      overrides: [
        // Package baseline: pro_yearly entitled (no starting_at → earliest).
        { entitled: true, product: { id: "pro-yearly-product" } },
        // Operator switch: disable pro_yearly, entitle pro — both timestamped.
        {
          entitled: false,
          starting_at: "2026-06-01T00:00:00.000Z",
          product: { id: "pro-yearly-product" },
        },
        {
          entitled: true,
          starting_at: "2026-06-01T00:00:00.000Z",
          product: { id: "pro-product" },
        },
      ],
    } as unknown as CachedContract;

    const seatTypes = [
      ...getSeatSubscriptionsFromContract(contract, productSeatTypes).keys(),
    ];
    expect(seatTypes).toEqual(["pro"]);
  });

  it("lets a same-timestamp disable win over an entitle", () => {
    // `pro` is entitled so the contract isn't treated as legacy (which would
    // keep all seats); `pro_yearly` has a true+false pair at the same instant.
    const contract = {
      subscriptions: baseSubscriptions,
      recurring_credits: [],
      overrides: [
        {
          entitled: true,
          starting_at: "2026-06-01T00:00:00.000Z",
          product: { id: "pro-product" },
        },
        {
          entitled: true,
          starting_at: "2026-06-01T00:00:00.000Z",
          product: { id: "pro-yearly-product" },
        },
        {
          entitled: false,
          starting_at: "2026-06-01T00:00:00.000Z",
          product: { id: "pro-yearly-product" },
        },
      ],
    } as unknown as CachedContract;

    const onContract = getSeatSubscriptionsFromContract(
      contract,
      productSeatTypes
    );
    expect(onContract.has("pro")).toBe(true);
    expect(onContract.has("pro_yearly")).toBe(false);
  });
});

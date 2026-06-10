import type { CachedContract } from "@app/lib/metronome/plan_type";
import {
  getDefaultSeatTypeForContract,
  getSeatSubscriptionsFromContract,
} from "@app/lib/metronome/seat_types";
import type { SeatLimit } from "@app/lib/resources/workspace_seat_limit_resource";
import type { MembershipSeatType } from "@app/types/memberships";
import { describe, expect, it } from "vitest";

// Drives new-member seat assignment (`resolveSeatTypeForNewMembership`).
describe("getDefaultSeatTypeForContract — entitlement", () => {
  const productSeatTypes = new Map<string, MembershipSeatType>([
    ["workspace-product", "workspace"],
    ["workspace-yearly-product", "workspace_yearly"],
  ]);

  // Contract carries both the monthly and yearly workspace seat subscriptions,
  // but only `workspace_yearly` is entitled (the monthly one is dormant).
  const contract = {
    subscriptions: [
      {
        id: "sub_ws",
        subscription_rate: {
          product: { id: "workspace-product", name: "workspace" },
        },
      },
      {
        id: "sub_ws_yearly",
        subscription_rate: {
          product: {
            id: "workspace-yearly-product",
            name: "Workspace Seat (Yearly)",
          },
        },
      },
    ],
    recurring_credits: [],
    overrides: [
      { entitled: true, product: { id: "workspace-yearly-product" } },
    ],
  } as unknown as CachedContract;

  it("assigns the entitled seat, not a dormant lower-name subscription", () => {
    // Both seats are 0 AWU; without entitlement filtering the tie-break would
    // pick "workspace" (< "workspace_yearly"). Entitlement must win.
    expect(getDefaultSeatTypeForContract(contract, productSeatTypes)).toBe(
      "workspace_yearly"
    );
  });
});

// maxSeats cap: skips tiers at capacity; returns "none" when all capped.
describe("getDefaultSeatTypeForContract — maxSeats cap", () => {
  const productSeatTypes = new Map<string, MembershipSeatType>([
    ["pro-product", "pro"],
    ["max-product", "max"],
  ]);

  // Contract with two entitled seat types: pro (lower AWU) and max.
  const contract = {
    subscriptions: [
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
      { entitled: true, product: { id: "pro-product" } },
      { entitled: true, product: { id: "max-product" } },
    ],
  } as unknown as CachedContract;

  it("skips a capped tier and falls through to the next", () => {
    const seatLimits = new Map<MembershipSeatType, SeatLimit>([
      ["pro", { minSeats: 0, maxSeats: 2 }],
    ]);
    // Pro is at cap (2 assigned, maxSeats=2); should fall through to max.
    const seatCounts: Partial<Record<MembershipSeatType, number>> = {
      pro: 2,
    };
    expect(
      getDefaultSeatTypeForContract(contract, productSeatTypes, {
        seatLimits,
        seatCounts,
      })
    ).toBe("max");
  });

  it("returns none when all tiers are at their maxSeats cap", () => {
    const seatLimits = new Map<MembershipSeatType, SeatLimit>([
      ["pro", { minSeats: 0, maxSeats: 2 }],
      ["max", { minSeats: 0, maxSeats: 1 }],
    ]);
    const seatCounts: Partial<Record<MembershipSeatType, number>> = {
      pro: 2,
      max: 1,
    };
    expect(
      getDefaultSeatTypeForContract(contract, productSeatTypes, {
        seatLimits,
        seatCounts,
      })
    ).toBe("none");
  });

  it("assigns normally when no tiers are at cap", () => {
    const seatLimits = new Map<MembershipSeatType, SeatLimit>([
      ["pro", { minSeats: 0, maxSeats: 10 }],
    ]);
    const seatCounts: Partial<Record<MembershipSeatType, number>> = {
      pro: 5,
    };
    // Both tiers have 0 AWU; tie-break is alphabetical, so "max" < "pro".
    // Neither is capped, so the first sorted tier ("max") is assigned.
    expect(
      getDefaultSeatTypeForContract(contract, productSeatTypes, {
        seatLimits,
        seatCounts,
      })
    ).toBe("max");
  });

  it("legacy: no-seat-subscription contract returns workspace regardless of caps", () => {
    const legacyContract = {
      subscriptions: [],
      recurring_credits: [],
      overrides: [],
    } as unknown as CachedContract;
    const seatLimits = new Map<MembershipSeatType, SeatLimit>([
      ["workspace", { minSeats: 0, maxSeats: 0 }],
    ]);
    const seatCounts: Partial<Record<MembershipSeatType, number>> = {
      workspace: 99,
    };
    // The early-return for no subscriptions runs before cap logic.
    expect(
      getDefaultSeatTypeForContract(legacyContract, productSeatTypes, {
        seatLimits,
        seatCounts,
      })
    ).toBe("workspace");
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

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

  it("assigns the entitled committed seat, not a dormant lower-name subscription", () => {
    // Both seats are 0 AWU; without entitlement filtering the tie-break would
    // pick "workspace" (< "workspace_yearly"). Entitlement must win: only
    // workspace_yearly is in onContract, so its committed slot is assigned.
    const seatLimits = new Map<MembershipSeatType, SeatLimit>([
      ["workspace_yearly", { minSeats: 10, maxSeats: null }],
    ]);
    const seatCounts: Partial<Record<MembershipSeatType, number>> = {
      workspace_yearly: 0,
    };
    expect(
      getDefaultSeatTypeForContract(contract, productSeatTypes, {
        seatLimits,
        seatCounts,
      })
    ).toBe("workspace_yearly");
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

  it("returns none when committed exhausted and free blocked (useFreeSeat=false)", () => {
    const seatLimits = new Map<MembershipSeatType, SeatLimit>([
      ["pro", { minSeats: 5, maxSeats: null }],
    ]);
    const seatCounts: Partial<Record<MembershipSeatType, number>> = { pro: 5 };
    expect(
      getDefaultSeatTypeForContract(contract, productSeatTypes, {
        useFreeSeat: false,
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

  it("legacy: no-seat-subscription contract returns workspace regardless", () => {
    const legacyContract = {
      subscriptions: [],
      recurring_credits: [],
      overrides: [],
    } as unknown as CachedContract;
    expect(
      getDefaultSeatTypeForContract(legacyContract, productSeatTypes)
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

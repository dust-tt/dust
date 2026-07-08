import {
  getDefaultSeatTypeForContract,
  getSeatSubscriptionsFromContract,
  resolveRequestedSeatTypeForContract,
} from "@app/lib/metronome/seat_types";
import type { SeatLimit } from "@app/lib/resources/workspace_seat_limit_resource";
import { buildCachedContractMock } from "@app/tests/utils/metronome_contracts";
import type { MembershipSeatType } from "@app/types/memberships";
import { describe, expect, it } from "vitest";

describe("getDefaultSeatTypeForContract — entitlement", () => {
  const { contract, productSeatTypes } = buildCachedContractMock({
    seats: [{ seatType: "pro" }, { seatType: "pro_yearly", entitled: true }],
  });

  it("assigns the entitled committed seat, not a dormant lower-name subscription", () => {
    const seatLimits = new Map<MembershipSeatType, SeatLimit>([
      ["pro_yearly", { minSeats: 10, maxSeats: null }],
    ]);
    expect(
      getDefaultSeatTypeForContract(contract, productSeatTypes, {
        seatLimits,
        seatCounts: { pro_yearly: 0 },
      })
    ).toBe("pro_yearly");
  });
});

describe("getDefaultSeatTypeForContract — committed seats", () => {
  const { contract, productSeatTypes } = buildCachedContractMock({
    seats: [
      { seatType: "pro", entitled: true },
      { seatType: "free", entitled: true },
    ],
  });

  it("assigns a committed seat when slots remain", () => {
    const seatLimits = new Map<MembershipSeatType, SeatLimit>([
      ["pro", { minSeats: 5, maxSeats: null }],
    ]);
    expect(
      getDefaultSeatTypeForContract(contract, productSeatTypes, {
        seatLimits,
        seatCounts: { pro: 3 },
      })
    ).toBe("pro");
  });

  it("falls through to free when all committed slots are taken", () => {
    const seatLimits = new Map<MembershipSeatType, SeatLimit>([
      ["pro", { minSeats: 5, maxSeats: null }],
    ]);
    expect(
      getDefaultSeatTypeForContract(contract, productSeatTypes, {
        seatLimits,
        seatCounts: { pro: 5 },
      })
    ).toBe("free");
  });

  it("returns none when committed exhausted and free blocked (returning member)", () => {
    const seatLimits = new Map<MembershipSeatType, SeatLimit>([
      ["pro", { minSeats: 5, maxSeats: null }],
    ]);
    expect(
      getDefaultSeatTypeForContract(contract, productSeatTypes, {
        isReturningMember: true,
        seatLimits,
        seatCounts: { pro: 5 },
      })
    ).toBe("none");
  });

  it("returns none when no committed seats configured and free not available", () => {
    expect(
      getDefaultSeatTypeForContract(contract, productSeatTypes, {
        isReturningMember: true,
      })
    ).toBe("none");
  });

  it("assigns free (no committed seats, new member)", () => {
    expect(getDefaultSeatTypeForContract(contract, productSeatTypes)).toBe(
      "free"
    );
  });

  it("skips max even when it has committed slots, falls through to free", () => {
    const { contract: maxContract, productSeatTypes: maxProductSeatTypes } =
      buildCachedContractMock({
        seats: [
          { seatType: "max", entitled: true },
          { seatType: "free", entitled: true },
        ],
      });
    const seatLimits = new Map<MembershipSeatType, SeatLimit>([
      ["max", { minSeats: 5, maxSeats: null }],
    ]);
    expect(
      getDefaultSeatTypeForContract(maxContract, maxProductSeatTypes, {
        seatLimits,
        seatCounts: { max: 0 },
      })
    ).toBe("free");
  });

  it("auto-assigns workspace_yearly when committed slots remain (pooled enterprise)", () => {
    const { contract: wsContract, productSeatTypes: wsProductSeatTypes } =
      buildCachedContractMock({
        seats: [
          { seatType: "workspace_yearly", entitled: true },
          { seatType: "free", entitled: true },
        ],
      });
    const seatLimits = new Map<MembershipSeatType, SeatLimit>([
      ["workspace_yearly", { minSeats: 10, maxSeats: null }],
    ]);
    expect(
      getDefaultSeatTypeForContract(wsContract, wsProductSeatTypes, {
        seatLimits,
        seatCounts: { workspace_yearly: 4 },
      })
    ).toBe("workspace_yearly");
  });

  it("falls through to free once workspace_yearly committed slots are taken", () => {
    const { contract: wsContract, productSeatTypes: wsProductSeatTypes } =
      buildCachedContractMock({
        seats: [
          { seatType: "workspace_yearly", entitled: true },
          { seatType: "free", entitled: true },
        ],
      });
    const seatLimits = new Map<MembershipSeatType, SeatLimit>([
      ["workspace_yearly", { minSeats: 10, maxSeats: null }],
    ]);
    expect(
      getDefaultSeatTypeForContract(wsContract, wsProductSeatTypes, {
        seatLimits,
        seatCounts: { workspace_yearly: 10 },
      })
    ).toBe("free");
  });

  it("legacy: no-seat-subscription contract returns none", () => {
    const { contract: legacyContract } = buildCachedContractMock();
    expect(
      getDefaultSeatTypeForContract(legacyContract, productSeatTypes)
    ).toBe("none");
  });
});

describe("getDefaultSeatTypeForContract — requested seat (invitation)", () => {
  const { contract, productSeatTypes } = buildCachedContractMock({
    seats: [
      { seatType: "free", entitled: true },
      { seatType: "pro", entitled: true },
      { seatType: "max", entitled: true },
    ],
  });

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
    const { contract: proOnly, productSeatTypes: proOnlyTypes } =
      buildCachedContractMock({
        seats: [
          { seatType: "free", entitled: true },
          { seatType: "pro", entitled: true },
        ],
      });
    expect(
      resolveRequestedSeatTypeForContract(proOnly, proOnlyTypes, {
        requestedSeatType: "max",
      })
    ).toBe("free");
  });

  it("does not fall back to a committed paid seat; uses free instead", () => {
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
    const { contract: noFree, productSeatTypes: noFreeTypes } =
      buildCachedContractMock({
        seats: [{ seatType: "pro", entitled: true }],
      });
    expect(
      resolveRequestedSeatTypeForContract(noFree, noFreeTypes, {
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

describe("getSeatSubscriptionsFromContract — effective entitlement", () => {
  it("drops a seat disabled by a later override and keeps a newly entitled one", () => {
    const { contract, productSeatTypes } = buildCachedContractMock({
      seats: [{ seatType: "pro" }, { seatType: "pro_yearly" }],
      overrides: [
        { entitled: true, product: { id: "pro_yearly-product" } },
        {
          entitled: false,
          starting_at: "2026-06-01T00:00:00.000Z",
          product: { id: "pro_yearly-product" },
        },
        {
          entitled: true,
          starting_at: "2026-06-01T00:00:00.000Z",
          product: { id: "pro-product" },
        },
      ],
    });

    const seatTypes = [
      ...getSeatSubscriptionsFromContract(contract, productSeatTypes).keys(),
    ];
    expect(seatTypes).toEqual(["pro"]);
  });

  it("lets a same-timestamp disable win over an entitle", () => {
    const { contract, productSeatTypes } = buildCachedContractMock({
      seats: [{ seatType: "pro" }, { seatType: "pro_yearly" }],
      overrides: [
        {
          entitled: true,
          starting_at: "2026-06-01T00:00:00.000Z",
          product: { id: "pro-product" },
        },
        {
          entitled: true,
          starting_at: "2026-06-01T00:00:00.000Z",
          product: { id: "pro_yearly-product" },
        },
        {
          entitled: false,
          starting_at: "2026-06-01T00:00:00.000Z",
          product: { id: "pro_yearly-product" },
        },
      ],
    });

    const onContract = getSeatSubscriptionsFromContract(
      contract,
      productSeatTypes
    );
    expect(onContract.has("pro")).toBe(true);
    expect(onContract.has("pro_yearly")).toBe(false);
  });
});

import type { CachedContract } from "@app/lib/metronome/plan_type";
import { moveSeatWithCreditCarry } from "@app/lib/metronome/seats";
import type { MembershipSeatType } from "@app/types/memberships";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUpdateSubscriptionSeats,
  mockListSeatBalances,
  mockFindSeatCreditSegment,
  mockGetSeatActiveSince,
  mockAdjustSeatCreditBalances,
  mockGetSeatSubscriptions,
  mockGetAwuAllocation,
  mockGetCreditTypeAwuId,
} = vi.hoisted(() => ({
  mockUpdateSubscriptionSeats: vi.fn(),
  mockListSeatBalances: vi.fn(),
  mockFindSeatCreditSegment: vi.fn(),
  mockGetSeatActiveSince: vi.fn(),
  mockAdjustSeatCreditBalances: vi.fn(),
  mockGetSeatSubscriptions: vi.fn(),
  mockGetAwuAllocation: vi.fn(),
  mockGetCreditTypeAwuId: vi.fn(),
}));

// Fully replace the client module (no importActual) so importing it never pulls
// the real dependency graph that touches Redis at module load.
vi.mock("@app/lib/metronome/client", () => ({
  getMetronomeContractById: vi.fn(),
  updateSubscriptionQuantity: vi.fn(),
  updateSubscriptionSeats: mockUpdateSubscriptionSeats,
  getMetronomeSubscriptionSeatState: vi.fn(),
  listCustomerPerUserCreditUserIds: vi.fn(),
  listCustomerPerUserCreditBalances: vi.fn(),
  addPerUserCreditToCustomer: vi.fn(),
  revokePerUserCustomerCredit: vi.fn(),
  listMetronomeSeatBalances: mockListSeatBalances,
  findSeatCreditSegmentForPeriod: mockFindSeatCreditSegment,
  getMetronomeSeatActiveSince: mockGetSeatActiveSince,
  adjustSeatCreditBalances: mockAdjustSeatCreditBalances,
}));

vi.mock("@app/lib/metronome/seat_types", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/seat_types")
  >("@app/lib/metronome/seat_types");
  return {
    ...actual,
    getSeatSubscriptionsFromContract: mockGetSeatSubscriptions,
    getAwuAllocationForSeatType: mockGetAwuAllocation,
  };
});

vi.mock("@app/lib/metronome/constants", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/constants")
  >("@app/lib/metronome/constants");
  return { ...actual, getCreditTypeAwuId: mockGetCreditTypeAwuId };
});

// seats.ts wires a `cacheWithRedis` at import time — stub so importing it never
// touches Redis.
vi.mock("@app/lib/utils/cache", () => ({
  cacheWithRedis: (fn: unknown) => fn,
  invalidateCacheWithRedis: () => async () => {},
  bestEffortInvalidateCacheWithRedis: () => async () => {},
}));

// Not used by `moveSeatWithCreditCarry`, but seats.ts imports these and their
// real module graph touches Redis at import — stub them out.
vi.mock("@app/lib/metronome/alerts/per_user_credit_balance", () => ({
  upsertPerUserCreditBalanceAlerts: vi.fn(),
  clearPerUserCreditBalanceAlerts: vi.fn(),
}));
vi.mock("@app/lib/resources/membership_resource", () => ({
  MembershipResource: {},
}));
vi.mock("@app/lib/resources/workspace_seat_limit_resource", () => ({
  WorkspaceSeatLimitResource: {},
}));

const AWU = "awu";

// A contract whose recurring credits link each seat subscription to its credit.
const CONTRACT = {
  recurring_credits: [
    { id: "cred_pro", subscription_config: { subscription_id: "sub_pro" } },
    { id: "cred_max", subscription_config: { subscription_id: "sub_max" } },
  ],
} as unknown as CachedContract;

function seatBalance(balance: number) {
  return new Ok([
    {
      seat_id: "u1",
      balances: [{ credit_type_id: AWU, balance, starting_balance: 8000 }],
    },
  ]);
}

describe("moveSeatWithCreditCarry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCreditTypeAwuId.mockReturnValue(AWU);
    mockGetSeatSubscriptions.mockReturnValue(
      new Map([
        ["pro", { id: "sub_pro" }],
        ["max", { id: "sub_max" }],
      ])
    );
    mockGetAwuAllocation.mockImplementation(
      (_contract: unknown, seatType: MembershipSeatType) =>
        seatType === "max" ? 40000 : 8000
    );
    mockUpdateSubscriptionSeats.mockResolvedValue(new Ok(undefined));
    mockFindSeatCreditSegment.mockResolvedValue(
      new Ok({
        creditId: "seg_credit",
        segmentId: "seg_1",
        segmentStartingAt: "2026-01-01T00:00:00.000Z",
      })
    );
    mockGetSeatActiveSince.mockResolvedValue(
      new Ok(new Date("2026-01-01T00:00:00.000Z"))
    );
    mockAdjustSeatCreditBalances.mockResolvedValue(new Ok(undefined));
  });

  it("pro→max: empties the pro credit, moves the seat, then carries consumption onto max", async () => {
    // Origin (pro) balance read first (3000 of 8000 left ⇒ 5000 consumed), then
    // the new (max) credit balance read during the carry (fresh 40000).
    mockListSeatBalances
      .mockResolvedValueOnce(seatBalance(3000))
      .mockResolvedValueOnce(seatBalance(40000));

    const result = await moveSeatWithCreditCarry({
      metronomeCustomerId: "cus_1",
      contractId: "con_1",
      contract: CONTRACT,
      productSeatTypes: new Map(),
      workspaceId: "ws_1",
      userId: "u1",
      fromSeatType: "pro",
      toSeatType: "max",
    });

    expect(result.isOk()).toBe(true);

    // Emptied the origin (pro) credit by the remaining 3000.
    const emptyCall = mockAdjustSeatCreditBalances.mock.calls.find((c) =>
      c[0].reason.includes("empty origin credit")
    );
    expect(emptyCall?.[0].perSeatAmounts).toEqual({ u1: -3000 });

    // Moved the seat from the pro sub to the max sub.
    expect(mockUpdateSubscriptionSeats).toHaveBeenCalledWith(
      expect.objectContaining({
        fromSubscriptionId: "sub_pro",
        toSubscriptionId: "sub_max",
        addSeatIds: ["u1"],
        removeSeatIds: ["u1"],
      })
    );

    // Carried consumption: max credit set to allocation − consumed = 40000 −
    // 5000 = 35000; current fresh balance is 40000, so delta −5000.
    const carryCall = mockAdjustSeatCreditBalances.mock.calls.find((c) =>
      c[0].reason.includes("carry over consumed AWU")
    );
    expect(carryCall?.[0].perSeatAmounts).toEqual({ u1: -5000 });

    // Order: empty origin BEFORE the move BEFORE the carry.
    const emptyOrder = mockAdjustSeatCreditBalances.mock.invocationCallOrder[0];
    const moveOrder = mockUpdateSubscriptionSeats.mock.invocationCallOrder[0];
    const carryOrder = mockAdjustSeatCreditBalances.mock.invocationCallOrder[1];
    expect(emptyOrder).toBeLessThan(moveOrder);
    expect(moveOrder).toBeLessThan(carryOrder);
  });

  it("plain add (no previous seat): moves the seat, no balance read or ledger transfer", async () => {
    const result = await moveSeatWithCreditCarry({
      metronomeCustomerId: "cus_1",
      contractId: "con_1",
      contract: CONTRACT,
      productSeatTypes: new Map(),
      workspaceId: "ws_1",
      userId: "u1",
      fromSeatType: undefined,
      toSeatType: "pro",
    });

    expect(result.isOk()).toBe(true);
    expect(mockListSeatBalances).not.toHaveBeenCalled();
    expect(mockAdjustSeatCreditBalances).not.toHaveBeenCalled();
    expect(mockUpdateSubscriptionSeats).toHaveBeenCalledWith(
      expect.objectContaining({
        fromSubscriptionId: "sub_pro",
        toSubscriptionId: undefined,
        addSeatIds: ["u1"],
        removeSeatIds: [],
      })
    );
  });

  it("no billable subscription for the target seat type: does nothing", async () => {
    mockGetSeatSubscriptions.mockReturnValue(
      new Map([["pro", { id: "sub_pro" }]])
    );

    const result = await moveSeatWithCreditCarry({
      metronomeCustomerId: "cus_1",
      contractId: "con_1",
      contract: CONTRACT,
      productSeatTypes: new Map(),
      workspaceId: "ws_1",
      userId: "u1",
      fromSeatType: "pro",
      toSeatType: "none",
    });

    expect(result.isOk()).toBe(true);
    expect(mockUpdateSubscriptionSeats).not.toHaveBeenCalled();
    expect(mockAdjustSeatCreditBalances).not.toHaveBeenCalled();
  });
});

import type { CachedContract } from "@app/lib/metronome/plan_type";
import { syncSeatCount } from "@app/lib/metronome/seats";
import type { MembershipSeatType } from "@app/types/memberships";
import { Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetProductSeatTypes,
  mockUpdateSubscriptionQuantity,
  mockUpdateSubscriptionSeats,
  mockGetSeatState,
  mockGetActiveMemberships,
  mockGetScheduledFutureMemberships,
  mockFetchSeatLimits,
} = vi.hoisted(() => ({
  mockGetProductSeatTypes: vi.fn(),
  mockUpdateSubscriptionQuantity: vi.fn(),
  mockUpdateSubscriptionSeats: vi.fn(),
  mockGetSeatState: vi.fn(),
  mockGetActiveMemberships: vi.fn(),
  mockGetScheduledFutureMemberships: vi.fn(),
  mockFetchSeatLimits: vi.fn(),
}));

vi.mock("@app/lib/metronome/client", () => ({
  getMetronomeContractById: vi.fn(),
  updateSubscriptionQuantity: mockUpdateSubscriptionQuantity,
  updateSubscriptionSeats: mockUpdateSubscriptionSeats,
  getMetronomeSubscriptionSeatState: mockGetSeatState,
  getMetronomeSubscriptionAssignedSeatIds: vi.fn(),
}));

vi.mock("@app/lib/metronome/seat_types", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/seat_types")
  >("@app/lib/metronome/seat_types");
  return { ...actual, getProductSeatTypes: mockGetProductSeatTypes };
});

vi.mock("@app/lib/resources/membership_resource", () => ({
  MembershipResource: {
    getActiveMemberships: mockGetActiveMemberships,
    getScheduledFutureMemberships: mockGetScheduledFutureMemberships,
  },
}));

vi.mock("@app/lib/resources/workspace_seat_limit_resource", () => ({
  WorkspaceSeatLimitResource: { fetchByWorkspace: mockFetchSeatLimits },
}));

// Cache wrappers run at import time and (for invalidate) in `syncSeatCount`'s
// finally block — stub them so the test never touches Redis.
vi.mock("@app/lib/utils/cache", () => ({
  cacheWithRedis: (fn: unknown) => fn,
  invalidateCacheWithRedis: () => async () => {},
  bestEffortInvalidateCacheWithRedis: () => async () => {},
}));

const WORKSPACE = { sId: "ws_1", id: 1 } as unknown as LightWorkspaceType;

function makeContract(
  subs: Array<{ id: string; productId: string; mode: string }>
): CachedContract {
  return {
    subscriptions: subs.map(({ id, productId, mode }) => ({
      id,
      quantity_management_mode: mode,
      subscription_rate: { product: { id: productId, name: id } },
    })),
  } as unknown as CachedContract;
}

function membership(sId: string, seatType: MembershipSeatType) {
  return { user: { sId }, seatType };
}

describe("syncSeatCount min clamping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetScheduledFutureMemberships.mockResolvedValue([]);
    mockUpdateSubscriptionQuantity.mockResolvedValue(new Ok(undefined));
    mockUpdateSubscriptionSeats.mockResolvedValue(new Ok(undefined));
  });

  it("clamps a QUANTITY_ONLY count up to the configured minSeats", async () => {
    mockGetProductSeatTypes.mockResolvedValue(
      new Map([["ws-product", "workspace"]])
    );
    mockGetActiveMemberships.mockResolvedValue({
      memberships: [membership("u1", "workspace")],
      total: 1,
    });
    mockFetchSeatLimits.mockResolvedValue(
      new Map([["workspace", { minSeats: 5 }]])
    );

    const result = await syncSeatCount({
      metronomeCustomerId: "cus_1",
      contractId: "con_1",
      workspace: WORKSPACE,
      contract: makeContract([
        { id: "sub_ws", productId: "ws-product", mode: "QUANTITY_ONLY" },
      ]),
    });

    expect(result.isOk()).toBe(true);
    // Actual headcount is 1, but the floor of 5 is billed.
    expect(mockUpdateSubscriptionQuantity).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: "sub_ws", quantity: 5 })
    );
  });

  it("does not clamp a QUANTITY_ONLY count already above minSeats", async () => {
    mockGetProductSeatTypes.mockResolvedValue(
      new Map([["ws-product", "workspace"]])
    );
    mockGetActiveMemberships.mockResolvedValue({
      memberships: [
        membership("u1", "workspace"),
        membership("u2", "workspace"),
        membership("u3", "workspace"),
      ],
      total: 3,
    });
    mockFetchSeatLimits.mockResolvedValue(
      new Map([["workspace", { minSeats: 2 }]])
    );

    await syncSeatCount({
      metronomeCustomerId: "cus_1",
      contractId: "con_1",
      workspace: WORKSPACE,
      contract: makeContract([
        { id: "sub_ws", productId: "ws-product", mode: "QUANTITY_ONLY" },
      ]),
    });

    expect(mockUpdateSubscriptionQuantity).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: "sub_ws", quantity: 3 })
    );
  });

  it("adds unassigned seats to reach minSeats on a SEAT_BASED subscription", async () => {
    mockGetProductSeatTypes.mockResolvedValue(
      new Map([["pro-product", "pro"]])
    );
    mockGetActiveMemberships.mockResolvedValue({
      memberships: [membership("u1", "pro")],
      total: 1,
    });
    mockFetchSeatLimits.mockResolvedValue(new Map([["pro", { minSeats: 3 }]]));
    // No seats currently assigned in Metronome.
    mockGetSeatState.mockResolvedValue(
      new Ok({ assignedSeatIds: [], unassignedSeats: 0 })
    );

    await syncSeatCount({
      metronomeCustomerId: "cus_1",
      contractId: "con_1",
      workspace: WORKSPACE,
      contract: makeContract([
        { id: "sub_pro", productId: "pro-product", mode: "SEAT_BASED" },
      ]),
    });

    // 1 real user assigned, floor of 3 → 2 unassigned seats added.
    expect(mockUpdateSubscriptionSeats).toHaveBeenCalledWith(
      expect.objectContaining({
        fromSubscriptionId: "sub_pro",
        addSeatIds: ["u1"],
        addUnassignedSeats: 2,
        removeUnassignedSeats: 0,
      })
    );
  });

  it("removes excess unassigned seats when headcount rises above minSeats", async () => {
    mockGetProductSeatTypes.mockResolvedValue(
      new Map([["pro-product", "pro"]])
    );
    mockGetActiveMemberships.mockResolvedValue({
      memberships: [
        membership("u1", "pro"),
        membership("u2", "pro"),
        membership("u3", "pro"),
        membership("u4", "pro"),
      ],
      total: 4,
    });
    mockFetchSeatLimits.mockResolvedValue(new Map([["pro", { minSeats: 3 }]]));
    // Previously: 1 assigned + 2 unassigned (floor padding). Now 4 real users.
    mockGetSeatState.mockResolvedValue(
      new Ok({ assignedSeatIds: ["u1"], unassignedSeats: 2 })
    );

    await syncSeatCount({
      metronomeCustomerId: "cus_1",
      contractId: "con_1",
      workspace: WORKSPACE,
      contract: makeContract([
        { id: "sub_pro", productId: "pro-product", mode: "SEAT_BASED" },
      ]),
    });

    expect(mockUpdateSubscriptionSeats).toHaveBeenCalledWith(
      expect.objectContaining({
        fromSubscriptionId: "sub_pro",
        addSeatIds: ["u2", "u3", "u4"],
        addUnassignedSeats: 0,
        removeUnassignedSeats: 2,
      })
    );
  });
});

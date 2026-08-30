import type { CachedContract } from "@app/lib/metronome/plan_type";
import { Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { assignSeatForUser } from "./seat_sync";

const {
  mockUpdateSubscriptionSeats,
  mockGetActiveContract,
  mockGetProductSeatTypes,
  mockGetSeatSubscriptionsFromContract,
  mockReconcileUser,
  mockFetchActiveSubscription,
  mockFetchWorkspaceById,
  mockInternalAdmin,
} = vi.hoisted(() => ({
  mockUpdateSubscriptionSeats: vi.fn(),
  mockGetActiveContract: vi.fn(),
  mockGetProductSeatTypes: vi.fn(),
  mockGetSeatSubscriptionsFromContract: vi.fn(),
  mockReconcileUser: vi.fn(),
  mockFetchActiveSubscription: vi.fn(),
  mockFetchWorkspaceById: vi.fn(),
  mockInternalAdmin: vi.fn(),
}));

vi.mock("@app/lib/metronome/client", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/client")
  >("@app/lib/metronome/client");
  return { ...actual, updateSubscriptionSeats: mockUpdateSubscriptionSeats };
});

vi.mock("@app/lib/metronome/plan_type", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/plan_type")
  >("@app/lib/metronome/plan_type");
  return { ...actual, getActiveContract: mockGetActiveContract };
});

vi.mock("@app/lib/metronome/seat_types", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/seat_types")
  >("@app/lib/metronome/seat_types");
  return {
    ...actual,
    getProductSeatTypes: mockGetProductSeatTypes,
    getSeatSubscriptionsFromContract: mockGetSeatSubscriptionsFromContract,
  };
});

vi.mock("@app/lib/api/metronome/reconcile_credit_state", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/api/metronome/reconcile_credit_state")
  >("@app/lib/api/metronome/reconcile_credit_state");
  return { ...actual, reconcileUser: mockReconcileUser };
});

vi.mock("@app/lib/resources/subscription_resource", () => ({
  SubscriptionResource: {
    fetchActiveByWorkspaceModelId: mockFetchActiveSubscription,
  },
}));

vi.mock("@app/lib/resources/workspace_resource", () => ({
  WorkspaceResource: { fetchById: mockFetchWorkspaceById },
}));

vi.mock("@app/lib/auth", () => ({
  Authenticator: { internalAdminForWorkspace: mockInternalAdmin },
}));

const WORKSPACE = {
  sId: "ws_1",
  id: 1,
  metronomeCustomerId: "cus_1",
} as unknown as LightWorkspaceType;

describe("assignSeatForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchActiveSubscription.mockResolvedValue({
      metronomeContractId: "con_1",
    });
    mockGetActiveContract.mockResolvedValue({} as CachedContract);
    mockGetProductSeatTypes.mockResolvedValue(new Map());
    mockGetSeatSubscriptionsFromContract.mockReturnValue(
      new Map([
        ["pro", { id: "sub_pro" }],
        ["max", { id: "sub_max" }],
      ])
    );
    mockUpdateSubscriptionSeats.mockResolvedValue(new Ok(undefined));
    mockReconcileUser.mockResolvedValue(new Ok({}));
    mockFetchWorkspaceById.mockResolvedValue({ sId: "ws_1" });
    mockInternalAdmin.mockResolvedValue({});
  });

  it("assigns only the user's single seat — never touches the unassigned pool", async () => {
    const result = await assignSeatForUser({
      workspace: WORKSPACE,
      userId: "u1",
      seatType: "pro",
    });

    expect(result.isOk()).toBe(true);
    expect(mockUpdateSubscriptionSeats).toHaveBeenCalledTimes(1);
    // A single add of this user's seat to the target sub — and crucially, no
    // add/remove_unassigned in the payload (that math belongs to the workflow).
    expect(mockUpdateSubscriptionSeats).toHaveBeenCalledWith({
      metronomeCustomerId: "cus_1",
      contractId: "con_1",
      fromSubscriptionId: "sub_pro",
      toSubscriptionId: undefined,
      addSeatIds: ["u1"],
      removeSeatIds: [],
    });
    const call = mockUpdateSubscriptionSeats.mock.calls[0][0];
    expect(call.addUnassignedSeats).toBeUndefined();
    expect(call.removeUnassignedSeats).toBeUndefined();
    expect(mockReconcileUser).toHaveBeenCalledTimes(1);
  });

  it("moves the seat between subscriptions on a seat-type change", async () => {
    const result = await assignSeatForUser({
      workspace: WORKSPACE,
      userId: "u1",
      seatType: "max",
      previousSeatType: "pro",
    });

    expect(result.isOk()).toBe(true);
    expect(mockUpdateSubscriptionSeats).toHaveBeenCalledWith({
      metronomeCustomerId: "cus_1",
      contractId: "con_1",
      fromSubscriptionId: "sub_pro",
      toSubscriptionId: "sub_max",
      addSeatIds: ["u1"],
      removeSeatIds: ["u1"],
    });
  });

  it("skips the seat edit when the target seat type has no billable subscription", async () => {
    const result = await assignSeatForUser({
      workspace: WORKSPACE,
      userId: "u1",
      seatType: "none",
      previousSeatType: "pro",
    });

    expect(result.isOk()).toBe(true);
    // No seat write for a non-billable target (the workflow handles removal),
    // but the user's credit state is still reconciled.
    expect(mockUpdateSubscriptionSeats).not.toHaveBeenCalled();
    expect(mockReconcileUser).toHaveBeenCalledTimes(1);
  });

  it("no-ops when the workspace is not on Metronome", async () => {
    const result = await assignSeatForUser({
      workspace: { ...WORKSPACE, metronomeCustomerId: null },
      userId: "u1",
      seatType: "pro",
    });

    expect(result.isOk()).toBe(true);
    expect(mockFetchActiveSubscription).not.toHaveBeenCalled();
    expect(mockUpdateSubscriptionSeats).not.toHaveBeenCalled();
  });
});

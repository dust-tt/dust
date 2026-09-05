import type { CachedContract } from "@app/lib/metronome/plan_type";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { assignSeatForUser } from "./seat_sync";

const {
  mockMoveSeatWithCreditCarry,
  mockGetActiveContract,
  mockGetProductSeatTypes,
  mockReconcileUser,
  mockFetchActiveSubscription,
  mockFetchWorkspaceById,
  mockInternalAdmin,
} = vi.hoisted(() => ({
  mockMoveSeatWithCreditCarry: vi.fn(),
  mockGetActiveContract: vi.fn(),
  mockGetProductSeatTypes: vi.fn(),
  mockReconcileUser: vi.fn(),
  mockFetchActiveSubscription: vi.fn(),
  mockFetchWorkspaceById: vi.fn(),
  mockInternalAdmin: vi.fn(),
}));

vi.mock("@app/lib/metronome/seats", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/seats")
  >("@app/lib/metronome/seats");
  return { ...actual, moveSeatWithCreditCarry: mockMoveSeatWithCreditCarry };
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
  return { ...actual, getProductSeatTypes: mockGetProductSeatTypes };
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
    mockMoveSeatWithCreditCarry.mockResolvedValue(new Ok(undefined));
    mockReconcileUser.mockResolvedValue(new Ok({}));
    mockFetchWorkspaceById.mockResolvedValue({ sId: "ws_1" });
    mockInternalAdmin.mockResolvedValue({});
  });

  it("delegates the single-seat move (with credit carry) then reconciles the user", async () => {
    const result = await assignSeatForUser({
      workspace: WORKSPACE,
      userId: "u1",
      seatType: "pro",
    });

    expect(result.isOk()).toBe(true);
    expect(mockMoveSeatWithCreditCarry).toHaveBeenCalledTimes(1);
    expect(mockMoveSeatWithCreditCarry).toHaveBeenCalledWith(
      expect.objectContaining({
        metronomeCustomerId: "cus_1",
        contractId: "con_1",
        userId: "u1",
        fromSeatType: undefined,
        toSeatType: "pro",
      })
    );
    expect(mockReconcileUser).toHaveBeenCalledTimes(1);
  });

  it("passes the from→to seat types for a pro→max upgrade (drives the ledger carry)", async () => {
    await assignSeatForUser({
      workspace: WORKSPACE,
      userId: "u1",
      seatType: "max",
      previousSeatType: "pro",
    });

    expect(mockMoveSeatWithCreditCarry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        fromSeatType: "pro",
        toSeatType: "max",
      })
    );
  });

  it("returns Err (and still reconciles nothing extra) when the seat move fails", async () => {
    mockMoveSeatWithCreditCarry.mockResolvedValue(
      new Err(new Error("metronome down"))
    );

    const result = await assignSeatForUser({
      workspace: WORKSPACE,
      userId: "u1",
      seatType: "max",
      previousSeatType: "pro",
    });

    expect(result.isErr()).toBe(true);
    expect(mockReconcileUser).not.toHaveBeenCalled();
  });

  it("no-ops when the workspace is not on Metronome", async () => {
    const result = await assignSeatForUser({
      workspace: { ...WORKSPACE, metronomeCustomerId: null },
      userId: "u1",
      seatType: "pro",
    });

    expect(result.isOk()).toBe(true);
    expect(mockFetchActiveSubscription).not.toHaveBeenCalled();
    expect(mockMoveSeatWithCreditCarry).not.toHaveBeenCalled();
  });
});

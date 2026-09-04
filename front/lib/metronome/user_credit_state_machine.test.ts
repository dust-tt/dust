import type { UserCreditContext } from "@app/lib/metronome/user_credit_state_machine";
import {
  setUserCreditStateReconciled,
  transitionUserCreditState,
} from "@app/lib/metronome/user_credit_state_machine";
import type { MembershipResource } from "@app/lib/resources/membership_resource";
import type { MembershipSeatType } from "@app/types/memberships";
import type { Transaction } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockInvalidateCacheAfterCommit, mockSetUserCreditState } = vi.hoisted(
  () => ({
    // Mimics the no-transaction branch of the real helper: fire the callback
    // synchronously so tests can assert against the underlying Redis calls.
    mockInvalidateCacheAfterCommit: vi.fn(
      (_tx: Transaction | undefined, fn: () => Promise<void>) => {
        void fn();
      }
    ),
    mockSetUserCreditState: vi.fn(),
  })
);

vi.mock("@app/lib/metronome/user_block", () => ({
  setUserCreditState: mockSetUserCreditState,
}));

vi.mock("@app/lib/utils/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/utils/cache")>();
  return {
    ...actual,
    invalidateCacheAfterCommit: mockInvalidateCacheAfterCommit,
  };
});

vi.mock("@app/logger/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MembershipDouble = MembershipResource & {
  updateCreditState: ReturnType<typeof vi.fn>;
};

// `creditState` is typed as `string` (not `UserCreditState`) so tests can seed
// legacy rows (e.g. `user_seat_low_balance`, `normal`) that the state machine
// normalizes at read time.
function makeMembership(
  creditState: string,
  seatType?: MembershipSeatType
): MembershipDouble {
  return {
    creditState,
    seatType,
    updateCreditState: vi.fn().mockResolvedValue(undefined),
  } as unknown as MembershipDouble;
}

const baseCtx: UserCreditContext = {
  workspaceId: "ws_test",
  userId: "u_test",
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Seat balance exhausted
// ---------------------------------------------------------------------------

describe("UserCreditStateMachine — seat_balance_exhausted", () => {
  it("user_seat + pro seat + pool limit > 0 → on_pool", async () => {
    const membership = makeMembership("user_seat", "pro");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_exhausted" },
      { ...baseCtx, seatType: "pro", poolLimitAwuCredits: 5000 }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("on_pool");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "on_pool",
      undefined
    );
    expect(mockSetUserCreditState).toHaveBeenCalledWith(
      "ws_test",
      "u_test",
      "on_pool"
    );
  });

  it("user_seat + pro seat + no resolved pool limit → on_pool", async () => {
    const membership = makeMembership("user_seat", "pro");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_exhausted" },
      { ...baseCtx, seatType: "pro" }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("on_pool");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "on_pool",
      undefined
    );
    expect(mockSetUserCreditState).toHaveBeenCalledWith(
      "ws_test",
      "u_test",
      "on_pool"
    );
  });

  it("legacy user_seat_low_balance (alias → user_seat) + max seat + pool limit > 0 → on_pool", async () => {
    const membership = makeMembership("user_seat_low_balance", "max");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_exhausted" },
      { ...baseCtx, seatType: "max", poolLimitAwuCredits: 5000 }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("on_pool");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "on_pool",
      undefined
    );
    expect(mockSetUserCreditState).toHaveBeenCalledWith(
      "ws_test",
      "u_test",
      "on_pool"
    );
  });

  it("free seat (pool limit 0) → no transition (stays user_seat)", async () => {
    const membership = makeMembership("user_seat", "free");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_exhausted" },
      { ...baseCtx, seatType: "free", poolLimitAwuCredits: 0 }
    );
    expect(result.isErr()).toBe(true);
    expect(membership.updateCreditState).not.toHaveBeenCalled();
    expect(mockSetUserCreditState).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Seat balance replenished
// ---------------------------------------------------------------------------

describe("UserCreditStateMachine — seat_balance_resolved", () => {
  it("on_pool + pro seat → user_seat on billing-period renewal", async () => {
    const membership = makeMembership("on_pool", "pro");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_resolved" },
      { ...baseCtx, seatType: "pro" }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("user_seat");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "user_seat",
      undefined
    );
    expect(mockSetUserCreditState).toHaveBeenCalledWith(
      "ws_test",
      "u_test",
      "user_seat"
    );
  });

  it("free seat → user_seat when the credit is replenished", async () => {
    const membership = makeMembership("on_pool", "free");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_resolved" },
      { ...baseCtx, seatType: "free" }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("user_seat");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "user_seat",
      undefined
    );
  });

  it("legacy user_seat_low_balance (alias → user_seat) → user_seat on billing-period renewal", async () => {
    const membership = makeMembership("user_seat_low_balance", "pro");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_resolved" },
      { ...baseCtx, seatType: "pro" }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("user_seat");
    }
  });

  it("workspace (pool-based) seat → no transition", async () => {
    const membership = makeMembership("on_pool", "workspace");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_resolved" },
      { ...baseCtx, seatType: "workspace" }
    );
    expect(result.isErr()).toBe(true);
    expect(membership.updateCreditState).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Authoritative reconcile setter
// ---------------------------------------------------------------------------

describe("UserCreditStateMachine — setUserCreditStateReconciled", () => {
  it("on_pool → user_seat persists and syncs the cache (no transition needed)", async () => {
    const membership = makeMembership("on_pool", "pro");
    const result = await setUserCreditStateReconciled(membership, "user_seat", {
      ...baseCtx,
      seatType: "pro",
    });
    expect(result).toBe("user_seat");
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "user_seat",
      undefined
    );
    expect(mockSetUserCreditState).toHaveBeenCalledWith(
      "ws_test",
      "u_test",
      "user_seat"
    );
  });

  it("is idempotent when already in the target state but re-syncs the cache", async () => {
    const membership = makeMembership("user_seat", "pro");
    const result = await setUserCreditStateReconciled(membership, "user_seat", {
      ...baseCtx,
      seatType: "pro",
    });
    expect(result).toBe("user_seat");
    expect(membership.updateCreditState).not.toHaveBeenCalled();
    expect(mockSetUserCreditState).toHaveBeenCalledWith(
      "ws_test",
      "u_test",
      "user_seat"
    );
  });

  it("migrates a legacy 'normal' row to 'on_pool'", async () => {
    const membership = makeMembership("normal", "workspace");
    const result = await setUserCreditStateReconciled(membership, "on_pool", {
      ...baseCtx,
      seatType: "workspace",
    });
    expect(result).toBe("on_pool");
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "on_pool",
      undefined
    );
  });

  it("forwards the provided transaction to the DB update and cache invalidator", async () => {
    const tx = { __mock: "transaction" } as unknown as Transaction;
    const membership = makeMembership("on_pool", "pro");
    await setUserCreditStateReconciled(
      membership,
      "user_seat",
      { ...baseCtx, seatType: "pro" },
      { transaction: tx }
    );
    expect(membership.updateCreditState).toHaveBeenCalledWith("user_seat", tx);
    expect(mockInvalidateCacheAfterCommit).toHaveBeenCalledWith(
      tx,
      expect.any(Function)
    );
  });
});

// ---------------------------------------------------------------------------
// Side-effect ordering & transactions
// ---------------------------------------------------------------------------

describe("UserCreditStateMachine — side effects and transactions", () => {
  it("invokes the DB update before registering the Redis side-effect", async () => {
    const membership = makeMembership("user_seat", "pro");
    await transitionUserCreditState(
      membership,
      { type: "seat_balance_exhausted" },
      { ...baseCtx, seatType: "pro", poolLimitAwuCredits: 5000 }
    );
    const dbOrder = membership.updateCreditState.mock.invocationCallOrder[0];
    const cacheOrder =
      mockInvalidateCacheAfterCommit.mock.invocationCallOrder[0];
    expect(dbOrder).toBeLessThan(cacheOrder);
  });

  it("forwards the provided transaction to both the DB update and cache invalidator", async () => {
    const tx = { __mock: "transaction" } as unknown as Transaction;
    const membership = makeMembership("user_seat", "pro");
    await transitionUserCreditState(
      membership,
      { type: "seat_balance_exhausted" },
      { ...baseCtx, seatType: "pro", poolLimitAwuCredits: 5000 },
      { transaction: tx }
    );
    expect(membership.updateCreditState).toHaveBeenCalledWith("on_pool", tx);
    expect(mockInvalidateCacheAfterCommit).toHaveBeenCalledWith(
      tx,
      expect.any(Function)
    );
  });

  it("passes undefined transaction when none is provided", async () => {
    const membership = makeMembership("user_seat", "pro");
    await transitionUserCreditState(
      membership,
      { type: "seat_balance_exhausted" },
      { ...baseCtx, seatType: "pro", poolLimitAwuCredits: 5000 }
    );
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "on_pool",
      undefined
    );
    expect(mockInvalidateCacheAfterCommit).toHaveBeenCalledWith(
      undefined,
      expect.any(Function)
    );
  });
});

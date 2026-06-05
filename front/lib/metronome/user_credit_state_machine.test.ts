import {
  MAX_SEAT_MONTHLY_AWU_CREDITS,
  PRO_SEAT_MONTHLY_AWU_CREDITS,
} from "@app/lib/metronome/setup_new_pricing";
import type { UserCreditContext } from "@app/lib/metronome/user_credit_state_machine";
import {
  setUserCreditStateReconciled,
  transitionUserCreditState,
} from "@app/lib/metronome/user_credit_state_machine";
import type { MembershipResource } from "@app/lib/resources/membership_resource";
import type {
  MembershipSeatType,
  UserCreditState,
} from "@app/types/memberships";
import type { Transaction } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockSetUserCapBlocked,
  mockClearUserCapBlocked,
  mockInvalidateCacheAfterCommit,
  mockClearUserAwuWarned,
  mockSetUserAwuWarned,
  mockSetUserCreditState,
} = vi.hoisted(() => ({
  mockSetUserCapBlocked: vi.fn(),
  mockClearUserCapBlocked: vi.fn(),
  // Mimics the no-transaction branch of the real helper: fire the callback
  // synchronously so tests can assert against the underlying Redis calls.
  mockInvalidateCacheAfterCommit: vi.fn(
    (_tx: Transaction | undefined, fn: () => Promise<void>) => {
      void fn();
    }
  ),
  mockClearUserAwuWarned: vi.fn(),
  mockSetUserAwuWarned: vi.fn(),
  mockSetUserCreditState: vi.fn(),
}));

vi.mock("@app/lib/metronome/user_block", () => ({
  setUserCapBlocked: mockSetUserCapBlocked,
  clearUserCapBlocked: mockClearUserCapBlocked,
  clearUserAwuWarned: mockClearUserAwuWarned,
  setUserAwuWarned: mockSetUserAwuWarned,
  setUserCreditState: mockSetUserCreditState,
}));

vi.mock("@app/lib/utils/cache", () => ({
  invalidateCacheAfterCommit: mockInvalidateCacheAfterCommit,
}));

vi.mock("@app/logger/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MembershipDouble = MembershipResource & {
  updateCreditState: ReturnType<typeof vi.fn>;
};

function makeMembership(
  creditState: UserCreditState,
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
// Happy-path transitions
// ---------------------------------------------------------------------------

describe("UserCreditStateMachine — transitions", () => {
  it("on_pool + per_user_cap_reached → capped (blocks user)", async () => {
    const membership = makeMembership("on_pool");
    const result = await transitionUserCreditState(
      membership,
      { type: "per_user_cap_reached" },
      baseCtx
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("capped");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "capped",
      undefined
    );
    expect(mockSetUserCapBlocked).toHaveBeenCalledWith("ws_test", "u_test");
    expect(mockClearUserCapBlocked).not.toHaveBeenCalled();
    expect(mockSetUserCreditState).toHaveBeenCalledWith(
      "ws_test",
      "u_test",
      "capped"
    );
  });

  it("capped + admin_raised_user_cap → on_pool (unblocks user)", async () => {
    const membership = makeMembership("capped");
    const result = await transitionUserCreditState(
      membership,
      { type: "admin_raised_user_cap" },
      baseCtx
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("on_pool");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "on_pool",
      undefined
    );
    expect(mockClearUserCapBlocked).toHaveBeenCalledWith("ws_test", "u_test");
    expect(mockSetUserCapBlocked).not.toHaveBeenCalled();
    expect(mockSetUserCreditState).toHaveBeenCalledWith(
      "ws_test",
      "u_test",
      "on_pool"
    );
  });

  it("capped + per_user_cap_resolved → on_pool (unblocks user)", async () => {
    const membership = makeMembership("capped");
    const result = await transitionUserCreditState(
      membership,
      { type: "per_user_cap_resolved" },
      baseCtx
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("on_pool");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "on_pool",
      undefined
    );
    expect(mockClearUserCapBlocked).toHaveBeenCalledWith("ws_test", "u_test");
    expect(mockSetUserCapBlocked).not.toHaveBeenCalled();
    expect(mockSetUserCreditState).toHaveBeenCalledWith(
      "ws_test",
      "u_test",
      "on_pool"
    );
  });

  it("capped + per_user_cap_reached is idempotent and re-applies the block cache", async () => {
    const membership = makeMembership("capped");
    const result = await transitionUserCreditState(
      membership,
      { type: "per_user_cap_reached" },
      baseCtx
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("capped");
    }
    expect(membership.updateCreditState).not.toHaveBeenCalled();
    expect(mockSetUserCapBlocked).toHaveBeenCalledWith("ws_test", "u_test");
    expect(mockClearUserCapBlocked).not.toHaveBeenCalled();
    expect(mockSetUserCreditState).toHaveBeenCalledWith(
      "ws_test",
      "u_test",
      "capped"
    );
  });

  it("on_pool + per_user_cap_resolved is idempotent and re-applies the unblock cache", async () => {
    const membership = makeMembership("on_pool");
    const result = await transitionUserCreditState(
      membership,
      { type: "per_user_cap_resolved" },
      baseCtx
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("on_pool");
    }
    expect(membership.updateCreditState).not.toHaveBeenCalled();
    expect(mockClearUserCapBlocked).toHaveBeenCalledWith("ws_test", "u_test");
    expect(mockSetUserCapBlocked).not.toHaveBeenCalled();
    expect(mockSetUserCreditState).toHaveBeenCalledWith(
      "ws_test",
      "u_test",
      "on_pool"
    );
  });
});

// ---------------------------------------------------------------------------
// Seat balance transitions
// ---------------------------------------------------------------------------

describe("UserCreditStateMachine — seat_balance_exhausted", () => {
  it("user_seat + free seat → capped", async () => {
    const membership = makeMembership("user_seat", "free");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_exhausted", poolLimitAwuCredits: null },
      { ...baseCtx, seatType: "free" }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("capped");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "capped",
      undefined
    );
    expect(mockSetUserCapBlocked).toHaveBeenCalledWith("ws_test", "u_test");
    expect(mockClearUserCapBlocked).not.toHaveBeenCalled();
    expect(mockSetUserCreditState).toHaveBeenCalledWith(
      "ws_test",
      "u_test",
      "capped"
    );
  });

  it("user_seat_low_balance + free seat → capped", async () => {
    const membership = makeMembership("user_seat_low_balance", "free");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_exhausted", poolLimitAwuCredits: null },
      { ...baseCtx, seatType: "free" }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("capped");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "capped",
      undefined
    );
    expect(mockSetUserCapBlocked).toHaveBeenCalledWith("ws_test", "u_test");
    expect(mockSetUserCreditState).toHaveBeenCalledWith(
      "ws_test",
      "u_test",
      "capped"
    );
  });

  it("user_seat + pro seat + pool limit > 0 → on_pool", async () => {
    const membership = makeMembership("user_seat", "pro");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_exhausted", poolLimitAwuCredits: 5000 },
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
    expect(mockClearUserCapBlocked).toHaveBeenCalledWith("ws_test", "u_test");
    expect(mockSetUserCapBlocked).not.toHaveBeenCalled();
    expect(mockSetUserCreditState).toHaveBeenCalledWith(
      "ws_test",
      "u_test",
      "on_pool"
    );
  });

  it("user_seat + pro seat + pool limit null (unlimited) → on_pool", async () => {
    const membership = makeMembership("user_seat", "pro");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_exhausted", poolLimitAwuCredits: null },
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

  it("user_seat + pro seat + pool limit = 0 → capped", async () => {
    const membership = makeMembership("user_seat", "pro");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_exhausted", poolLimitAwuCredits: 0 },
      { ...baseCtx, seatType: "pro" }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("capped");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "capped",
      undefined
    );
    expect(mockSetUserCapBlocked).toHaveBeenCalledWith("ws_test", "u_test");
    expect(mockSetUserCreditState).toHaveBeenCalledWith(
      "ws_test",
      "u_test",
      "capped"
    );
  });

  it("user_seat_low_balance + max seat + pool limit null → on_pool", async () => {
    const membership = makeMembership("user_seat_low_balance", "max");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_exhausted", poolLimitAwuCredits: null },
      { ...baseCtx, seatType: "max" }
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
});

describe("UserCreditStateMachine — seat_low_balance", () => {
  it("user_seat + max threshold + max seat → user_seat_low_balance", async () => {
    const membership = makeMembership("user_seat", "max");
    const result = await transitionUserCreditState(
      membership,
      {
        type: "seat_low_balance",
        threshold: 0.2 * MAX_SEAT_MONTHLY_AWU_CREDITS,
      },
      { ...baseCtx, seatType: "max" }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("user_seat_low_balance");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "user_seat_low_balance",
      undefined
    );
    expect(mockSetUserAwuWarned).toHaveBeenCalledWith("ws_test", "u_test");
    expect(mockSetUserCapBlocked).not.toHaveBeenCalled();
    expect(mockSetUserCreditState).toHaveBeenCalledWith(
      "ws_test",
      "u_test",
      "user_seat_low_balance"
    );
  });

  it("user_seat + pro threshold + pro seat → user_seat_low_balance", async () => {
    const membership = makeMembership("user_seat", "pro");
    const result = await transitionUserCreditState(
      membership,
      {
        type: "seat_low_balance",
        threshold: 0.2 * PRO_SEAT_MONTHLY_AWU_CREDITS,
      },
      { ...baseCtx, seatType: "pro" }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("user_seat_low_balance");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "user_seat_low_balance",
      undefined
    );
    expect(mockSetUserAwuWarned).toHaveBeenCalledWith("ws_test", "u_test");
    expect(mockSetUserCreditState).toHaveBeenCalledWith(
      "ws_test",
      "u_test",
      "user_seat_low_balance"
    );
  });

  it("user_seat + max threshold + pro seat → no transition (guard mismatch)", async () => {
    const membership = makeMembership("user_seat", "pro");
    const result = await transitionUserCreditState(
      membership,
      {
        type: "seat_low_balance",
        threshold: 0.2 * MAX_SEAT_MONTHLY_AWU_CREDITS,
      },
      { ...baseCtx, seatType: "pro" }
    );
    expect(result.isErr()).toBe(true);
    expect(membership.updateCreditState).not.toHaveBeenCalled();
    expect(mockSetUserCreditState).not.toHaveBeenCalled();
  });

  it("user_seat_low_balance + max threshold + max seat is idempotent", async () => {
    const membership = makeMembership("user_seat_low_balance", "max");
    const result = await transitionUserCreditState(
      membership,
      {
        type: "seat_low_balance",
        threshold: 0.2 * MAX_SEAT_MONTHLY_AWU_CREDITS,
      },
      { ...baseCtx, seatType: "max" }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("user_seat_low_balance");
    }
    expect(membership.updateCreditState).not.toHaveBeenCalled();
    expect(mockSetUserCreditState).toHaveBeenCalledWith(
      "ws_test",
      "u_test",
      "user_seat_low_balance"
    );
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
    // user_seat clears both the cap block and the AWU warning.
    expect(mockClearUserCapBlocked).toHaveBeenCalledWith("ws_test", "u_test");
    expect(mockClearUserAwuWarned).toHaveBeenCalledWith("ws_test", "u_test");
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
    const membership = makeMembership("on_pool");
    await transitionUserCreditState(
      membership,
      { type: "per_user_cap_reached" },
      baseCtx
    );
    const dbOrder = membership.updateCreditState.mock.invocationCallOrder[0];
    const cacheOrder =
      mockInvalidateCacheAfterCommit.mock.invocationCallOrder[0];
    expect(dbOrder).toBeLessThan(cacheOrder);
  });

  it("forwards the provided transaction to both the DB update and cache invalidator", async () => {
    const tx = { __mock: "transaction" } as unknown as Transaction;
    const membership = makeMembership("on_pool");
    await transitionUserCreditState(
      membership,
      { type: "per_user_cap_reached" },
      baseCtx,
      { transaction: tx }
    );
    expect(membership.updateCreditState).toHaveBeenCalledWith("capped", tx);
    expect(mockInvalidateCacheAfterCommit).toHaveBeenCalledWith(
      tx,
      expect.any(Function)
    );
  });

  it("passes undefined transaction when none is provided", async () => {
    const membership = makeMembership("on_pool");
    await transitionUserCreditState(
      membership,
      { type: "per_user_cap_reached" },
      baseCtx
    );
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "capped",
      undefined
    );
    expect(mockInvalidateCacheAfterCommit).toHaveBeenCalledWith(
      undefined,
      expect.any(Function)
    );
  });
});

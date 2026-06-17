import {
  FREE_SEAT_LIFETIME_AWU_CREDITS,
  PRO_SEAT_MONTHLY_AWU_CREDITS,
} from "@app/lib/metronome/constants";
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
    expect(mockSetUserCreditState).toHaveBeenCalledWith(
      "ws_test",
      "u_test",
      "on_pool"
    );
  });

  it("capped + per_user_cap_resolved with personal seat balance → user_seat", async () => {
    const membership = makeMembership("capped", "max");
    const result = await transitionUserCreditState(
      membership,
      { type: "per_user_cap_resolved" },
      {
        ...baseCtx,
        seatType: "max",
        liveBalance: {
          seatBalanceAwu: 40000,
          seatStartingBalanceAwu: 40000,
          perUserCapAwuCredits: null,
          consumedAwuCredits: null,
        },
      }
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

  it("capped + per_user_cap_resolved with personal balance (even low) → user_seat", async () => {
    const membership = makeMembership("capped", "max");
    const result = await transitionUserCreditState(
      membership,
      { type: "per_user_cap_resolved" },
      {
        ...baseCtx,
        seatType: "max",
        liveBalance: {
          seatBalanceAwu: 5000,
          seatStartingBalanceAwu: 40000,
          perUserCapAwuCredits: null,
          consumedAwuCredits: null,
        },
      }
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

  it("capped + per_user_cap_resolved with an exhausted seat and pool room → on_pool", async () => {
    const membership = makeMembership("capped", "max");
    const result = await transitionUserCreditState(
      membership,
      { type: "per_user_cap_resolved" },
      {
        ...baseCtx,
        seatType: "max",
        liveBalance: {
          seatBalanceAwu: 0,
          seatStartingBalanceAwu: 40000,
          perUserCapAwuCredits: 50000,
          consumedAwuCredits: 10000,
        },
      }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("on_pool");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "on_pool",
      undefined
    );
  });

  it("capped + per_user_cap_resolved without a live balance → on_pool (default)", async () => {
    const membership = makeMembership("capped", "max");
    const result = await transitionUserCreditState(
      membership,
      { type: "per_user_cap_resolved" },
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
      { type: "seat_balance_exhausted" },
      { ...baseCtx, seatType: "free", poolLimitAwuCredits: 0 }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("capped");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "capped",
      undefined
    );
    expect(mockSetUserCreditState).toHaveBeenCalledWith(
      "ws_test",
      "u_test",
      "capped"
    );
  });

  it("legacy user_seat_low_balance (alias → user_seat) + free seat → capped", async () => {
    const membership = makeMembership("user_seat_low_balance", "free");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_exhausted" },
      { ...baseCtx, seatType: "free", poolLimitAwuCredits: 0 }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("capped");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "capped",
      undefined
    );
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

  it("user_seat + pro seat + pool limit null (unlimited) → on_pool", async () => {
    const membership = makeMembership("user_seat", "pro");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_exhausted" },
      { ...baseCtx, seatType: "pro", poolLimitAwuCredits: null }
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
      { type: "seat_balance_exhausted" },
      { ...baseCtx, seatType: "pro", poolLimitAwuCredits: 0 }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("capped");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "capped",
      undefined
    );
    expect(mockSetUserCreditState).toHaveBeenCalledWith(
      "ws_test",
      "u_test",
      "capped"
    );
  });

  it("legacy user_seat_low_balance (alias → user_seat) + max seat + pool limit null → on_pool", async () => {
    const membership = makeMembership("user_seat_low_balance", "max");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_exhausted" },
      { ...baseCtx, seatType: "max", poolLimitAwuCredits: null }
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

// ---------------------------------------------------------------------------
// remainingCapCreditsPercentage guards
// ---------------------------------------------------------------------------

describe("UserCreditStateMachine — seat_balance_exhausted with remainingCapCreditsPercentage", () => {
  // Guard 2: cap fully exhausted (0 %) beats pool room → capped.
  it("user_seat + pro + 0% cap remaining + pool limit > 0 → capped", async () => {
    const membership = makeMembership("user_seat", "pro");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_exhausted" },
      {
        ...baseCtx,
        seatType: "pro",
        remainingCapCreditsPercentage: 0,
        poolLimitAwuCredits: 5000,
      }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("capped");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "capped",
      undefined
    );
  });

  // Guard 1: same as above from legacy user_seat_low_balance (alias → user_seat).
  it("legacy user_seat_low_balance + pro + 0% cap remaining + pool limit > 0 → capped", async () => {
    const membership = makeMembership("user_seat_low_balance", "pro");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_exhausted" },
      {
        ...baseCtx,
        seatType: "pro",
        remainingCapCreditsPercentage: 0,
        poolLimitAwuCredits: 5000,
      }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("capped");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "capped",
      undefined
    );
  });

  // Guard 2: pool budget left → on_pool. nearLimit flag is set by the spend
  // threshold webhook separately; the state machine no longer tracks it.
  it("user_seat + pro + 10% cap remaining → on_pool (near-limit via flag, not state)", async () => {
    const membership = makeMembership("user_seat", "pro");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_exhausted" },
      {
        ...baseCtx,
        seatType: "pro",
        remainingCapCreditsPercentage: 0.1,
        poolLimitAwuCredits: null,
      }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("on_pool");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "on_pool",
      undefined
    );
  });

  it("user_seat + pro + 19% cap remaining → on_pool", async () => {
    const membership = makeMembership("user_seat", "pro");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_exhausted" },
      {
        ...baseCtx,
        seatType: "pro",
        remainingCapCreditsPercentage: 0.19,
        poolLimitAwuCredits: null,
      }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("on_pool");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "on_pool",
      undefined
    );
  });

  it("user_seat + pro + exactly 20% cap remaining → on_pool", async () => {
    const membership = makeMembership("user_seat", "pro");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_exhausted" },
      {
        ...baseCtx,
        seatType: "pro",
        remainingCapCreditsPercentage: 0.2,
        poolLimitAwuCredits: null,
      }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("on_pool");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "on_pool",
      undefined
    );
  });

  it("user_seat + pro + 50% cap remaining → on_pool", async () => {
    const membership = makeMembership("user_seat", "pro");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_exhausted" },
      {
        ...baseCtx,
        seatType: "pro",
        remainingCapCreditsPercentage: 0.5,
        poolLimitAwuCredits: null,
      }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("on_pool");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "on_pool",
      undefined
    );
  });

  it("user_seat + pro + null cap percentage → on_pool (no cap configured)", async () => {
    const membership = makeMembership("user_seat", "pro");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_exhausted" },
      {
        ...baseCtx,
        seatType: "pro",
        remainingCapCreditsPercentage: null,
        poolLimitAwuCredits: null,
      }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("on_pool");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "on_pool",
      undefined
    );
  });

  // Pool limit 0 (free has no pool) → capped, regardless of cap percentage.
  it("user_seat + poolLimit 0 + 50% cap remaining → capped (no pool budget)", async () => {
    const membership = makeMembership("user_seat", "free");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_exhausted" },
      {
        ...baseCtx,
        seatType: "free",
        remainingCapCreditsPercentage: 0.5,
        poolLimitAwuCredits: 0,
      }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("capped");
    }
  });
});

// ---------------------------------------------------------------------------
// Seat balance replenished
// ---------------------------------------------------------------------------

describe("UserCreditStateMachine — seat_balance_resolved", () => {
  it("free capped → user_seat when the credit is fully replenished", async () => {
    const membership = makeMembership("capped", "free");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_resolved" },
      {
        ...baseCtx,
        seatType: "free",
        liveBalance: {
          seatBalanceAwu: FREE_SEAT_LIFETIME_AWU_CREDITS,
          seatStartingBalanceAwu: FREE_SEAT_LIFETIME_AWU_CREDITS,
          perUserCapAwuCredits: null,
          consumedAwuCredits: null,
        },
      }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("user_seat");
    }
  });

  it("free capped → user_seat when only a low balance is left (near-limit via flag)", async () => {
    const membership = makeMembership("capped", "free");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_resolved" },
      {
        ...baseCtx,
        seatType: "free",
        liveBalance: {
          seatBalanceAwu: 40,
          seatStartingBalanceAwu: FREE_SEAT_LIFETIME_AWU_CREDITS,
          perUserCapAwuCredits: null,
          consumedAwuCredits: null,
        },
      }
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
      {
        ...baseCtx,
        seatType: "pro",
        liveBalance: {
          seatBalanceAwu: PRO_SEAT_MONTHLY_AWU_CREDITS,
          seatStartingBalanceAwu: PRO_SEAT_MONTHLY_AWU_CREDITS,
          perUserCapAwuCredits: null,
          consumedAwuCredits: null,
        },
      }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("user_seat");
    }
  });

  it("free capped → user_seat without a live balance (default)", async () => {
    const membership = makeMembership("capped", "free");
    const result = await transitionUserCreditState(
      membership,
      { type: "seat_balance_resolved" },
      { ...baseCtx, seatType: "free" }
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

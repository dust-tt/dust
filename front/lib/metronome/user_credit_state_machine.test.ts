import type { UserCreditContext } from "@app/lib/metronome/user_credit_state_machine";
import { transitionUserCreditState } from "@app/lib/metronome/user_credit_state_machine";
import type { MembershipResource } from "@app/lib/resources/membership_resource";
import type { UserCreditState } from "@app/types/memberships";
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
}));

vi.mock("@app/lib/metronome/user_block", () => ({
  setUserCapBlocked: mockSetUserCapBlocked,
  clearUserCapBlocked: mockClearUserCapBlocked,
  clearUserAwuWarned: mockClearUserAwuWarned,
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

function makeMembership(creditState: UserCreditState): MembershipDouble {
  return {
    creditState,
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
  it("normal + per_user_cap_reached → capped (blocks user)", async () => {
    const membership = makeMembership("normal");
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
  });

  it("capped + admin_raised_user_cap → normal (unblocks user)", async () => {
    const membership = makeMembership("capped");
    const result = await transitionUserCreditState(
      membership,
      { type: "admin_raised_user_cap" },
      baseCtx
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("normal");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "normal",
      undefined
    );
    expect(mockClearUserCapBlocked).toHaveBeenCalledWith("ws_test", "u_test");
    expect(mockSetUserCapBlocked).not.toHaveBeenCalled();
  });

  it("capped + per_user_cap_resolved → normal (unblocks user)", async () => {
    const membership = makeMembership("capped");
    const result = await transitionUserCreditState(
      membership,
      { type: "per_user_cap_resolved" },
      baseCtx
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("normal");
    }
    expect(membership.updateCreditState).toHaveBeenCalledWith(
      "normal",
      undefined
    );
    expect(mockClearUserCapBlocked).toHaveBeenCalledWith("ws_test", "u_test");
    expect(mockSetUserCapBlocked).not.toHaveBeenCalled();
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
  });

  it("normal + per_user_cap_resolved is idempotent and re-applies the unblock cache", async () => {
    const membership = makeMembership("normal");
    const result = await transitionUserCreditState(
      membership,
      { type: "per_user_cap_resolved" },
      baseCtx
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("normal");
    }
    expect(membership.updateCreditState).not.toHaveBeenCalled();
    expect(mockClearUserCapBlocked).toHaveBeenCalledWith("ws_test", "u_test");
    expect(mockSetUserCapBlocked).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Side-effect ordering & transactions
// ---------------------------------------------------------------------------

describe("UserCreditStateMachine — side effects and transactions", () => {
  it("invokes the DB update before registering the Redis side-effect", async () => {
    const membership = makeMembership("normal");
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
    const membership = makeMembership("normal");
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
    const membership = makeMembership("normal");
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

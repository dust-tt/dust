import type {
  WorkspaceCreditContext,
  WorkspaceCreditEvent,
} from "@app/lib/metronome/workspace_credit_state_machine";
import { transitionWorkspaceCreditState } from "@app/lib/metronome/workspace_credit_state_machine";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { WorkspacePoolCreditState } from "@app/types/credits";
import type { Transaction } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockSetWorkspacePoolDepleted,
  mockClearWorkspacePoolDepleted,
  mockSetWorkspaceCreditPoolStatus,
  mockInvalidateCacheAfterCommit,
} = vi.hoisted(() => ({
  mockSetWorkspacePoolDepleted: vi.fn(),
  mockClearWorkspacePoolDepleted: vi.fn(),
  mockSetWorkspaceCreditPoolStatus: vi.fn(),
  mockInvalidateCacheAfterCommit: vi.fn(
    (_tx: Transaction | undefined, fn: () => Promise<void>) => {
      void fn();
    }
  ),
}));

vi.mock("@app/lib/metronome/user_block", () => ({
  setWorkspacePoolDepleted: mockSetWorkspacePoolDepleted,
  clearWorkspacePoolDepleted: mockClearWorkspacePoolDepleted,
  setWorkspaceCreditPoolStatus: mockSetWorkspaceCreditPoolStatus,
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

type WorkspaceDouble = WorkspaceResource & {
  updatePoolCreditState: ReturnType<typeof vi.fn>;
};

function makeWorkspace(
  poolCreditState: WorkspacePoolCreditState
): WorkspaceDouble {
  return {
    poolCreditState,
    sId: "ws_test",
    updatePoolCreditState: vi.fn().mockResolvedValue(undefined),
  } as unknown as WorkspaceDouble;
}

const baseCtxNoPayg: WorkspaceCreditContext = {
  workspaceId: "ws_test",
  paygEnabled: false,
};

const baseCtxPayg: WorkspaceCreditContext = {
  workspaceId: "ws_test",
  paygEnabled: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Happy-path transitions
// ---------------------------------------------------------------------------

describe("WorkspaceCreditStateMachine — transitions", () => {
  it("active + pool_exhausted (paygEnabled) → overage (clears depleted cache)", async () => {
    const workspace = makeWorkspace("active");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "pool_exhausted" },
      baseCtxPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("overage");
    }
    expect(workspace.updatePoolCreditState).toHaveBeenCalledWith(
      "overage",
      undefined
    );
    expect(mockClearWorkspacePoolDepleted).toHaveBeenCalledWith("ws_test");
    expect(mockSetWorkspacePoolDepleted).not.toHaveBeenCalled();
  });

  it("active + pool_exhausted (no PAYG) → depleted (marks pool depleted)", async () => {
    const workspace = makeWorkspace("active");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "pool_exhausted" },
      baseCtxNoPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("depleted");
    }
    expect(workspace.updatePoolCreditState).toHaveBeenCalledWith(
      "depleted",
      undefined
    );
    expect(mockSetWorkspacePoolDepleted).toHaveBeenCalledWith("ws_test");
  });

  it("overage + payg_cap_reached → depleted (marks pool depleted)", async () => {
    const workspace = makeWorkspace("overage");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "payg_cap_reached" },
      baseCtxPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("depleted");
    }
    expect(mockSetWorkspacePoolDepleted).toHaveBeenCalledWith("ws_test");
  });

  it("overage + credits_added (high balance) → active (clears depleted cache)", async () => {
    const workspace = makeWorkspace("overage");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "credits_added", balanceAwu: 500 },
      baseCtxPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("active");
    }
    expect(mockClearWorkspacePoolDepleted).toHaveBeenCalledWith("ws_test");
  });

  it("depleted + credits_added (high balance) → active (clears depleted flag)", async () => {
    const workspace = makeWorkspace("depleted");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "credits_added", balanceAwu: 500 },
      baseCtxNoPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("active");
    }
    expect(mockClearWorkspacePoolDepleted).toHaveBeenCalledWith("ws_test");
  });

  it("overage + pool_exhausted is idempotent and keeps the depleted cache cleared", async () => {
    const workspace = makeWorkspace("overage");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "pool_exhausted" },
      baseCtxPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("overage");
    }
    expect(workspace.updatePoolCreditState).not.toHaveBeenCalled();
    expect(mockClearWorkspacePoolDepleted).toHaveBeenCalledWith("ws_test");
    expect(mockSetWorkspacePoolDepleted).not.toHaveBeenCalled();
  });

  it("depleted + payg_cap_reached is idempotent and re-applies the depleted cache", async () => {
    const workspace = makeWorkspace("depleted");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "payg_cap_reached" },
      baseCtxPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("depleted");
    }
    expect(workspace.updatePoolCreditState).not.toHaveBeenCalled();
    expect(mockSetWorkspacePoolDepleted).toHaveBeenCalledWith("ws_test");
  });

  it("overage + payg_disabled → depleted (marks pool depleted)", async () => {
    const workspace = makeWorkspace("overage");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "payg_disabled" },
      baseCtxNoPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("depleted");
    }
    expect(workspace.updatePoolCreditState).toHaveBeenCalledWith(
      "depleted",
      undefined
    );
    expect(mockSetWorkspacePoolDepleted).toHaveBeenCalledWith("ws_test");
  });

  it("depleted + payg_enabled → overage (clears depleted cache)", async () => {
    const workspace = makeWorkspace("depleted");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "payg_enabled" },
      baseCtxPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("overage");
    }
    expect(workspace.updatePoolCreditState).toHaveBeenCalledWith(
      "overage",
      undefined
    );
    expect(mockClearWorkspacePoolDepleted).toHaveBeenCalledWith("ws_test");
    expect(mockSetWorkspacePoolDepleted).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "active + payg_enabled → active (no-op)",
      from: "active" as const,
      event: { type: "payg_enabled" } as WorkspaceCreditEvent,
    },
    {
      label: "active + payg_disabled → active (no-op)",
      from: "active" as const,
      event: { type: "payg_disabled" } as WorkspaceCreditEvent,
    },
    {
      label: "overage + payg_enabled → overage (no-op)",
      from: "overage" as const,
      event: { type: "payg_enabled" } as WorkspaceCreditEvent,
    },
    {
      label: "depleted + payg_disabled → depleted (no-op)",
      from: "depleted" as const,
      event: { type: "payg_disabled" } as WorkspaceCreditEvent,
    },
  ])("$label", async ({ from, event }) => {
    const workspace = makeWorkspace(from);
    const result = await transitionWorkspaceCreditState(
      workspace,
      event,
      baseCtxNoPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe(from);
    }
    expect(workspace.updatePoolCreditState).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Low balance transitions
// ---------------------------------------------------------------------------

describe("WorkspaceCreditStateMachine — low balance transitions", () => {
  it("active + low_balance (bal=50, no PAYG) → active_low_balance", async () => {
    const workspace = makeWorkspace("active");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "low_balance", balanceAwu: 50 },
      baseCtxNoPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("active_low_balance");
    }
    expect(workspace.updatePoolCreditState).toHaveBeenCalledWith(
      "active_low_balance",
      undefined
    );
    expect(mockClearWorkspacePoolDepleted).toHaveBeenCalledWith("ws_test");
    expect(mockSetWorkspaceCreditPoolStatus).toHaveBeenCalledWith(
      "ws_test",
      "active_low_balance"
    );
  });

  it("active + low_balance (PAYG enabled) → active (no-op)", async () => {
    const workspace = makeWorkspace("active");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "low_balance", balanceAwu: 50 },
      baseCtxPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("active");
    }
    expect(workspace.updatePoolCreditState).not.toHaveBeenCalled();
  });

  it("active + low_balance (bal=5, no PAYG) → active_critical_balance", async () => {
    const workspace = makeWorkspace("active");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "low_balance", balanceAwu: 5 },
      baseCtxNoPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("active_critical_balance");
    }
    expect(workspace.updatePoolCreditState).toHaveBeenCalledWith(
      "active_critical_balance",
      undefined
    );
    expect(mockSetWorkspaceCreditPoolStatus).toHaveBeenCalledWith(
      "ws_test",
      "active_critical_balance"
    );
  });

  it("active_low_balance + low_balance (bal=5, no PAYG) → active_critical_balance", async () => {
    const workspace = makeWorkspace("active_low_balance");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "low_balance", balanceAwu: 5 },
      baseCtxNoPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("active_critical_balance");
    }
    expect(workspace.updatePoolCreditState).toHaveBeenCalledWith(
      "active_critical_balance",
      undefined
    );
  });

  it("active_low_balance + low_balance (PAYG enabled) → active_low_balance (no-op)", async () => {
    const workspace = makeWorkspace("active_low_balance");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "low_balance", balanceAwu: 5 },
      baseCtxPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("active_low_balance");
    }
    expect(workspace.updatePoolCreditState).not.toHaveBeenCalled();
  });

  it("active_low_balance + low_balance (bal=50) is idempotent", async () => {
    const workspace = makeWorkspace("active_low_balance");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "low_balance", balanceAwu: 50 },
      baseCtxNoPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("active_low_balance");
    }
    expect(workspace.updatePoolCreditState).not.toHaveBeenCalled();
  });

  it("active_critical_balance + low_balance is idempotent", async () => {
    const workspace = makeWorkspace("active_critical_balance");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "low_balance", balanceAwu: 5 },
      baseCtxNoPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("active_critical_balance");
    }
    expect(workspace.updatePoolCreditState).not.toHaveBeenCalled();
  });

  it("active_low_balance + pool_exhausted (no PAYG) → depleted", async () => {
    const workspace = makeWorkspace("active_low_balance");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "pool_exhausted" },
      baseCtxNoPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("depleted");
    }
    expect(mockSetWorkspacePoolDepleted).toHaveBeenCalledWith("ws_test");
  });

  it("active_low_balance + pool_exhausted (PAYG) → overage", async () => {
    const workspace = makeWorkspace("active_low_balance");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "pool_exhausted" },
      baseCtxPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("overage");
    }
    expect(mockClearWorkspacePoolDepleted).toHaveBeenCalledWith("ws_test");
  });

  it("active_critical_balance + pool_exhausted (no PAYG) → depleted", async () => {
    const workspace = makeWorkspace("active_critical_balance");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "pool_exhausted" },
      baseCtxNoPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("depleted");
    }
    expect(mockSetWorkspacePoolDepleted).toHaveBeenCalledWith("ws_test");
  });

  it("active_critical_balance + pool_exhausted (PAYG) → overage", async () => {
    const workspace = makeWorkspace("active_critical_balance");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "pool_exhausted" },
      baseCtxPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("overage");
    }
    expect(mockClearWorkspacePoolDepleted).toHaveBeenCalledWith("ws_test");
  });

  it("active_low_balance + credits_added (high balance) → active", async () => {
    const workspace = makeWorkspace("active_low_balance");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "credits_added", balanceAwu: 500 },
      baseCtxNoPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("active");
    }
    expect(workspace.updatePoolCreditState).toHaveBeenCalledWith(
      "active",
      undefined
    );
  });

  it("active_critical_balance + credits_added (high balance) → active", async () => {
    const workspace = makeWorkspace("active_critical_balance");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "credits_added", balanceAwu: 500 },
      baseCtxNoPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("active");
    }
    expect(workspace.updatePoolCreditState).toHaveBeenCalledWith(
      "active",
      undefined
    );
  });
});

// ---------------------------------------------------------------------------
// Balance-based routing for credits_added
// ---------------------------------------------------------------------------

describe("WorkspaceCreditStateMachine — credits_added balance routing", () => {
  it("depleted + credits_added (balance=50) → active_low_balance", async () => {
    const workspace = makeWorkspace("depleted");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "credits_added", balanceAwu: 50 },
      baseCtxNoPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("active_low_balance");
    }
    expect(workspace.updatePoolCreditState).toHaveBeenCalledWith(
      "active_low_balance",
      undefined
    );
  });

  it("depleted + credits_added (balance=5) → active_critical_balance", async () => {
    const workspace = makeWorkspace("depleted");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "credits_added", balanceAwu: 5 },
      baseCtxNoPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("active_critical_balance");
    }
    expect(workspace.updatePoolCreditState).toHaveBeenCalledWith(
      "active_critical_balance",
      undefined
    );
  });

  it("depleted + credits_added (balance=100) → active_low_balance (boundary)", async () => {
    const workspace = makeWorkspace("depleted");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "credits_added", balanceAwu: 100 },
      baseCtxNoPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("active_low_balance");
    }
  });

  it("depleted + credits_added (balance=10) → active_critical_balance (boundary)", async () => {
    const workspace = makeWorkspace("depleted");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "credits_added", balanceAwu: 10 },
      baseCtxNoPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("active_critical_balance");
    }
  });

  it("depleted + credits_added (balance=101) → active", async () => {
    const workspace = makeWorkspace("depleted");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "credits_added", balanceAwu: 101 },
      baseCtxNoPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("active");
    }
  });

  it("overage + credits_added (balance=50) → active_low_balance", async () => {
    const workspace = makeWorkspace("overage");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "credits_added", balanceAwu: 50 },
      baseCtxPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("active_low_balance");
    }
  });

  it("active_critical_balance + credits_added (balance=50) → active_low_balance", async () => {
    const workspace = makeWorkspace("active_critical_balance");
    const result = await transitionWorkspaceCreditState(
      workspace,
      { type: "credits_added", balanceAwu: 50 },
      baseCtxNoPayg
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("active_low_balance");
    }
  });
});

// ---------------------------------------------------------------------------
// Illegal transitions
// ---------------------------------------------------------------------------

describe("WorkspaceCreditStateMachine — illegal transitions", () => {
  const cases: Array<{
    label: string;
    from: WorkspacePoolCreditState;
    event: WorkspaceCreditEvent;
    ctx: WorkspaceCreditContext;
  }> = [
    {
      label: "active + payg_cap_reached",
      from: "active",
      event: { type: "payg_cap_reached" },
      ctx: baseCtxPayg,
    },
    {
      label: "overage + pool_exhausted without PAYG",
      from: "overage",
      event: { type: "pool_exhausted" },
      ctx: baseCtxNoPayg,
    },
    {
      label: "depleted + pool_exhausted with PAYG",
      from: "depleted",
      event: { type: "pool_exhausted" },
      ctx: baseCtxPayg,
    },
  ];

  it.each(cases)("$label returns Err and applies no side effects", async ({
    from,
    event,
    ctx,
  }) => {
    const workspace = makeWorkspace(from);
    const result = await transitionWorkspaceCreditState(workspace, event, ctx);
    expect(result.isErr()).toBe(true);
    expect(workspace.updatePoolCreditState).not.toHaveBeenCalled();
    expect(mockInvalidateCacheAfterCommit).not.toHaveBeenCalled();
    expect(mockSetWorkspacePoolDepleted).not.toHaveBeenCalled();
    expect(mockClearWorkspacePoolDepleted).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Side-effect ordering & transactions
// ---------------------------------------------------------------------------

describe("WorkspaceCreditStateMachine — side effects and transactions", () => {
  it("invokes the DB update before registering the Redis side-effect", async () => {
    const workspace = makeWorkspace("active");
    await transitionWorkspaceCreditState(
      workspace,
      { type: "pool_exhausted" },
      baseCtxNoPayg
    );
    const dbOrder = workspace.updatePoolCreditState.mock.invocationCallOrder[0];
    const cacheOrder =
      mockInvalidateCacheAfterCommit.mock.invocationCallOrder[0];
    expect(dbOrder).toBeLessThan(cacheOrder);
  });

  it("forwards the provided transaction to both the DB update and cache invalidator", async () => {
    const tx = { __mock: "transaction" } as unknown as Transaction;
    const workspace = makeWorkspace("active");
    await transitionWorkspaceCreditState(
      workspace,
      { type: "pool_exhausted" },
      baseCtxNoPayg,
      { transaction: tx }
    );
    expect(workspace.updatePoolCreditState).toHaveBeenCalledWith(
      "depleted",
      tx
    );
    expect(mockInvalidateCacheAfterCommit).toHaveBeenCalledWith(
      tx,
      expect.any(Function)
    );
  });
});

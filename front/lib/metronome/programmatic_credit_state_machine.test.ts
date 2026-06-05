import {
  expectedProgrammaticCreditStateFromAlerts,
  transitionProgrammaticCreditState,
} from "@app/lib/metronome/programmatic_credit_state_machine";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { WorkspaceProgrammaticCreditState } from "@app/types/credits";
import type { Transaction } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockSetWorkspaceProgrammaticDepleted,
  mockClearWorkspaceProgrammaticDepleted,
  mockSetWorkspaceProgrammaticCreditStatus,
  mockInvalidateCacheAfterCommit,
} = vi.hoisted(() => ({
  mockSetWorkspaceProgrammaticDepleted: vi.fn(),
  mockClearWorkspaceProgrammaticDepleted: vi.fn(),
  mockSetWorkspaceProgrammaticCreditStatus: vi.fn(),
  mockInvalidateCacheAfterCommit: vi.fn(
    (_tx: Transaction | undefined, fn: () => Promise<void>) => {
      void fn();
    }
  ),
}));

vi.mock("@app/lib/metronome/user_block", () => ({
  setWorkspaceProgrammaticDepleted: mockSetWorkspaceProgrammaticDepleted,
  clearWorkspaceProgrammaticDepleted: mockClearWorkspaceProgrammaticDepleted,
  setWorkspaceProgrammaticCreditStatus:
    mockSetWorkspaceProgrammaticCreditStatus,
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
  updateProgrammaticCreditState: ReturnType<typeof vi.fn>;
};

function makeWorkspace(
  programmaticCreditState: WorkspaceProgrammaticCreditState
): WorkspaceDouble {
  return {
    programmaticCreditState,
    sId: "ws_test",
    updateProgrammaticCreditState: vi.fn().mockResolvedValue(undefined),
  } as unknown as WorkspaceDouble;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Low balance transitions
// ---------------------------------------------------------------------------

describe("ProgrammaticCreditStateMachine — low balance", () => {
  it("active + low_balance (remaining=100) → active_low_balance", async () => {
    const workspace = makeWorkspace("active");
    const result = await transitionProgrammaticCreditState(workspace, {
      type: "programmatic_low_balance",
      remainingCredits: 100,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("active_low_balance");
    }
    expect(workspace.updateProgrammaticCreditState).toHaveBeenCalledWith(
      "active_low_balance",
      undefined
    );
    expect(mockClearWorkspaceProgrammaticDepleted).toHaveBeenCalledWith(
      "ws_test"
    );
  });

  it("active + low_balance (remaining=10) → active_critical_balance", async () => {
    const workspace = makeWorkspace("active");
    const result = await transitionProgrammaticCreditState(workspace, {
      type: "programmatic_low_balance",
      remainingCredits: 10,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("active_critical_balance");
    }
    expect(workspace.updateProgrammaticCreditState).toHaveBeenCalledWith(
      "active_critical_balance",
      undefined
    );
  });

  it("active_low_balance + low_balance (remaining=100) is idempotent", async () => {
    const workspace = makeWorkspace("active_low_balance");
    const result = await transitionProgrammaticCreditState(workspace, {
      type: "programmatic_low_balance",
      remainingCredits: 100,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("active_low_balance");
    }
    expect(workspace.updateProgrammaticCreditState).not.toHaveBeenCalled();
  });

  it("active_low_balance + low_balance (remaining=10) → active_critical_balance", async () => {
    const workspace = makeWorkspace("active_low_balance");
    const result = await transitionProgrammaticCreditState(workspace, {
      type: "programmatic_low_balance",
      remainingCredits: 10,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("active_critical_balance");
    }
    expect(workspace.updateProgrammaticCreditState).toHaveBeenCalledWith(
      "active_critical_balance",
      undefined
    );
  });

  it("active_critical_balance + low_balance stays critical", async () => {
    const workspace = makeWorkspace("active_critical_balance");
    const result = await transitionProgrammaticCreditState(workspace, {
      type: "programmatic_low_balance",
      remainingCredits: 10,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("active_critical_balance");
    }
    expect(workspace.updateProgrammaticCreditState).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Cap reached transitions
// ---------------------------------------------------------------------------

describe("ProgrammaticCreditStateMachine — cap reached", () => {
  it.each([
    "active" as const,
    "active_low_balance" as const,
    "active_critical_balance" as const,
  ])("%s + cap_reached → depleted", async (from) => {
    const workspace = makeWorkspace(from);
    const result = await transitionProgrammaticCreditState(workspace, {
      type: "programmatic_cap_reached",
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("depleted");
    }
    expect(mockSetWorkspaceProgrammaticDepleted).toHaveBeenCalledWith(
      "ws_test"
    );
  });

  it("depleted + cap_reached is idempotent", async () => {
    const workspace = makeWorkspace("depleted");
    const result = await transitionProgrammaticCreditState(workspace, {
      type: "programmatic_cap_reached",
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("depleted");
    }
    expect(workspace.updateProgrammaticCreditState).not.toHaveBeenCalled();
    expect(mockSetWorkspaceProgrammaticDepleted).toHaveBeenCalledWith(
      "ws_test"
    );
  });
});

// ---------------------------------------------------------------------------
// Cap reset transitions
// ---------------------------------------------------------------------------

describe("ProgrammaticCreditStateMachine — cap reset", () => {
  it.each([
    "active" as const,
    "active_low_balance" as const,
    "active_critical_balance" as const,
    "depleted" as const,
  ])("%s + cap_reset → active", async (from) => {
    const workspace = makeWorkspace(from);
    const result = await transitionProgrammaticCreditState(workspace, {
      type: "programmatic_cap_reset",
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("active");
    }
    if (from !== "active") {
      expect(workspace.updateProgrammaticCreditState).toHaveBeenCalledWith(
        "active",
        undefined
      );
    }
    expect(mockClearWorkspaceProgrammaticDepleted).toHaveBeenCalledWith(
      "ws_test"
    );
  });
});

// ---------------------------------------------------------------------------
// Side-effect ordering
// ---------------------------------------------------------------------------

describe("ProgrammaticCreditStateMachine — side effects", () => {
  it("invokes DB update before registering the Redis side-effect", async () => {
    const workspace = makeWorkspace("active");
    await transitionProgrammaticCreditState(workspace, {
      type: "programmatic_cap_reached",
    });
    const dbOrder =
      workspace.updateProgrammaticCreditState.mock.invocationCallOrder[0];
    const cacheOrder =
      mockInvalidateCacheAfterCommit.mock.invocationCallOrder[0];
    expect(dbOrder).toBeLessThan(cacheOrder);
  });

  it("forwards the provided transaction", async () => {
    const tx = { __mock: "transaction" } as unknown as Transaction;
    const workspace = makeWorkspace("active");
    await transitionProgrammaticCreditState(
      workspace,
      { type: "programmatic_low_balance", remainingCredits: 100 },
      { transaction: tx }
    );
    expect(workspace.updateProgrammaticCreditState).toHaveBeenCalledWith(
      "active_low_balance",
      tx
    );
    expect(mockInvalidateCacheAfterCommit).toHaveBeenCalledWith(
      tx,
      expect.any(Function)
    );
  });
});

describe("expectedProgrammaticCreditStateFromAlerts", () => {
  it("returns depleted when the cap alert is in alarm (regardless of others)", () => {
    expect(
      expectedProgrammaticCreditStateFromAlerts({
        capInAlarm: true,
        criticalInAlarm: true,
        lowInAlarm: true,
      })
    ).toBe("depleted");
  });

  it("returns active_critical_balance when only critical is in alarm", () => {
    expect(
      expectedProgrammaticCreditStateFromAlerts({
        capInAlarm: false,
        criticalInAlarm: true,
        lowInAlarm: true,
      })
    ).toBe("active_critical_balance");
  });

  it("returns active_low_balance when only low is in alarm", () => {
    expect(
      expectedProgrammaticCreditStateFromAlerts({
        capInAlarm: false,
        criticalInAlarm: false,
        lowInAlarm: true,
      })
    ).toBe("active_low_balance");
  });

  it("returns active when no alert is in alarm", () => {
    expect(
      expectedProgrammaticCreditStateFromAlerts({
        capInAlarm: false,
        criticalInAlarm: false,
        lowInAlarm: false,
      })
    ).toBe("active");
  });
});

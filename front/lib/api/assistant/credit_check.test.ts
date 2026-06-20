import { checkPoolCreditGate } from "@app/lib/api/assistant/credit_check";
import type { Authenticator } from "@app/lib/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCachedPoolCredits,
  mockGetWorkspaceCreditPoolStatus,
  mockComputeAgentMessageCredits,
  mockListByAgentMessageIds,
  mockListByDustRunIds,
  mockListRunUsagesForRuns,
} = vi.hoisted(() => ({
  mockGetCachedPoolCredits: vi.fn(),
  mockGetWorkspaceCreditPoolStatus: vi.fn(),
  mockComputeAgentMessageCredits: vi.fn(),
  mockListByAgentMessageIds: vi.fn(),
  mockListByDustRunIds: vi.fn(),
  mockListRunUsagesForRuns: vi.fn(),
}));

vi.mock("@app/lib/metronome/credit_balance", () => ({
  getCachedPoolCredits: mockGetCachedPoolCredits,
}));

vi.mock("@app/lib/metronome/user_block", () => ({
  getWorkspaceCreditPoolStatus: mockGetWorkspaceCreditPoolStatus,
}));

vi.mock("@app/lib/api/assistant/credit_cost", () => ({
  computeAgentMessageCredits: mockComputeAgentMessageCredits,
}));

vi.mock("@app/lib/resources/agent_mcp_action_resource", () => ({
  AgentMCPActionResource: {
    listByAgentMessageIds: mockListByAgentMessageIds,
  },
}));

vi.mock("@app/lib/resources/run_resource", () => ({
  RunResource: {
    listByDustRunIds: mockListByDustRunIds,
    listRunUsagesForRuns: mockListRunUsagesForRuns,
  },
}));

vi.mock("@app/types/plan", () => ({
  isCreditPricedPlan: (plan: { code: string }) =>
    plan.code.startsWith("ENT_NEW"),
}));

vi.mock("@app/logger/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Minimal stand-in for the Authenticator class exposing only the members the gate reads. A class
// instance can't be constructed structurally, so a single `as unknown as` is the standard test-mock
// escape here (see the same pattern across the suite); the cast surface is kept to this one spot.
function makeAuth({
  workspaceId = "ws_test",
  metronomeCustomerId = "metro_123",
  isCreditPriced = true,
}: {
  workspaceId?: string;
  metronomeCustomerId?: string | null;
  isCreditPriced?: boolean;
} = {}): Authenticator {
  const plan = isCreditPriced
    ? { code: "ENT_NEW_CREDIT", limits: {} }
    : { code: "LEGACY_PRO", limits: {} };

  return {
    getNonNullableWorkspace: () => ({ sId: workspaceId, metronomeCustomerId }),
    subscription: () => ({ plan }),
  } as unknown as Authenticator;
}

function callGate(
  auth: Authenticator,
  {
    runIds = [],
    isFreeUsage = false,
  }: { runIds?: string[]; isFreeUsage?: boolean } = {}
) {
  return checkPoolCreditGate(auth, {
    agentMessageId: "msg_test",
    agentMessageModelId: 1,
    runIds,
    isFreeUsage,
  });
}

describe("checkPoolCreditGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWorkspaceCreditPoolStatus.mockResolvedValue("active");
    mockListByDustRunIds.mockResolvedValue([]);
    mockListRunUsagesForRuns.mockResolvedValue([]);
    mockListByAgentMessageIds.mockResolvedValue([]);
    mockComputeAgentMessageCredits.mockReturnValue(0);
  });

  it("returns shouldStop=false for non-credit-priced plans, reading nothing", async () => {
    const auth = makeAuth({ isCreditPriced: false });
    const result = await callGate(auth);
    expect(result).toEqual({ shouldStop: false, reason: null });
    expect(mockGetCachedPoolCredits).not.toHaveBeenCalled();
    expect(mockGetWorkspaceCreditPoolStatus).not.toHaveBeenCalled();
  });

  it("returns shouldStop=false when metronomeCustomerId is null, reading nothing", async () => {
    const auth = makeAuth({ metronomeCustomerId: null });
    const result = await callGate(auth);
    expect(result).toEqual({ shouldStop: false, reason: null });
    expect(mockGetCachedPoolCredits).not.toHaveBeenCalled();
  });

  it("reads the balance for this message and uses it", async () => {
    mockGetCachedPoolCredits.mockResolvedValue(100);

    const auth = makeAuth();
    const result = await callGate(auth);

    expect(mockGetCachedPoolCredits).toHaveBeenCalledWith(
      "ws_test",
      "metro_123"
    );
    expect(result.shouldStop).toBe(false);
  });

  it("does not stop when the workspace is in overage (PAYG), even if local spend exceeds the balance", async () => {
    mockGetWorkspaceCreditPoolStatus.mockResolvedValue("overage");
    mockGetCachedPoolCredits.mockResolvedValue(10);
    mockComputeAgentMessageCredits.mockReturnValue(1000);

    const auth = makeAuth();
    const result = await callGate(auth, { runIds: ["run1"] });

    expect(result.shouldStop).toBe(false);
    // Short-circuits before touching the balance or local spend at all.
    expect(mockGetCachedPoolCredits).not.toHaveBeenCalled();
    expect(mockListByAgentMessageIds).not.toHaveBeenCalled();
  });

  it("does not stop while local spend is below the balance", async () => {
    mockGetCachedPoolCredits.mockResolvedValue(100);
    mockComputeAgentMessageCredits.mockReturnValue(40);

    const auth = makeAuth();
    const result = await callGate(auth, { runIds: ["run1"] });

    expect(result.shouldStop).toBe(false);
  });

  it("stops with credits_exhausted once local spend reaches the balance", async () => {
    mockGetCachedPoolCredits.mockResolvedValue(100);
    mockComputeAgentMessageCredits.mockReturnValue(100);

    const auth = makeAuth();
    const result = await callGate(auth, { runIds: ["run1"] });

    expect(result).toEqual({ shouldStop: true, reason: "credits_exhausted" });
  });

  it("counts both LLM run usage and tool actions toward local spend", async () => {
    mockGetCachedPoolCredits.mockResolvedValue(100);
    mockListRunUsagesForRuns.mockResolvedValue([{ costMicroUsd: 1 }]);
    mockListByDustRunIds.mockResolvedValue([{ id: 1 }]);
    mockListByAgentMessageIds.mockResolvedValue([
      {
        metadata: { internalMCPServerName: "web_search" },
        status: "succeeded",
      },
    ]);

    const auth = makeAuth();
    await callGate(auth, { runIds: ["run1"] });

    // Tool actions are fetched for the message and passed (mapped) to the billing computation
    // alongside the LLM run usages — so the subtraction is the full cost, not LLM-only.
    expect(mockListByAgentMessageIds).toHaveBeenCalledWith(auth, [1]);
    expect(mockComputeAgentMessageCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        runUsages: [{ costMicroUsd: 1 }],
        actions: [{ internalMCPServerName: "web_search", status: "succeeded" }],
        isFreeUsage: false,
      })
    );
  });

  it("passes isFreeUsage through so free-origin messages cost 0 against the pool", async () => {
    mockGetCachedPoolCredits.mockResolvedValue(100);

    const auth = makeAuth();
    await callGate(auth, { runIds: ["run1"], isFreeUsage: true });

    expect(mockComputeAgentMessageCredits).toHaveBeenCalledWith(
      expect.objectContaining({ isFreeUsage: true })
    );
  });

  it("stops on a real zero balance even with zero local spend (distinct from an unreadable one)", async () => {
    mockGetCachedPoolCredits.mockResolvedValue(0);
    mockComputeAgentMessageCredits.mockReturnValue(0);

    const auth = makeAuth();
    const result = await callGate(auth);

    expect(result.shouldStop).toBe(true);
  });

  it("does NOT stop when the balance is unreadable (null), even with spend", async () => {
    mockGetCachedPoolCredits.mockResolvedValue(null);

    const auth = makeAuth();
    const result = await callGate(auth, { runIds: ["run1", "run2"] });

    expect(result.shouldStop).toBe(false);
    // Doesn't compute local spend when there's no balance to compare against.
    expect(mockListByAgentMessageIds).not.toHaveBeenCalled();
  });

  it("propagates a hard pool-status (Redis) read failure rather than silently not stopping", async () => {
    mockGetWorkspaceCreditPoolStatus.mockRejectedValue(
      new Error("redis unavailable")
    );

    const auth = makeAuth();
    await expect(callGate(auth)).rejects.toThrow("redis unavailable");
  });

  it("propagates a hard balance (Redis) read failure", async () => {
    mockGetCachedPoolCredits.mockRejectedValue(new Error("redis unavailable"));

    const auth = makeAuth();
    await expect(callGate(auth, { runIds: ["run1"] })).rejects.toThrow(
      "redis unavailable"
    );
  });

  it("propagates a local-spend (Postgres) query failure", async () => {
    mockGetCachedPoolCredits.mockResolvedValue(100);
    mockListByAgentMessageIds.mockRejectedValue(new Error("db down"));

    const auth = makeAuth();
    await expect(callGate(auth, { runIds: ["run1"] })).rejects.toThrow(
      "db down"
    );
  });

  it("skips the LLM run-usage query when there are no runs, but still accounts for tool usage", async () => {
    mockGetCachedPoolCredits.mockResolvedValue(100);

    const auth = makeAuth();
    await callGate(auth, { runIds: [] });

    expect(mockListByDustRunIds).not.toHaveBeenCalled();
    // Tool actions are still fetched (a step can produce tool spend with no model run).
    expect(mockListByAgentMessageIds).toHaveBeenCalledWith(auth, [1]);
    expect(mockComputeAgentMessageCredits).toHaveBeenCalled();
  });
});

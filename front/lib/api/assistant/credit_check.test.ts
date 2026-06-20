import { checkPoolCreditGate } from "@app/lib/api/assistant/credit_check";
import type { Authenticator } from "@app/lib/auth";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCachedPoolCredits,
  mockGetWorkspaceCreditPoolStatus,
  mockIntelligenceAwuFromRunUsages,
  mockListByDustRunIds,
  mockListRunUsagesForRuns,
} = vi.hoisted(() => ({
  mockGetCachedPoolCredits: vi.fn(),
  mockGetWorkspaceCreditPoolStatus: vi.fn(),
  mockIntelligenceAwuFromRunUsages: vi.fn(),
  mockListByDustRunIds: vi.fn(),
  mockListRunUsagesForRuns: vi.fn(),
}));

vi.mock("@app/lib/metronome/credit_balance", () => ({
  getCachedPoolCredits: mockGetCachedPoolCredits,
}));

vi.mock("@app/lib/metronome/user_block", () => ({
  getWorkspaceCreditPoolStatus: mockGetWorkspaceCreditPoolStatus,
}));

vi.mock("@app/lib/metronome/events", () => ({
  intelligenceAwuFromRunUsages: mockIntelligenceAwuFromRunUsages,
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

function makeAuth({
  workspaceId = "ws_test",
  metronomeCustomerId = "metro_123",
  isCreditPriced = true,
}: {
  workspaceId?: string;
  metronomeCustomerId?: string | null;
  isCreditPriced?: boolean;
} = {}): Authenticator {
  const workspace: LightWorkspaceType = {
    sId: workspaceId,
    metronomeCustomerId,
  } as LightWorkspaceType;

  const plan = isCreditPriced
    ? { code: "ENT_NEW_CREDIT", limits: {} }
    : { code: "LEGACY_PRO", limits: {} };

  return {
    getNonNullableWorkspace: () => workspace,
    subscription: () => ({ plan }),
  } as unknown as Authenticator;
}

describe("checkPoolCreditGate", () => {
  const testMessageId = "msg_test";

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWorkspaceCreditPoolStatus.mockResolvedValue("active");
    mockListByDustRunIds.mockResolvedValue([]);
    mockListRunUsagesForRuns.mockResolvedValue([]);
  });

  it("returns shouldStop=false for non-credit-priced plans, reading nothing", async () => {
    const auth = makeAuth({ isCreditPriced: false });
    const result = await checkPoolCreditGate(auth, {
      agentMessageId: testMessageId,
      runIds: [],
    });
    expect(result).toEqual({ shouldStop: false, reason: null });
    expect(mockGetCachedPoolCredits).not.toHaveBeenCalled();
    expect(mockGetWorkspaceCreditPoolStatus).not.toHaveBeenCalled();
  });

  it("returns shouldStop=false when metronomeCustomerId is null, reading nothing", async () => {
    const auth = makeAuth({ metronomeCustomerId: null });
    const result = await checkPoolCreditGate(auth, {
      agentMessageId: testMessageId,
      runIds: [],
    });
    expect(result).toEqual({ shouldStop: false, reason: null });
    expect(mockGetCachedPoolCredits).not.toHaveBeenCalled();
  });

  it("reads the balance for this message and uses it", async () => {
    mockGetCachedPoolCredits.mockResolvedValue(100);
    mockIntelligenceAwuFromRunUsages.mockReturnValue(0);

    const auth = makeAuth();
    const result = await checkPoolCreditGate(auth, {
      agentMessageId: testMessageId,
      runIds: [],
    });

    expect(mockGetCachedPoolCredits).toHaveBeenCalledWith(
      "ws_test",
      "metro_123"
    );
    expect(result.shouldStop).toBe(false);
  });

  it("does not stop when the workspace is in overage (PAYG), even if local usage exceeds the balance", async () => {
    mockGetWorkspaceCreditPoolStatus.mockResolvedValue("overage");
    mockGetCachedPoolCredits.mockResolvedValue(10);
    mockIntelligenceAwuFromRunUsages.mockReturnValue(1000);

    const auth = makeAuth();
    const result = await checkPoolCreditGate(auth, {
      agentMessageId: testMessageId,
      runIds: ["run1"],
    });

    expect(result.shouldStop).toBe(false);
    expect(mockGetCachedPoolCredits).not.toHaveBeenCalled();
    expect(mockListByDustRunIds).not.toHaveBeenCalled();
  });

  it("does not stop while local usage is below the balance", async () => {
    mockGetCachedPoolCredits.mockResolvedValue(100);
    mockIntelligenceAwuFromRunUsages.mockReturnValue(40);

    const auth = makeAuth();
    const result = await checkPoolCreditGate(auth, {
      agentMessageId: testMessageId,
      runIds: ["run1"],
    });

    expect(result.shouldStop).toBe(false);
  });

  it("stops with credits_exhausted once local usage reaches the balance", async () => {
    mockGetCachedPoolCredits.mockResolvedValue(100);
    mockIntelligenceAwuFromRunUsages.mockReturnValue(100);

    const auth = makeAuth();
    const result = await checkPoolCreditGate(auth, {
      agentMessageId: testMessageId,
      runIds: ["run1"],
    });

    expect(result).toEqual({ shouldStop: true, reason: "credits_exhausted" });
  });

  it("stops on a real zero balance even with zero local usage (distinct from an unreadable one)", async () => {
    mockGetCachedPoolCredits.mockResolvedValue(0);
    mockIntelligenceAwuFromRunUsages.mockReturnValue(0);

    const auth = makeAuth();
    const result = await checkPoolCreditGate(auth, {
      agentMessageId: testMessageId,
      runIds: [],
    });

    expect(result.shouldStop).toBe(true);
  });

  it("does NOT stop when the balance is unreadable (null), even with usage", async () => {
    mockGetCachedPoolCredits.mockResolvedValue(null);

    const auth = makeAuth();
    const result = await checkPoolCreditGate(auth, {
      agentMessageId: testMessageId,
      runIds: ["run1", "run2", "run3"],
    });

    expect(result.shouldStop).toBe(false);
    expect(mockListByDustRunIds).not.toHaveBeenCalled();
  });

  it("propagates a hard pool-status (Redis) read failure rather than silently not stopping", async () => {
    mockGetWorkspaceCreditPoolStatus.mockRejectedValue(
      new Error("redis unavailable")
    );

    const auth = makeAuth();
    await expect(
      checkPoolCreditGate(auth, { agentMessageId: testMessageId, runIds: [] })
    ).rejects.toThrow("redis unavailable");
  });

  it("propagates a hard balance (Redis) read failure", async () => {
    mockGetCachedPoolCredits.mockRejectedValue(new Error("redis unavailable"));

    const auth = makeAuth();
    await expect(
      checkPoolCreditGate(auth, {
        agentMessageId: testMessageId,
        runIds: ["run1"],
      })
    ).rejects.toThrow("redis unavailable");
  });

  it("propagates a local-usage (Postgres) query failure", async () => {
    mockGetCachedPoolCredits.mockResolvedValue(100);
    mockListByDustRunIds.mockRejectedValue(new Error("db down"));

    const auth = makeAuth();
    await expect(
      checkPoolCreditGate(auth, {
        agentMessageId: testMessageId,
        runIds: ["run1"],
      })
    ).rejects.toThrow("db down");
  });

  it("does not compute local usage at all when runIds is empty", async () => {
    mockGetCachedPoolCredits.mockResolvedValue(100);

    const auth = makeAuth();
    await checkPoolCreditGate(auth, {
      agentMessageId: testMessageId,
      runIds: [],
    });

    expect(mockListByDustRunIds).not.toHaveBeenCalled();
    expect(mockIntelligenceAwuFromRunUsages).not.toHaveBeenCalled();
  });
});

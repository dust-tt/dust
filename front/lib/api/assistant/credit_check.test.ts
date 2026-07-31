import { AGENT_MESSAGE_CREDIT_APPROVAL_THRESHOLD } from "@app/lib/api/assistant/credit_approval";
import {
  checkMessageCreditApprovalGate,
  checkPoolCreditGate,
} from "@app/lib/api/assistant/credit_check";
import type { Authenticator, AuthMethodType } from "@app/lib/auth";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockIsUserBlocked,
  mockIsApiBlocked,
  mockIsProgrammaticApiBlocked,
  mockIsProgrammaticUsage,
  mockComputeAgentMessageCredits,
  mockFetchCreditApprovalContext,
  mockFetchCreditApprovalStep,
  mockGetFeatureFlags,
} = vi.hoisted(() => ({
  mockIsUserBlocked: vi.fn(),
  mockIsApiBlocked: vi.fn(),
  mockIsProgrammaticApiBlocked: vi.fn(),
  mockIsProgrammaticUsage: vi.fn(),
  mockComputeAgentMessageCredits: vi.fn(),
  mockFetchCreditApprovalContext: vi.fn(),
  mockFetchCreditApprovalStep: vi.fn(),
  mockGetFeatureFlags: vi.fn(),
}));

vi.mock("@app/lib/auth", () => ({
  getFeatureFlags: mockGetFeatureFlags,
}));

vi.mock("@app/lib/api/assistant/credit_approval", () => ({
  AGENT_MESSAGE_CREDIT_APPROVAL_THRESHOLD: 100,
  fetchCreditApprovalContext: mockFetchCreditApprovalContext,
  fetchCreditApprovalStep: mockFetchCreditApprovalStep,
}));

vi.mock("@app/lib/api/assistant/credit_cost", () => ({
  computeAgentMessageCredits: mockComputeAgentMessageCredits,
}));

vi.mock("@app/lib/metronome/user_block", () => ({
  isUserBlocked: mockIsUserBlocked,
  isApiBlocked: mockIsApiBlocked,
  isProgrammaticApiBlocked: mockIsProgrammaticApiBlocked,
}));

vi.mock("@app/lib/api/programmatic_usage/tracking", () => ({
  isProgrammaticUsage: mockIsProgrammaticUsage,
}));

vi.mock("@app/types/plan", () => ({
  isCreditPricedPlan: (plan: { code: string }) =>
    plan.code.startsWith("ENT_NEW"),
}));

// Minimal stand-in for the Authenticator class exposing only the members the gate reads. A class
// instance can't be constructed structurally, so a single `as unknown as` is the standard test-mock
// escape here (see the same pattern across the suite); the cast surface is kept to this one spot.
function makeAuth({
  isCreditPriced = true,
  metronomeCustomerId = "metro_123",
  hasUser = true,
  authMethod = "session",
}: {
  isCreditPriced?: boolean;
  metronomeCustomerId?: string | null;
  hasUser?: boolean;
  authMethod?: AuthMethodType;
} = {}): Authenticator {
  const plan = isCreditPriced
    ? { code: "ENT_NEW_CREDIT", limits: {} }
    : { code: "LEGACY_PRO", limits: {} };

  return {
    getNonNullableWorkspace: () => ({ sId: "ws_test", metronomeCustomerId }),
    subscription: () => ({ plan }),
    user: () => (hasUser ? { sId: "user_test" } : null),
    authMethod: () => authMethod,
  } as unknown as Authenticator;
}

function callGate(
  auth: Authenticator,
  userMessageOrigin: UserMessageOrigin | null = null
) {
  return checkPoolCreditGate(auth, { userMessageOrigin });
}

describe("checkPoolCreditGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsUserBlocked.mockResolvedValue(null);
    mockIsApiBlocked.mockResolvedValue(false);
    mockIsProgrammaticApiBlocked.mockResolvedValue(false);
    mockIsProgrammaticUsage.mockReturnValue(false);
  });

  it("returns shouldStop=false for non-credit-priced plans, reading nothing", async () => {
    const auth = makeAuth({ isCreditPriced: false });
    const result = await callGate(auth);
    expect(result).toEqual({ shouldStop: false, reason: null });
    expect(mockIsUserBlocked).not.toHaveBeenCalled();
    expect(mockIsApiBlocked).not.toHaveBeenCalled();
  });

  it("returns shouldStop=false when metronomeCustomerId is null, reading nothing", async () => {
    const auth = makeAuth({ metronomeCustomerId: null });
    const result = await callGate(auth);
    expect(result).toEqual({ shouldStop: false, reason: null });
    expect(mockIsUserBlocked).not.toHaveBeenCalled();
  });

  it("does not stop when the user is not blocked", async () => {
    mockIsUserBlocked.mockResolvedValue(null);
    const auth = makeAuth({ hasUser: true });
    const result = await callGate(auth);
    expect(result).toEqual({ shouldStop: false, reason: null });
  });

  it.each([
    "credits_exhausted",
    "user_cap_reached",
    "no_seat",
  ] as const)("stops as credits_exhausted when isUserBlocked returns %s", async (blockedReason) => {
    mockIsUserBlocked.mockResolvedValue(blockedReason);
    const auth = makeAuth({ hasUser: true });
    const result = await callGate(auth);
    expect(result).toEqual({
      shouldStop: true,
      reason: "credits_exhausted",
    });
  });

  it("checks isApiBlocked (not isUserBlocked) when there is no human user", async () => {
    const auth = makeAuth({ hasUser: false });
    await callGate(auth);
    expect(mockIsUserBlocked).not.toHaveBeenCalled();
    expect(mockIsApiBlocked).toHaveBeenCalledWith("ws_test");
  });

  it("stops when isApiBlocked is true (no human user)", async () => {
    mockIsApiBlocked.mockResolvedValue(true);
    const auth = makeAuth({ hasUser: false });
    const result = await callGate(auth);
    expect(result).toEqual({ shouldStop: true, reason: "credits_exhausted" });
  });

  it("does not check the programmatic cap when userMessageOrigin is null", async () => {
    const auth = makeAuth();
    await callGate(auth, null);
    expect(mockIsProgrammaticUsage).not.toHaveBeenCalled();
    expect(mockIsProgrammaticApiBlocked).not.toHaveBeenCalled();
  });

  it("does not check the programmatic cap when this origin isn't programmatic usage", async () => {
    mockIsProgrammaticUsage.mockReturnValue(false);
    const auth = makeAuth();
    await callGate(auth, "api");
    expect(mockIsProgrammaticApiBlocked).not.toHaveBeenCalled();
  });

  it("stops when this is programmatic usage and the monthly cap is reached", async () => {
    mockIsProgrammaticUsage.mockReturnValue(true);
    mockIsProgrammaticApiBlocked.mockResolvedValue(true);
    const auth = makeAuth();
    const result = await callGate(auth, "api");
    expect(result).toEqual({ shouldStop: true, reason: "credits_exhausted" });
  });

  it("does not stop when this is programmatic usage but the cap isn't reached", async () => {
    mockIsProgrammaticUsage.mockReturnValue(true);
    mockIsProgrammaticApiBlocked.mockResolvedValue(false);
    const auth = makeAuth();
    const result = await callGate(auth, "api");
    expect(result).toEqual({ shouldStop: false, reason: null });
  });

  it("propagates a hard read failure rather than silently not stopping", async () => {
    mockIsUserBlocked.mockRejectedValue(new Error("redis unavailable"));
    const auth = makeAuth();
    await expect(callGate(auth)).rejects.toThrow("redis unavailable");
  });
});

function callApprovalGate(
  auth: Authenticator,
  userMessageOrigin: UserMessageOrigin | null = "web"
) {
  return checkMessageCreditApprovalGate(auth, {
    agentMessageId: "msg_1",
    userMessageId: "usr_msg_1",
    userMessageOrigin,
  });
}

function mockCostCredits(costCredits: number | null) {
  mockComputeAgentMessageCredits.mockResolvedValue({
    agentMessageModelId: 1,
    costCredits,
    previousCostCredits: null,
  });
}

describe("checkMessageCreditApprovalGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchCreditApprovalContext.mockResolvedValue({
      agentMessageModelId: 1,
      isRootAgentMessage: true,
    });
    mockFetchCreditApprovalStep.mockResolvedValue(null);
    mockCostCredits(0);
    mockIsProgrammaticUsage.mockReturnValue(false);
    mockGetFeatureFlags.mockResolvedValue(["credit_approval_gate"]);
  });

  it("never asks when the feature flag is off", async () => {
    mockGetFeatureFlags.mockResolvedValue([]);
    mockCostCredits(AGENT_MESSAGE_CREDIT_APPROVAL_THRESHOLD + 1);

    const result = await callApprovalGate(makeAuth());

    expect(result).toEqual({ shouldStop: false, reason: null });
    expect(mockFetchCreditApprovalContext).not.toHaveBeenCalled();
    expect(mockComputeAgentMessageCredits).not.toHaveBeenCalled();
  });

  it("asks for approval once the cost is strictly above the threshold", async () => {
    mockCostCredits(AGENT_MESSAGE_CREDIT_APPROVAL_THRESHOLD + 1);

    const result = await callApprovalGate(makeAuth());

    expect(result).toEqual({
      shouldStop: true,
      reason: "credit_approval_required",
      costCredits: AGENT_MESSAGE_CREDIT_APPROVAL_THRESHOLD + 1,
    });
  });

  it("does not ask when the cost sits exactly on the threshold", async () => {
    mockCostCredits(AGENT_MESSAGE_CREDIT_APPROVAL_THRESHOLD);

    const result = await callApprovalGate(makeAuth());

    expect(result).toEqual({ shouldStop: false, reason: null });
  });

  it("does not ask when nothing billable is attributed to the message yet", async () => {
    mockCostCredits(null);

    const result = await callApprovalGate(makeAuth());

    expect(result).toEqual({ shouldStop: false, reason: null });
  });

  it("never asks twice: a message that already asked short-circuits before computing the cost", async () => {
    mockFetchCreditApprovalStep.mockResolvedValue(2);
    mockCostCredits(AGENT_MESSAGE_CREDIT_APPROVAL_THRESHOLD + 1);

    const result = await callApprovalGate(makeAuth());

    expect(result).toEqual({ shouldStop: false, reason: null });
    expect(mockComputeAgentMessageCredits).not.toHaveBeenCalled();
  });

  it("does not ask when the agent message row is gone", async () => {
    mockFetchCreditApprovalContext.mockResolvedValue(null);

    const result = await callApprovalGate(makeAuth());

    expect(result).toEqual({ shouldStop: false, reason: null });
    expect(mockComputeAgentMessageCredits).not.toHaveBeenCalled();
  });

  it("leaves sub-agent runs alone — the root message's cost already covers them", async () => {
    mockFetchCreditApprovalContext.mockResolvedValue({
      agentMessageModelId: 1,
      isRootAgentMessage: false,
    });

    const result = await callApprovalGate(makeAuth());

    expect(result).toEqual({ shouldStop: false, reason: null });
    expect(mockComputeAgentMessageCredits).not.toHaveBeenCalled();
  });

  it("never asks on a programmatic origin: nobody is there to answer", async () => {
    mockIsProgrammaticUsage.mockReturnValue(true);
    mockCostCredits(AGENT_MESSAGE_CREDIT_APPROVAL_THRESHOLD + 1);

    const result = await callApprovalGate(makeAuth(), "api");

    expect(result).toEqual({ shouldStop: false, reason: null });
    expect(mockFetchCreditApprovalContext).not.toHaveBeenCalled();
    expect(mockComputeAgentMessageCredits).not.toHaveBeenCalled();
  });

  it("never asks on API-key auth, even when the run carries no origin", async () => {
    mockCostCredits(AGENT_MESSAGE_CREDIT_APPROVAL_THRESHOLD + 1);

    const result = await callApprovalGate(
      makeAuth({ authMethod: "api_key" }),
      null
    );

    expect(result).toEqual({ shouldStop: false, reason: null });
    expect(mockIsProgrammaticUsage).not.toHaveBeenCalled();
    expect(mockFetchCreditApprovalContext).not.toHaveBeenCalled();
  });
});

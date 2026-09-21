import type { Authenticator } from "@app/lib/auth";
import { getCreditSpendCheckpointCrossed } from "@app/temporal/agent_loop/activities/run_model_and_create_actions_wrapper";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockIsExemptFromCreditSpendCheckpoint,
  mockHasReachedCreditSpendCheckpoint,
  mockHasCrossedCreditSpendCheckpoint,
  mockGetCreditSpendCheckpointConfig,
  mockFetchStatus,
  mockTransitionStatus,
} = vi.hoisted(() => ({
  mockIsExemptFromCreditSpendCheckpoint: vi.fn(),
  mockHasReachedCreditSpendCheckpoint: vi.fn(),
  mockHasCrossedCreditSpendCheckpoint: vi.fn(),
  mockGetCreditSpendCheckpointConfig: vi.fn(),
  mockFetchStatus: vi.fn(),
  mockTransitionStatus: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/credit_spend_checkpoint", () => ({
  isExemptFromCreditSpendCheckpoint: mockIsExemptFromCreditSpendCheckpoint,
  hasReachedCreditSpendCheckpoint: mockHasReachedCreditSpendCheckpoint,
  hasCrossedCreditSpendCheckpoint: mockHasCrossedCreditSpendCheckpoint,
  getCreditSpendCheckpointConfig: mockGetCreditSpendCheckpointConfig,
}));

vi.mock("@app/lib/resources/conversation_resource", () => ({
  ConversationResource: {
    fetchAgentMessageCreditSpendCheckpointStatus: mockFetchStatus,
    transitionAgentMessageCreditSpendCheckpointStatus: mockTransitionStatus,
  },
}));

const FAKE_AUTH = {
  getNonNullableWorkspace: () => ({ sId: "ws_test", id: 1 }),
} as unknown as Authenticator;

const BASE_ARGS = {
  isRootAgentMessage: true,
  userMessageOrigin: "web" as const,
  agentMessageId: "agent_msg_id",
  agentMessageModelId: 42,
  totalCostMicroUsd: 1_000_000,
};

describe("getCreditSpendCheckpointCrossed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsExemptFromCreditSpendCheckpoint.mockReturnValue(false);
    mockHasReachedCreditSpendCheckpoint.mockReturnValue(true);
    mockHasCrossedCreditSpendCheckpoint.mockReturnValue(true);
    mockGetCreditSpendCheckpointConfig.mockResolvedValue({
      enabled: true,
      thresholdAwuCredits: 200,
    });
    mockFetchStatus.mockResolvedValue(null);
    mockTransitionStatus.mockResolvedValue({ applied: true });
  });

  it("is false when exempt, without reading the message or the config", async () => {
    mockIsExemptFromCreditSpendCheckpoint.mockReturnValue(true);

    const result = await getCreditSpendCheckpointCrossed(FAKE_AUTH, BASE_ARGS);

    expect(mockFetchStatus).not.toHaveBeenCalled();
    expect(mockGetCreditSpendCheckpointConfig).not.toHaveBeenCalled();
    expect(result).toEqual({ crossed: false });
  });

  it("is false for a sub-agent message, without reading the message or the config", async () => {
    const result = await getCreditSpendCheckpointCrossed(FAKE_AUTH, {
      ...BASE_ARGS,
      isRootAgentMessage: false,
    });

    expect(mockFetchStatus).not.toHaveBeenCalled();
    expect(mockGetCreditSpendCheckpointConfig).not.toHaveBeenCalled();
    expect(result).toEqual({ crossed: false });
  });

  it("once the status is already resolved, decides from it alone without reading the config", async () => {
    mockFetchStatus.mockResolvedValue("paused");
    mockHasCrossedCreditSpendCheckpoint.mockReturnValue(true);

    const result = await getCreditSpendCheckpointCrossed(FAKE_AUTH, BASE_ARGS);

    expect(mockFetchStatus).toHaveBeenCalledWith(FAKE_AUTH, {
      agentMessageId: "agent_msg_id",
    });
    expect(mockGetCreditSpendCheckpointConfig).not.toHaveBeenCalled();
    expect(mockHasReachedCreditSpendCheckpoint).not.toHaveBeenCalled();
    expect(mockTransitionStatus).not.toHaveBeenCalled();
    expect(mockHasCrossedCreditSpendCheckpoint).toHaveBeenCalledWith({
      isExempt: false,
      isRootAgentMessage: true,
      status: "paused",
    });
    expect(result).toEqual({ crossed: true });
  });

  it("once acknowledged, decides from status alone and stays unpaused", async () => {
    mockFetchStatus.mockResolvedValue("acknowledged");
    mockHasCrossedCreditSpendCheckpoint.mockReturnValue(false);

    const result = await getCreditSpendCheckpointCrossed(FAKE_AUTH, BASE_ARGS);

    expect(mockGetCreditSpendCheckpointConfig).not.toHaveBeenCalled();
    expect(mockTransitionStatus).not.toHaveBeenCalled();
    expect(result).toEqual({ crossed: false });
  });

  it("while status is unset, reads the config and returns false when the threshold isn't reached", async () => {
    mockFetchStatus.mockResolvedValue(null);
    mockHasReachedCreditSpendCheckpoint.mockReturnValue(false);

    const result = await getCreditSpendCheckpointCrossed(FAKE_AUTH, BASE_ARGS);

    expect(mockGetCreditSpendCheckpointConfig).toHaveBeenCalledWith(FAKE_AUTH);
    expect(mockHasReachedCreditSpendCheckpoint).toHaveBeenCalledWith({
      totalCostMicroUsd: BASE_ARGS.totalCostMicroUsd,
      thresholdAwuCredits: 200,
    });
    expect(mockTransitionStatus).not.toHaveBeenCalled();
    expect(mockHasCrossedCreditSpendCheckpoint).not.toHaveBeenCalled();
    expect(result).toEqual({
      crossed: false,
      resolvedConfig: { enabled: true, thresholdAwuCredits: 200 },
    });
  });

  it("while status is unset and the threshold is reached, auto-acknowledges when the gate is disabled", async () => {
    mockFetchStatus.mockResolvedValue(null);
    mockGetCreditSpendCheckpointConfig.mockResolvedValue({
      enabled: false,
      thresholdAwuCredits: 200,
    });

    const result = await getCreditSpendCheckpointCrossed(FAKE_AUTH, BASE_ARGS);

    expect(mockTransitionStatus).toHaveBeenCalledWith(FAKE_AUTH, {
      agentMessageModelId: 42,
      from: null,
      to: "acknowledged",
    });
    expect(mockHasCrossedCreditSpendCheckpoint).not.toHaveBeenCalled();
    expect(result).toEqual({
      crossed: false,
      resolvedConfig: { enabled: false, thresholdAwuCredits: 200 },
    });
  });

  it("while status is unset and the threshold is reached, delegates to the status check when the gate is enabled", async () => {
    mockFetchStatus.mockResolvedValue(null);
    mockGetCreditSpendCheckpointConfig.mockResolvedValue({
      enabled: true,
      thresholdAwuCredits: 200,
    });
    mockHasCrossedCreditSpendCheckpoint.mockReturnValue(true);

    const result = await getCreditSpendCheckpointCrossed(FAKE_AUTH, BASE_ARGS);

    expect(mockTransitionStatus).not.toHaveBeenCalled();
    expect(mockHasCrossedCreditSpendCheckpoint).toHaveBeenCalledWith({
      isExempt: false,
      isRootAgentMessage: true,
      status: null,
    });
    expect(result).toEqual({
      crossed: true,
      resolvedConfig: { enabled: true, thresholdAwuCredits: 200 },
    });
  });

  it("uses the workspace's configured threshold, not a hardcoded one", async () => {
    mockFetchStatus.mockResolvedValue(null);
    mockGetCreditSpendCheckpointConfig.mockResolvedValue({
      enabled: true,
      thresholdAwuCredits: 500,
    });

    await getCreditSpendCheckpointCrossed(FAKE_AUTH, BASE_ARGS);

    expect(mockHasReachedCreditSpendCheckpoint).toHaveBeenCalledWith({
      totalCostMicroUsd: BASE_ARGS.totalCostMicroUsd,
      thresholdAwuCredits: 500,
    });
  });

  it("does not report a resolvedConfig when the caller already passed one in", async () => {
    mockFetchStatus.mockResolvedValue(null);

    const result = await getCreditSpendCheckpointCrossed(FAKE_AUTH, {
      ...BASE_ARGS,
      creditSpendCheckpointConfig: { enabled: true, thresholdAwuCredits: 300 },
    });

    expect(mockGetCreditSpendCheckpointConfig).not.toHaveBeenCalled();
    expect(mockHasReachedCreditSpendCheckpoint).toHaveBeenCalledWith({
      totalCostMicroUsd: BASE_ARGS.totalCostMicroUsd,
      thresholdAwuCredits: 300,
    });
    expect(result.resolvedConfig).toBeUndefined();
  });
});

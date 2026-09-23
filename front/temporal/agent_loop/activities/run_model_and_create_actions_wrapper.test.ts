import type { Authenticator } from "@app/lib/auth";
import { getCreditSpendCheckpointCrossed } from "@app/temporal/agent_loop/activities/run_model_and_create_actions_wrapper";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockIsExemptFromCreditSpendCheckpoint,
  mockHasReachedCreditSpendCheckpoint,
  mockHasCrossedCreditSpendCheckpoint,
  mockGetCreditSpendCheckpointEnabled,
  mockFetchStatus,
  mockTransitionStatus,
} = vi.hoisted(() => ({
  mockIsExemptFromCreditSpendCheckpoint: vi.fn(),
  mockHasReachedCreditSpendCheckpoint: vi.fn(),
  mockHasCrossedCreditSpendCheckpoint: vi.fn(),
  mockGetCreditSpendCheckpointEnabled: vi.fn(),
  mockFetchStatus: vi.fn(),
  mockTransitionStatus: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/credit_spend_checkpoint", () => ({
  isExemptFromCreditSpendCheckpoint: mockIsExemptFromCreditSpendCheckpoint,
  hasReachedCreditSpendCheckpoint: mockHasReachedCreditSpendCheckpoint,
  hasCrossedCreditSpendCheckpoint: mockHasCrossedCreditSpendCheckpoint,
  getCreditSpendCheckpointEnabled: mockGetCreditSpendCheckpointEnabled,
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
    mockGetCreditSpendCheckpointEnabled.mockResolvedValue(true);
    mockFetchStatus.mockResolvedValue(null);
    mockTransitionStatus.mockResolvedValue({ applied: true });
  });

  it("is false when exempt, without reading the message or the gate", async () => {
    mockIsExemptFromCreditSpendCheckpoint.mockReturnValue(true);

    const result = await getCreditSpendCheckpointCrossed(FAKE_AUTH, BASE_ARGS);

    expect(mockFetchStatus).not.toHaveBeenCalled();
    expect(mockGetCreditSpendCheckpointEnabled).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it("is false for a sub-agent message, without reading the message or the gate", async () => {
    const result = await getCreditSpendCheckpointCrossed(FAKE_AUTH, {
      ...BASE_ARGS,
      isRootAgentMessage: false,
    });

    expect(mockFetchStatus).not.toHaveBeenCalled();
    expect(mockGetCreditSpendCheckpointEnabled).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it("is false while the pre-step spend hasn't reached the threshold, without reading the message or the gate", async () => {
    mockHasReachedCreditSpendCheckpoint.mockReturnValue(false);

    const result = await getCreditSpendCheckpointCrossed(FAKE_AUTH, BASE_ARGS);

    expect(mockFetchStatus).not.toHaveBeenCalled();
    expect(mockGetCreditSpendCheckpointEnabled).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it("on the first crossing step, reads the gate once and auto-acknowledges when disabled", async () => {
    mockFetchStatus.mockResolvedValue(null);
    mockGetCreditSpendCheckpointEnabled.mockResolvedValue(false);

    const result = await getCreditSpendCheckpointCrossed(FAKE_AUTH, BASE_ARGS);

    expect(mockGetCreditSpendCheckpointEnabled).toHaveBeenCalledTimes(1);
    expect(mockGetCreditSpendCheckpointEnabled).toHaveBeenCalledWith(FAKE_AUTH);
    expect(mockTransitionStatus).toHaveBeenCalledWith(FAKE_AUTH, {
      agentMessageModelId: 42,
      from: null,
      to: "acknowledged",
    });
    expect(mockHasCrossedCreditSpendCheckpoint).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it("on the first crossing step, reads the gate once and delegates to the status check when enabled", async () => {
    mockFetchStatus.mockResolvedValue(null);
    mockGetCreditSpendCheckpointEnabled.mockResolvedValue(true);
    mockHasCrossedCreditSpendCheckpoint.mockReturnValue(true);

    const result = await getCreditSpendCheckpointCrossed(FAKE_AUTH, BASE_ARGS);

    expect(mockGetCreditSpendCheckpointEnabled).toHaveBeenCalledTimes(1);
    expect(mockTransitionStatus).not.toHaveBeenCalled();
    expect(mockHasCrossedCreditSpendCheckpoint).toHaveBeenCalledWith({
      isExempt: false,
      isRootAgentMessage: true,
      status: null,
    });
    expect(result).toBe(true);
  });

  it("once the status is already resolved, never re-reads the gate", async () => {
    mockFetchStatus.mockResolvedValue("paused");
    mockHasCrossedCreditSpendCheckpoint.mockReturnValue(true);

    const result = await getCreditSpendCheckpointCrossed(FAKE_AUTH, BASE_ARGS);

    expect(mockGetCreditSpendCheckpointEnabled).not.toHaveBeenCalled();
    expect(mockTransitionStatus).not.toHaveBeenCalled();
    expect(mockFetchStatus).toHaveBeenCalledWith(FAKE_AUTH, {
      agentMessageId: "agent_msg_id",
    });
    expect(mockHasCrossedCreditSpendCheckpoint).toHaveBeenCalledWith({
      isExempt: false,
      isRootAgentMessage: true,
      status: "paused",
    });
    expect(result).toBe(true);
  });

  it("once acknowledged, never re-reads the gate and stays unpaused", async () => {
    mockFetchStatus.mockResolvedValue("acknowledged");
    mockHasCrossedCreditSpendCheckpoint.mockReturnValue(false);

    const result = await getCreditSpendCheckpointCrossed(FAKE_AUTH, BASE_ARGS);

    expect(mockGetCreditSpendCheckpointEnabled).not.toHaveBeenCalled();
    expect(mockTransitionStatus).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });
});

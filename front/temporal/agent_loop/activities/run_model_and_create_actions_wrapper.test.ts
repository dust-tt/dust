import type { Authenticator } from "@app/lib/auth";
import { getCreditSpendCheckpointCrossed } from "@app/temporal/agent_loop/activities/run_model_and_create_actions_wrapper";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockIsExemptFromCreditSpendCheckpoint,
  mockHasReachedCreditSpendCheckpoint,
  mockHasCrossedCreditSpendCheckpoint,
  mockFetchStatus,
} = vi.hoisted(() => ({
  mockIsExemptFromCreditSpendCheckpoint: vi.fn(),
  mockHasReachedCreditSpendCheckpoint: vi.fn(),
  mockHasCrossedCreditSpendCheckpoint: vi.fn(),
  mockFetchStatus: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/credit_spend_checkpoint", () => ({
  isExemptFromCreditSpendCheckpoint: mockIsExemptFromCreditSpendCheckpoint,
  hasReachedCreditSpendCheckpoint: mockHasReachedCreditSpendCheckpoint,
  hasCrossedCreditSpendCheckpoint: mockHasCrossedCreditSpendCheckpoint,
}));

vi.mock("@app/lib/resources/conversation_resource", () => ({
  ConversationResource: {
    fetchAgentMessageCreditSpendCheckpointStatus: mockFetchStatus,
  },
}));

const FAKE_AUTH = {
  getNonNullableWorkspace: () => ({ sId: "ws_test", id: 1 }),
} as unknown as Authenticator;

const BASE_ARGS = {
  auth: FAKE_AUTH,
  isRootAgentMessage: true,
  userMessageOrigin: "web" as const,
  agentMessageId: "agent_msg_id",
  totalCostMicroUsd: 1_000_000,
};

describe("getCreditSpendCheckpointCrossed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsExemptFromCreditSpendCheckpoint.mockReturnValue(false);
    mockHasReachedCreditSpendCheckpoint.mockReturnValue(true);
    mockHasCrossedCreditSpendCheckpoint.mockReturnValue(true);
    mockFetchStatus.mockResolvedValue(null);
  });

  it("is false when exempt, without reading the message", async () => {
    mockIsExemptFromCreditSpendCheckpoint.mockReturnValue(true);

    const result = await getCreditSpendCheckpointCrossed(BASE_ARGS);

    expect(mockFetchStatus).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it("is false for a sub-agent message, without reading the message", async () => {
    const result = await getCreditSpendCheckpointCrossed({
      ...BASE_ARGS,
      isRootAgentMessage: false,
    });

    expect(mockFetchStatus).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it("is false while the pre-step spend hasn't reached the threshold, without reading the message", async () => {
    mockHasReachedCreditSpendCheckpoint.mockReturnValue(false);

    const result = await getCreditSpendCheckpointCrossed(BASE_ARGS);

    expect(mockFetchStatus).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it("reads the status and delegates the final decision once the cheap checks pass", async () => {
    mockFetchStatus.mockResolvedValue("paused");
    mockHasCrossedCreditSpendCheckpoint.mockReturnValue(true);

    const result = await getCreditSpendCheckpointCrossed(BASE_ARGS);

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

  it("fails open (not crossed) when reading the status errors", async () => {
    mockFetchStatus.mockRejectedValue(new Error("db unavailable"));

    const result = await getCreditSpendCheckpointCrossed(BASE_ARGS);

    expect(mockHasCrossedCreditSpendCheckpoint).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });
});

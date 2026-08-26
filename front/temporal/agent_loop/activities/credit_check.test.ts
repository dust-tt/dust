import {
  checkCreditsActivity,
  checkSpendCheckpointActivity,
} from "@app/temporal/agent_loop/activities/credit_check";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFromJson,
  mockCheckPoolCreditGate,
  mockCheckSpendCheckpointGate,
  mockGetAgentLoopData,
  mockIsAgentLoopDataSoftDeleteError,
  mockPublishConversationRelatedEvent,
  mockMessageModelFindOne,
  mockAgentMessageModelUpdate,
  mockMarkAsActionRequired,
} = vi.hoisted(() => ({
  mockFromJson: vi.fn(),
  mockCheckPoolCreditGate: vi.fn(),
  mockCheckSpendCheckpointGate: vi.fn(),
  mockGetAgentLoopData: vi.fn(),
  mockIsAgentLoopDataSoftDeleteError: vi.fn(),
  mockPublishConversationRelatedEvent: vi.fn(),
  mockMessageModelFindOne: vi.fn(),
  mockAgentMessageModelUpdate: vi.fn(),
  mockMarkAsActionRequired: vi.fn(),
}));

vi.mock("@app/lib/auth", () => ({
  Authenticator: { fromJsonWithRefrehedGroups: mockFromJson },
}));

vi.mock("@app/lib/api/assistant/credit_check", () => ({
  checkPoolCreditGate: mockCheckPoolCreditGate,
  checkSpendCheckpointGate: mockCheckSpendCheckpointGate,
}));

vi.mock("@app/lib/api/assistant/streaming/events", () => ({
  publishConversationRelatedEvent: mockPublishConversationRelatedEvent,
}));

vi.mock("@app/lib/models/agent/conversation", () => ({
  MessageModel: { findOne: mockMessageModelFindOne },
  AgentMessageModel: { update: mockAgentMessageModelUpdate },
}));

vi.mock("@app/lib/resources/conversation_resource", () => ({
  ConversationResource: { markAsActionRequired: mockMarkAsActionRequired },
}));

vi.mock("@app/types/assistant/agent_run", () => ({
  getAgentLoopData: mockGetAgentLoopData,
  isAgentLoopDataSoftDeleteError: mockIsAgentLoopDataSoftDeleteError,
}));

const FAKE_AUTH = {
  getNonNullableWorkspace: () => ({ sId: "ws_test", id: 1 }),
} as never;

describe("checkCreditsActivity (pure decision)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromJson.mockResolvedValue(FAKE_AUTH);
  });

  it("returns the gate's no-stop result unchanged", async () => {
    mockCheckPoolCreditGate.mockResolvedValue({
      shouldStop: false,
      reason: null,
    });

    const result = await checkCreditsActivity({} as never, {
      agentLoopArgs: {} as never,
    });

    expect(result).toEqual({ shouldStop: false, reason: null });
  });

  it("returns the gate's stop result unchanged", async () => {
    mockCheckPoolCreditGate.mockResolvedValue({
      shouldStop: true,
      reason: "credits_exhausted",
    });

    const result = await checkCreditsActivity({} as never, {
      agentLoopArgs: {} as never,
    });

    expect(result).toEqual({ shouldStop: true, reason: "credits_exhausted" });
  });

  it("calls the gate with the resolved auth and this execution's userMessageOrigin", async () => {
    mockCheckPoolCreditGate.mockResolvedValue({
      shouldStop: false,
      reason: null,
    });

    await checkCreditsActivity({} as never, {
      agentLoopArgs: { userMessageOrigin: "api" } as never,
    });

    expect(mockCheckPoolCreditGate).toHaveBeenCalledWith(FAKE_AUTH, {
      userMessageOrigin: "api",
    });
  });

  it("passes userMessageOrigin: null when the args don't carry one", async () => {
    mockCheckPoolCreditGate.mockResolvedValue({
      shouldStop: false,
      reason: null,
    });

    await checkCreditsActivity({} as never, {
      agentLoopArgs: {} as never,
    });

    expect(mockCheckPoolCreditGate).toHaveBeenCalledWith(FAKE_AUTH, {
      userMessageOrigin: null,
    });
  });
});

describe("checkSpendCheckpointActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromJson.mockResolvedValue(FAKE_AUTH);
    mockMessageModelFindOne.mockResolvedValue(null);
  });

  it("returns crossed: false without checking the gate once acknowledged", async () => {
    mockMessageModelFindOne.mockResolvedValue({
      agentMessage: { spendCheckpointStatus: "acknowledged" },
    });

    const result = await checkSpendCheckpointActivity({} as never, {
      agentLoopArgs: { agentMessageId: "msg_id" } as never,
    });

    expect(result).toEqual({ crossed: false, acknowledged: true });
    expect(mockCheckSpendCheckpointGate).not.toHaveBeenCalled();
  });

  it("does not load the conversation or publish when the gate says not crossed", async () => {
    mockCheckSpendCheckpointGate.mockResolvedValue({ crossed: false });

    const result = await checkSpendCheckpointActivity({} as never, {
      agentLoopArgs: {} as never,
    });

    expect(result).toEqual({ crossed: false, acknowledged: false });
    expect(mockGetAgentLoopData).not.toHaveBeenCalled();
    expect(mockPublishConversationRelatedEvent).not.toHaveBeenCalled();
  });

  it("loads the conversation and publishes a notification event when crossed", async () => {
    mockCheckSpendCheckpointGate.mockResolvedValue({
      crossed: true,
      thresholdAwuCredits: 1500,
    });
    mockGetAgentLoopData.mockResolvedValue({
      isErr: () => false,
      value: {
        agentConfiguration: { sId: "agent_config_id" },
        agentMessage: { sId: "msg_id", contents: [{ step: 2 }] },
        conversation: { sId: "conv_id" },
      },
    });

    const result = await checkSpendCheckpointActivity({} as never, {
      agentLoopArgs: {
        conversationId: "conv_id",
        agentMessageId: "msg_id",
      } as never,
    });

    expect(result).toEqual({ crossed: true, acknowledged: false });
    expect(mockPublishConversationRelatedEvent).toHaveBeenCalledWith({
      conversationId: "conv_id",
      step: 2,
      event: {
        type: "agent_spend_checkpoint_reached",
        created: expect.any(Number),
        configurationId: "agent_config_id",
        messageId: "msg_id",
        thresholdAwuCredits: 1500,
      },
    });
  });

  it("still reports crossed but skips publishing when the message was soft-deleted", async () => {
    mockCheckSpendCheckpointGate.mockResolvedValue({
      crossed: true,
      thresholdAwuCredits: 1500,
    });
    mockGetAgentLoopData.mockResolvedValue({
      isErr: () => true,
      error: new Error("agent_message_deleted"),
    });
    mockIsAgentLoopDataSoftDeleteError.mockReturnValue(true);

    const result = await checkSpendCheckpointActivity({} as never, {
      agentLoopArgs: {} as never,
    });

    expect(result).toEqual({ crossed: true, acknowledged: false });
    expect(mockPublishConversationRelatedEvent).not.toHaveBeenCalled();
  });

  it("throws (instead of pausing) on a non-deletion failure to load agent loop data", async () => {
    mockCheckSpendCheckpointGate.mockResolvedValue({
      crossed: true,
      thresholdAwuCredits: 1500,
    });
    mockGetAgentLoopData.mockResolvedValue({
      isErr: () => true,
      error: new Error("transient_db_error"),
    });
    mockIsAgentLoopDataSoftDeleteError.mockReturnValue(false);

    await expect(
      checkSpendCheckpointActivity({} as never, {
        agentLoopArgs: {} as never,
      })
    ).rejects.toThrow("transient_db_error");

    expect(mockAgentMessageModelUpdate).not.toHaveBeenCalled();
    expect(mockPublishConversationRelatedEvent).not.toHaveBeenCalled();
  });

  it("still reports crossed when the pause is persisted but the notification fails", async () => {
    mockCheckSpendCheckpointGate.mockResolvedValue({
      crossed: true,
      thresholdAwuCredits: 1500,
    });
    mockGetAgentLoopData.mockResolvedValue({
      isErr: () => false,
      value: {
        agentConfiguration: { sId: "agent_config_id" },
        agentMessage: { sId: "msg_id", contents: [{ step: 2 }] },
        conversation: { sId: "conv_id" },
      },
    });
    mockPublishConversationRelatedEvent.mockRejectedValue(
      new Error("redis_publish_failed")
    );

    const result = await checkSpendCheckpointActivity({} as never, {
      agentLoopArgs: {
        conversationId: "conv_id",
        agentMessageId: "msg_id",
      } as never,
    });

    expect(result).toEqual({ crossed: true, acknowledged: false });
    expect(mockAgentMessageModelUpdate).toHaveBeenCalled();
  });
});

import {
  checkCreditSpendCheckpointActivity,
  checkCreditsActivity,
} from "@app/temporal/agent_loop/activities/credit_check";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFromJson,
  mockCheckPoolCreditGate,
  mockCheckCreditSpendCheckpointGate,
  mockGetFullAgentLoopDataWithAuth,
  mockIsAgentLoopDataSoftDeleteError,
  mockPublishConversationRelatedEvent,
  mockMessageModelFindOne,
  mockAgentMessageModelUpdate,
  mockMarkAsActionRequired,
  mockListByDustRunIds,
  mockListRunUsagesForRuns,
  mockAwuFromMicroUsd,
} = vi.hoisted(() => ({
  mockFromJson: vi.fn(),
  mockCheckPoolCreditGate: vi.fn(),
  mockCheckCreditSpendCheckpointGate: vi.fn(),
  mockGetFullAgentLoopDataWithAuth: vi.fn(),
  mockIsAgentLoopDataSoftDeleteError: vi.fn(),
  mockPublishConversationRelatedEvent: vi.fn(),
  mockMessageModelFindOne: vi.fn(),
  mockAgentMessageModelUpdate: vi.fn(),
  mockMarkAsActionRequired: vi.fn(),
  mockListByDustRunIds: vi.fn(),
  mockListRunUsagesForRuns: vi.fn(),
  mockAwuFromMicroUsd: vi.fn(),
}));

vi.mock("@app/lib/auth", () => ({
  Authenticator: { fromJsonWithRefrehedGroups: mockFromJson },
}));

vi.mock("@app/lib/api/assistant/credit_check", () => ({
  checkPoolCreditGate: mockCheckPoolCreditGate,
  checkCreditSpendCheckpointGate: mockCheckCreditSpendCheckpointGate,
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

vi.mock("@app/lib/resources/run_resource", () => ({
  RunResource: {
    listByDustRunIds: mockListByDustRunIds,
    listRunUsagesForRuns: mockListRunUsagesForRuns,
  },
}));

vi.mock("@app/lib/credits/agent_message_billing", () => ({
  awuFromMicroUsd: mockAwuFromMicroUsd,
}));

vi.mock("@app/types/assistant/agent_run", () => ({
  getFullAgentLoopDataWithAuth: mockGetFullAgentLoopDataWithAuth,
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

describe("checkCreditSpendCheckpointActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromJson.mockResolvedValue(FAKE_AUTH);
    mockMessageModelFindOne.mockResolvedValue(null);
    mockListByDustRunIds.mockResolvedValue([]);
    mockListRunUsagesForRuns.mockResolvedValue([]);
    mockAwuFromMicroUsd.mockReturnValue(0);
  });

  it("returns crossed: false without checking the gate once acknowledged", async () => {
    mockMessageModelFindOne.mockResolvedValue({
      agentMessage: {
        creditSpendCheckpointStatus: "acknowledged",
        runIds: ["run_1"],
      },
    });

    const result = await checkCreditSpendCheckpointActivity({} as never, {
      agentLoopArgs: { agentMessageId: "msg_id" } as never,
    });

    expect(result).toEqual({ crossed: false, acknowledged: true });
    expect(mockCheckCreditSpendCheckpointGate).not.toHaveBeenCalled();
    expect(mockListByDustRunIds).not.toHaveBeenCalled();
  });

  it("skips the run usage lookup when this message has no runIds yet", async () => {
    mockCheckCreditSpendCheckpointGate.mockResolvedValue({ crossed: false });

    await checkCreditSpendCheckpointActivity({} as never, {
      agentLoopArgs: { agentMessageId: "msg_id" } as never,
    });

    expect(mockListByDustRunIds).not.toHaveBeenCalled();
    expect(mockCheckCreditSpendCheckpointGate).toHaveBeenCalledWith(FAKE_AUTH, {
      consumedAwuCredits: 0,
    });
  });

  it("computes this message's consumed AWU credits from its own runIds and passes them to the gate", async () => {
    mockMessageModelFindOne.mockResolvedValue({
      agentMessage: {
        creditSpendCheckpointStatus: null,
        runIds: ["run_1", "run_2"],
      },
    });
    const fakeRuns = [{ id: 1 }, { id: 2 }];
    mockListByDustRunIds.mockResolvedValue(fakeRuns);
    mockListRunUsagesForRuns.mockResolvedValue([
      { costMicroUsd: 100 },
      { costMicroUsd: 250 },
    ]);
    mockAwuFromMicroUsd.mockReturnValue(42);
    mockCheckCreditSpendCheckpointGate.mockResolvedValue({ crossed: false });

    await checkCreditSpendCheckpointActivity({} as never, {
      agentLoopArgs: { agentMessageId: "msg_id" } as never,
    });

    expect(mockListByDustRunIds).toHaveBeenCalledWith(FAKE_AUTH, {
      dustRunIds: ["run_1", "run_2"],
    });
    expect(mockListRunUsagesForRuns).toHaveBeenCalledWith(FAKE_AUTH, {
      runs: fakeRuns,
    });
    expect(mockAwuFromMicroUsd).toHaveBeenCalledWith(350);
    expect(mockCheckCreditSpendCheckpointGate).toHaveBeenCalledWith(FAKE_AUTH, {
      consumedAwuCredits: 42,
    });
  });

  it("does not load the conversation or publish when the gate says not crossed", async () => {
    mockCheckCreditSpendCheckpointGate.mockResolvedValue({ crossed: false });

    const result = await checkCreditSpendCheckpointActivity({} as never, {
      agentLoopArgs: {} as never,
    });

    expect(result).toEqual({ crossed: false, acknowledged: false });
    expect(mockGetFullAgentLoopDataWithAuth).not.toHaveBeenCalled();
    expect(mockPublishConversationRelatedEvent).not.toHaveBeenCalled();
  });

  it("loads the conversation and publishes a notification event when crossed", async () => {
    mockCheckCreditSpendCheckpointGate.mockResolvedValue({
      crossed: true,
      thresholdAwuCredits: 1500,
    });
    mockGetFullAgentLoopDataWithAuth.mockResolvedValue({
      isErr: () => false,
      value: {
        agentConfiguration: { sId: "agent_config_id" },
        agentMessage: { sId: "msg_id", contents: [{ step: 2 }] },
        conversation: { sId: "conv_id" },
      },
    });

    const result = await checkCreditSpendCheckpointActivity({} as never, {
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
        type: "agent_credit_spend_checkpoint_reached",
        created: expect.any(Number),
        configurationId: "agent_config_id",
        messageId: "msg_id",
        thresholdAwuCredits: 1500,
      },
    });
  });

  it("still reports crossed but skips publishing when the message was soft-deleted", async () => {
    mockCheckCreditSpendCheckpointGate.mockResolvedValue({
      crossed: true,
      thresholdAwuCredits: 1500,
    });
    mockGetFullAgentLoopDataWithAuth.mockResolvedValue({
      isErr: () => true,
      error: new Error("agent_message_deleted"),
    });
    mockIsAgentLoopDataSoftDeleteError.mockReturnValue(true);

    const result = await checkCreditSpendCheckpointActivity({} as never, {
      agentLoopArgs: {} as never,
    });

    expect(result).toEqual({ crossed: true, acknowledged: false });
    expect(mockPublishConversationRelatedEvent).not.toHaveBeenCalled();
  });

  it("throws (instead of pausing) on a non-deletion failure to load agent loop data", async () => {
    mockCheckCreditSpendCheckpointGate.mockResolvedValue({
      crossed: true,
      thresholdAwuCredits: 1500,
    });
    mockGetFullAgentLoopDataWithAuth.mockResolvedValue({
      isErr: () => true,
      error: new Error("transient_db_error"),
    });
    mockIsAgentLoopDataSoftDeleteError.mockReturnValue(false);

    await expect(
      checkCreditSpendCheckpointActivity({} as never, {
        agentLoopArgs: {} as never,
      })
    ).rejects.toThrow("transient_db_error");

    expect(mockAgentMessageModelUpdate).not.toHaveBeenCalled();
    expect(mockPublishConversationRelatedEvent).not.toHaveBeenCalled();
  });

  it("still reports crossed when the pause is persisted but the notification fails", async () => {
    mockCheckCreditSpendCheckpointGate.mockResolvedValue({
      crossed: true,
      thresholdAwuCredits: 1500,
    });
    mockGetFullAgentLoopDataWithAuth.mockResolvedValue({
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

    const result = await checkCreditSpendCheckpointActivity({} as never, {
      agentLoopArgs: {
        conversationId: "conv_id",
        agentMessageId: "msg_id",
      } as never,
    });

    expect(result).toEqual({ crossed: true, acknowledged: false });
    expect(mockAgentMessageModelUpdate).toHaveBeenCalled();
  });
});

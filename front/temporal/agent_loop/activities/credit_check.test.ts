import {
  checkCreditsActivity,
  checkWorkflowAlertThresholdActivity,
} from "@app/temporal/agent_loop/activities/credit_check";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFromJson,
  mockCheckPoolCreditGate,
  mockCheckWorkflowAlertThresholdGate,
  mockGetAgentLoopData,
  mockIsAgentLoopDataSoftDeleteError,
  mockPublishConversationRelatedEvent,
  mockMessageModelFindOne,
  mockAgentMessageModelUpdate,
  mockMarkAsActionRequired,
} = vi.hoisted(() => ({
  mockFromJson: vi.fn(),
  mockCheckPoolCreditGate: vi.fn(),
  mockCheckWorkflowAlertThresholdGate: vi.fn(),
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
  checkWorkflowAlertThresholdGate: mockCheckWorkflowAlertThresholdGate,
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

describe("checkWorkflowAlertThresholdActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromJson.mockResolvedValue(FAKE_AUTH);
    mockMessageModelFindOne.mockResolvedValue(null);
  });

  it("returns crossed: false without checking the gate once acknowledged", async () => {
    mockMessageModelFindOne.mockResolvedValue({
      agentMessage: { workflowAlertThresholdStatus: "acknowledged" },
    });

    const result = await checkWorkflowAlertThresholdActivity({} as never, {
      agentLoopArgs: { agentMessageId: "msg_id" } as never,
    });

    expect(result).toEqual({ crossed: false });
    expect(mockCheckWorkflowAlertThresholdGate).not.toHaveBeenCalled();
  });

  it("does not load the conversation or publish when the gate says not crossed", async () => {
    mockCheckWorkflowAlertThresholdGate.mockResolvedValue({ crossed: false });

    const result = await checkWorkflowAlertThresholdActivity({} as never, {
      agentLoopArgs: {} as never,
    });

    expect(result).toEqual({ crossed: false });
    expect(mockGetAgentLoopData).not.toHaveBeenCalled();
    expect(mockPublishConversationRelatedEvent).not.toHaveBeenCalled();
  });

  it("loads the conversation and publishes a notification event when crossed", async () => {
    mockCheckWorkflowAlertThresholdGate.mockResolvedValue({
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

    const result = await checkWorkflowAlertThresholdActivity({} as never, {
      agentLoopArgs: {
        conversationId: "conv_id",
        agentMessageId: "msg_id",
      } as never,
    });

    expect(result).toEqual({ crossed: true });
    expect(mockPublishConversationRelatedEvent).toHaveBeenCalledWith({
      conversationId: "conv_id",
      step: 2,
      event: {
        type: "agent_workflow_alert_threshold_crossed",
        created: expect.any(Number),
        configurationId: "agent_config_id",
        messageId: "msg_id",
        thresholdAwuCredits: 1500,
      },
    });
  });

  it("still reports crossed but skips publishing when the message was soft-deleted", async () => {
    mockCheckWorkflowAlertThresholdGate.mockResolvedValue({
      crossed: true,
      thresholdAwuCredits: 1500,
    });
    mockGetAgentLoopData.mockResolvedValue({
      isErr: () => true,
      error: new Error("agent_message_deleted"),
    });
    mockIsAgentLoopDataSoftDeleteError.mockReturnValue(true);

    const result = await checkWorkflowAlertThresholdActivity({} as never, {
      agentLoopArgs: {} as never,
    });

    expect(result).toEqual({ crossed: true });
    expect(mockPublishConversationRelatedEvent).not.toHaveBeenCalled();
  });
});

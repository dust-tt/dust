import {
  checkCreditSpendCheckpointActivity,
  checkCreditsActivity,
} from "@app/temporal/agent_loop/activities/credit_check";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFromJson,
  mockCheckPoolCreditGate,
  mockIsCreditSpendCheckpointExempt,
  mockFetchCheckpointContext,
} = vi.hoisted(() => ({
  mockFromJson: vi.fn(),
  mockCheckPoolCreditGate: vi.fn(),
  mockIsCreditSpendCheckpointExempt: vi.fn(),
  mockFetchCheckpointContext: vi.fn(),
}));

vi.mock("@app/lib/auth", () => ({
  Authenticator: { fromJsonWithRefrehedGroups: mockFromJson },
}));

vi.mock("@app/lib/api/assistant/credit_check", () => ({
  checkPoolCreditGate: mockCheckPoolCreditGate,
  isCreditSpendCheckpointExempt: mockIsCreditSpendCheckpointExempt,
}));

vi.mock("@app/lib/resources/conversation_resource", () => ({
  ConversationResource: {
    fetchCreditSpendCheckpointContextForAgentMessage:
      mockFetchCheckpointContext,
  },
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

describe("checkCreditSpendCheckpointActivity (pure decision)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromJson.mockResolvedValue(FAKE_AUTH);
    mockIsCreditSpendCheckpointExempt.mockReturnValue(false);
    mockFetchCheckpointContext.mockResolvedValue({
      status: null,
      isRootAgentMessage: true,
    });
  });

  it("is not crossed when this execution is exempt, without reading the message", async () => {
    mockIsCreditSpendCheckpointExempt.mockReturnValue(true);

    const result = await checkCreditSpendCheckpointActivity({} as never, {
      agentLoopArgs: { userMessageOrigin: "api" } as never,
    });

    expect(mockIsCreditSpendCheckpointExempt).toHaveBeenCalledWith(FAKE_AUTH, {
      userMessageOrigin: "api",
    });
    expect(mockFetchCheckpointContext).not.toHaveBeenCalled();
    expect(result).toEqual({ crossed: false });
  });

  it("passes userMessageOrigin: null when the args don't carry one", async () => {
    await checkCreditSpendCheckpointActivity({} as never, {
      agentLoopArgs: {} as never,
    });

    expect(mockIsCreditSpendCheckpointExempt).toHaveBeenCalledWith(FAKE_AUTH, {
      userMessageOrigin: null,
    });
  });

  it("is not crossed when the agent message cannot be found", async () => {
    mockFetchCheckpointContext.mockResolvedValue(null);

    const result = await checkCreditSpendCheckpointActivity({} as never, {
      agentLoopArgs: { agentMessageId: "msg_id" } as never,
    });

    expect(result).toEqual({ crossed: false });
  });

  it("is not crossed once acknowledged", async () => {
    mockFetchCheckpointContext.mockResolvedValue({
      status: "acknowledged",
      isRootAgentMessage: true,
    });

    const result = await checkCreditSpendCheckpointActivity({} as never, {
      agentLoopArgs: { agentMessageId: "msg_id" } as never,
    });

    expect(result).toEqual({ crossed: false });
  });

  it("is not crossed for sub-agent messages", async () => {
    mockFetchCheckpointContext.mockResolvedValue({
      status: null,
      isRootAgentMessage: false,
    });

    const result = await checkCreditSpendCheckpointActivity({} as never, {
      agentLoopArgs: {
        agentMessageId: "msg_id",
        userMessageId: "user_msg_id",
      } as never,
    });

    expect(mockFetchCheckpointContext).toHaveBeenCalledWith(FAKE_AUTH, {
      agentMessageId: "msg_id",
      userMessageId: "user_msg_id",
    });
    expect(result).toEqual({ crossed: false });
  });

  it("is crossed for a pausable root message", async () => {
    const result = await checkCreditSpendCheckpointActivity({} as never, {
      agentLoopArgs: {
        agentMessageId: "msg_id",
        userMessageOrigin: "web",
      } as never,
    });

    expect(result).toEqual({ crossed: true });
  });
});

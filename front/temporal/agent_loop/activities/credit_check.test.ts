import { checkCreditsActivity } from "@app/temporal/agent_loop/activities/credit_check";
import { AgentLoopDataError } from "@app/types/assistant/agent_run";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetAgentLoopData,
  mockCheckPoolCreditGate,
  mockUpdateResourceAndPublishEvent,
} = vi.hoisted(() => ({
  mockGetAgentLoopData: vi.fn(),
  mockCheckPoolCreditGate: vi.fn(),
  mockUpdateResourceAndPublishEvent: vi.fn(),
}));

vi.mock("@app/types/assistant/agent_run", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/types/assistant/agent_run")>();
  return {
    ...actual,
    getAgentLoopData: mockGetAgentLoopData,
  };
});

vi.mock("@app/lib/api/assistant/credit_check", () => ({
  checkPoolCreditGate: mockCheckPoolCreditGate,
}));

vi.mock("@app/temporal/agent_loop/activities/common", () => ({
  updateResourceAndPublishEvent: mockUpdateResourceAndPublishEvent,
}));

const FAKE_AUTH = {
  getNonNullableWorkspace: () => ({ sId: "ws_test" }),
  isAdmin: () => true,
} as never;
const FAKE_AGENT_CONFIGURATION = { sId: "agent_test" } as never;
const FAKE_AGENT_MESSAGE = { sId: "msg_test" } as never;
const FAKE_CONVERSATION = { sId: "conv_test" } as never;

function mockSuccessfulAgentLoopData() {
  mockGetAgentLoopData.mockResolvedValue(
    new Ok({
      auth: FAKE_AUTH,
      agentConfiguration: FAKE_AGENT_CONFIGURATION,
      agentMessage: FAKE_AGENT_MESSAGE,
      conversation: FAKE_CONVERSATION,
      userMessage: {} as never,
    })
  );
}

describe("checkCreditsActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns shouldStop=false when credits are not exhausted", async () => {
    mockSuccessfulAgentLoopData();
    mockCheckPoolCreditGate.mockResolvedValue({
      shouldStop: false,
      reason: null,
    });

    const result = await checkCreditsActivity({} as never, {
      agentLoopArgs: {} as never,
      runIds: [],
      step: 3,
    });

    expect(result).toEqual({ shouldStop: false });
    expect(mockUpdateResourceAndPublishEvent).not.toHaveBeenCalled();
  });

  it("calls the gate with this agent message's sId (not the numeric model id) and its runIds", async () => {
    mockSuccessfulAgentLoopData();
    mockCheckPoolCreditGate.mockResolvedValue({
      shouldStop: false,
      reason: null,
    });

    await checkCreditsActivity({} as never, {
      agentLoopArgs: {} as never,
      runIds: ["run1"],
      step: 2,
    });

    expect(mockCheckPoolCreditGate).toHaveBeenCalledWith(FAKE_AUTH, {
      agentMessageId: "msg_test",
      runIds: ["run1"],
    });
  });

  it("publishes a retryable agent_error and returns shouldStop=true when credits are exhausted", async () => {
    mockSuccessfulAgentLoopData();
    mockCheckPoolCreditGate.mockResolvedValue({
      shouldStop: true,
      reason: "credits_exhausted",
    });

    const result = await checkCreditsActivity({} as never, {
      agentLoopArgs: {} as never,
      runIds: ["run1", "run2"],
      step: 3,
    });

    expect(result).toEqual({ shouldStop: true });
    expect(mockUpdateResourceAndPublishEvent).toHaveBeenCalledTimes(1);

    const [, callArgs] = mockUpdateResourceAndPublishEvent.mock.calls[0];
    expect(callArgs.agentMessage).toBe(FAKE_AGENT_MESSAGE);
    expect(callArgs.conversation).toBe(FAKE_CONVERSATION);
    expect(callArgs.step).toBe(3);
    expect(callArgs.event).toMatchObject({
      type: "agent_error",
      configurationId: "agent_test",
      messageId: "msg_test",
      runIds: ["run1", "run2"],
      error: {
        code: "credits_exhausted",
        message:
          "Your workspace has run out of credits. Please purchase more credits to continue using Dust.",
        metadata: expect.objectContaining({ category: "credits_exhausted" }),
      },
    });
  });

  it("uses member wording when the actor is not an admin", async () => {
    const nonAdminAuth = {
      getNonNullableWorkspace: () => ({ sId: "ws_test" }),
      isAdmin: () => false,
    } as never;

    mockGetAgentLoopData.mockResolvedValue(
      new Ok({
        auth: nonAdminAuth,
        agentConfiguration: FAKE_AGENT_CONFIGURATION,
        agentMessage: FAKE_AGENT_MESSAGE,
        conversation: FAKE_CONVERSATION,
        userMessage: {} as never,
      })
    );
    mockCheckPoolCreditGate.mockResolvedValue({
      shouldStop: true,
      reason: "credits_exhausted",
    });

    await checkCreditsActivity({} as never, {
      agentLoopArgs: {} as never,
      runIds: ["run1"],
      step: 2,
    });

    const [, callArgs] = mockUpdateResourceAndPublishEvent.mock.calls[0];
    expect(callArgs.event.error.message).toBe(
      "Your workspace has run out of credits. Please contact your administrator to purchase more credits."
    );
  });

  it("returns shouldStop=false without throwing when the message was soft-deleted mid-loop", async () => {
    mockGetAgentLoopData.mockResolvedValue(
      new Err(new AgentLoopDataError("agent_message_deleted"))
    );

    const result = await checkCreditsActivity({} as never, {
      agentLoopArgs: {} as never,
      runIds: [],
      step: 1,
    });

    expect(result).toEqual({ shouldStop: false });
    expect(mockCheckPoolCreditGate).not.toHaveBeenCalled();
    expect(mockUpdateResourceAndPublishEvent).not.toHaveBeenCalled();
  });

  it("rethrows an unexpected (non-soft-delete) error fetching agent loop data", async () => {
    mockGetAgentLoopData.mockResolvedValue(new Err(new Error("db blip")));

    await expect(
      checkCreditsActivity({} as never, {
        agentLoopArgs: {} as never,
        runIds: [],
        step: 1,
      })
    ).rejects.toThrow("db blip");
  });
});

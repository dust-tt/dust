import { checkCreditsActivity } from "@app/temporal/agent_loop/activities/credit_check";
import { AgentLoopDataError } from "@app/types/assistant/agent_run";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetAgentLoopData, mockCheckPoolCreditGate } = vi.hoisted(() => ({
  mockGetAgentLoopData: vi.fn(),
  mockCheckPoolCreditGate: vi.fn(),
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

// Minimal stand-ins for the agent-loop-data shapes the activity reads. These are class/branded
// instances that can't be built structurally, so `as never` is the standard test-mock escape used
// across the suite; the gate itself is mocked, so only `agentMessage.sId`/`agentMessageId` matter.
const FAKE_AUTH = {
  getNonNullableWorkspace: () => ({ sId: "ws_test" }),
} as never;
const FAKE_AGENT_MESSAGE = { sId: "msg_test", agentMessageId: 42 } as never;

function mockSuccessfulAgentLoopData() {
  mockGetAgentLoopData.mockResolvedValue(
    new Ok({
      auth: FAKE_AUTH,
      agentConfiguration: { sId: "agent_test" } as never,
      agentMessage: FAKE_AGENT_MESSAGE,
      conversation: { sId: "conv_test" } as never,
      userMessage: {} as never,
    })
  );
}

// The activity is a pure decision now — it returns the gate's result verbatim and publishes
// nothing. The terminal stop event is published by finalizeCreditStoppedAgentLoopActivity (see
// finalize.test.ts), so the gate stays retry-safe and the stop is finalized once.
describe("checkCreditsActivity (pure decision)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the gate's no-stop result unchanged", async () => {
    mockSuccessfulAgentLoopData();
    mockCheckPoolCreditGate.mockResolvedValue({
      shouldStop: false,
      reason: null,
    });

    const result = await checkCreditsActivity({} as never, {
      agentLoopArgs: {} as never,
      runIds: [],
    });

    expect(result).toEqual({ shouldStop: false, reason: null });
  });

  it("returns the gate's stop result unchanged", async () => {
    mockSuccessfulAgentLoopData();
    mockCheckPoolCreditGate.mockResolvedValue({
      shouldStop: true,
      reason: "credits_exhausted",
    });

    const result = await checkCreditsActivity({} as never, {
      agentLoopArgs: {} as never,
      runIds: ["run1", "run2"],
    });

    expect(result).toEqual({ shouldStop: true, reason: "credits_exhausted" });
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
    });

    expect(mockCheckPoolCreditGate).toHaveBeenCalledWith(FAKE_AUTH, {
      agentMessageId: "msg_test",
      agentMessageModelId: 42,
      runIds: ["run1"],
      isFreeUsage: false,
    });
  });

  it("returns no-stop without calling the gate when the message was soft-deleted mid-loop", async () => {
    mockGetAgentLoopData.mockResolvedValue(
      new Err(new AgentLoopDataError("agent_message_deleted"))
    );

    const result = await checkCreditsActivity({} as never, {
      agentLoopArgs: {} as never,
      runIds: [],
    });

    expect(result).toEqual({ shouldStop: false, reason: null });
    expect(mockCheckPoolCreditGate).not.toHaveBeenCalled();
  });

  it("rethrows an unexpected (non-soft-delete) error fetching agent loop data", async () => {
    mockGetAgentLoopData.mockResolvedValue(new Err(new Error("db blip")));

    await expect(
      checkCreditsActivity({} as never, {
        agentLoopArgs: {} as never,
        runIds: [],
      })
    ).rejects.toThrow("db blip");
  });
});

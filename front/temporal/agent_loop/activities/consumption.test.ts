import { Authenticator } from "@app/lib/auth";
import {
  initializeConsumptionExecutionActivity,
  recordExecutionFinalized,
  recordExecutionStarted,
} from "@app/temporal/agent_loop/activities/consumption";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { AgentMessageConsumptionExecutionContext } from "@app/types/assistant/agent_message_consumption";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  append: vi.fn(),
  fetchCreditContext: vi.fn(),
  fetchExecutionStarted: vi.fn(),
  getFeatureFlags: vi.fn(),
  signal: vi.fn(),
}));

vi.mock("@app/lib/resources/agent_message_consumption_event_resource", () => ({
  AgentMessageConsumptionEventResource: {
    append: mocks.append,
    fetchLatestExecutionStartedForAgentMessage: mocks.fetchExecutionStarted,
  },
}));

vi.mock("@app/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/auth")>()),
  getFeatureFlags: mocks.getFeatureFlags,
}));

vi.mock("@app/lib/resources/conversation_resource", () => ({
  ConversationResource: {
    fetchAgentMessageCreditContext: mocks.fetchCreditContext,
  },
}));

vi.mock("@app/temporal/credit_consumption/client", () => ({
  signalConsumptionEventsAppended: mocks.signal,
}));

let auth: Authenticator;

const agentLoopArgs = {
  agentMessageId: "message",
  agentMessageVersion: 0,
  conversationId: "conversation",
  conversationTitle: null,
  userMessageId: "user-message",
  userMessageOrigin: "web",
  userMessageVersion: 0,
} satisfies AgentLoopArgs;

const legacyAgentLoopArgs = {
  ...agentLoopArgs,
  rootAgentMessageId: "root-message",
  runKey: "execution",
};

const consumptionContext: AgentMessageConsumptionExecutionContext = {
  mode: "shadow",
  rootAgentMessageModelId: 24,
  runKey: "execution",
};

describe("consumption execution events", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const workspace = await WorkspaceFactory.basic({
      metronomeCustomerId: "customer",
    });
    auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    vi.spyOn(Authenticator, "fromJSON").mockResolvedValue(auth);
    mocks.fetchCreditContext.mockImplementation(
      async (_auth, { agentMessageId }) => ({
        agentMessageModelId: agentMessageId === "root-message" ? 24 : 42,
        parentAgentMessageId: null,
        status: "created",
      })
    );
    mocks.getFeatureFlags.mockResolvedValue([
      "agent_message_consumption_writes",
    ]);
    mocks.fetchExecutionStarted.mockResolvedValue(null);
    mocks.signal.mockResolvedValue({ isErr: () => false });
  });

  it("opens an execution while its message is still running", async () => {
    await initializeConsumptionExecutionActivity(auth.toJSON(), {
      agentMessageId: agentLoopArgs.agentMessageId,
      canInitializeConsumption: true,
      runKey: "execution",
    });

    expect(mocks.append).toHaveBeenCalledWith(auth, {
      event: {
        kind: "execution_started",
        idempotencyKey: "execution:execution:started",
        runKey: "execution",
        rootAgentMessageModelId: 42,
        agentMessageModelId: 42,
        consumptionMode: "shadow",
      },
      transaction: expect.anything(),
    });
    expect(mocks.signal).toHaveBeenCalledOnce();
  });

  it("reuses the message credit context for a root execution", async () => {
    await recordExecutionStarted(
      auth,
      {
        ...agentLoopArgs,
        rootAgentMessageId: agentLoopArgs.agentMessageId,
        runKey: "execution",
      },
      { canInitializeConsumption: true }
    );

    expect(mocks.fetchCreditContext).toHaveBeenCalledOnce();
  });

  it("snapshots live billing without a Metronome customer", async () => {
    const workspace = await WorkspaceFactory.basic({
      metronomeCustomerId: null,
    });
    auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    vi.mocked(Authenticator.fromJSON).mockResolvedValue(auth);
    mocks.getFeatureFlags.mockResolvedValue([
      "agent_message_consumption_writes",
      "agent_message_consumption_bills",
    ]);

    await initializeConsumptionExecutionActivity(auth.toJSON(), {
      agentMessageId: agentLoopArgs.agentMessageId,
      canInitializeConsumption: true,
      runKey: "execution",
    });

    expect(mocks.append).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({
        event: expect.objectContaining({ consumptionMode: "live" }),
      })
    );
  });

  it("reuses the execution-started mode when the start activity retries", async () => {
    mocks.getFeatureFlags.mockResolvedValue([]);
    mocks.fetchExecutionStarted.mockResolvedValue({
      rootAgentMessageModelId: 24,
      consumptionMode: "live",
    });

    await initializeConsumptionExecutionActivity(auth.toJSON(), {
      agentMessageId: agentLoopArgs.agentMessageId,
      canInitializeConsumption: true,
      runKey: "execution",
    });

    expect(mocks.append).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({
        event: expect.objectContaining({
          consumptionMode: "live",
          idempotencyKey: "execution:execution:started",
        }),
      })
    );
    expect(mocks.signal).toHaveBeenCalledOnce();
    expect(mocks.getFeatureFlags).not.toHaveBeenCalled();
  });

  it("does not fail after persisting when signaling fails", async () => {
    mocks.signal.mockResolvedValue({
      error: new Error("Temporal unavailable"),
      isErr: () => true,
    });

    await expect(
      initializeConsumptionExecutionActivity(auth.toJSON(), {
        agentMessageId: agentLoopArgs.agentMessageId,
        canInitializeConsumption: true,
        runKey: "execution",
      })
    ).resolves.toEqual({
      mode: "shadow",
      rootAgentMessageModelId: 42,
      runKey: "execution",
    });
    expect(mocks.append).toHaveBeenCalledOnce();
  });

  it("keeps a step-zero resume on the existing pipeline", async () => {
    await initializeConsumptionExecutionActivity(auth.toJSON(), {
      agentMessageId: agentLoopArgs.agentMessageId,
      canInitializeConsumption: false,
      runKey: "execution",
    });

    expect(mocks.getFeatureFlags).not.toHaveBeenCalled();
    expect(mocks.append).not.toHaveBeenCalled();
    expect(mocks.signal).not.toHaveBeenCalled();
  });

  it("inherits consumption from the immediate parent execution", async () => {
    mocks.fetchExecutionStarted.mockResolvedValue({
      rootAgentMessageModelId: 24,
      consumptionMode: "shadow",
    });
    mocks.fetchCreditContext.mockImplementation(
      async (_auth, { agentMessageId }) =>
        agentMessageId === "parent-message"
          ? {
              agentMessageModelId: 23,
              parentAgentMessageId: null,
              status: "succeeded",
            }
          : {
              agentMessageModelId: 42,
              parentAgentMessageId: "parent-message",
              status: "created",
            }
    );

    await expect(
      initializeConsumptionExecutionActivity(auth.toJSON(), {
        agentMessageId: agentLoopArgs.agentMessageId,
        canInitializeConsumption: true,
        runKey: "execution",
      })
    ).resolves.toEqual(consumptionContext);

    expect(mocks.fetchExecutionStarted).toHaveBeenCalledWith(auth, {
      agentMessageModelId: 23,
    });
    expect(mocks.append).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({
        event: expect.objectContaining({
          rootAgentMessageModelId: 24,
          consumptionMode: "shadow",
        }),
      })
    );
    expect(mocks.getFeatureFlags).not.toHaveBeenCalled();
  });

  it("keeps a descendant off without a parent execution", async () => {
    mocks.fetchCreditContext.mockResolvedValue({
      agentMessageModelId: 42,
      parentAgentMessageId: "parent-message",
      status: "created",
    });
    mocks.fetchExecutionStarted.mockResolvedValue(null);

    await expect(
      initializeConsumptionExecutionActivity(auth.toJSON(), {
        agentMessageId: agentLoopArgs.agentMessageId,
        canInitializeConsumption: true,
        runKey: "execution",
      })
    ).resolves.toBeNull();

    expect(mocks.append).not.toHaveBeenCalled();
    expect(mocks.getFeatureFlags).not.toHaveBeenCalled();
  });

  it("closes an execution paused for approval", async () => {
    await recordExecutionFinalized(auth, agentLoopArgs, consumptionContext);

    expect(mocks.append).toHaveBeenCalledWith(auth, {
      event: {
        kind: "execution_finalized",
        idempotencyKey: "execution:execution:finalized",
        runKey: "execution",
        rootAgentMessageModelId: 24,
        agentMessageModelId: 42,
        consumptionMode: "shadow",
        status: "created",
      },
      transaction: expect.anything(),
    });
    expect(mocks.signal).toHaveBeenCalledOnce();
  });

  it("keeps the execution-started mode when feature flags change", async () => {
    mocks.fetchExecutionStarted.mockResolvedValue({
      rootAgentMessageModelId: 24,
      consumptionMode: "live",
    });
    mocks.getFeatureFlags.mockResolvedValue([]);

    await expect(
      recordExecutionFinalized(auth, legacyAgentLoopArgs)
    ).resolves.toBe("live");
    expect(mocks.append).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({
        event: expect.objectContaining({ consumptionMode: "live" }),
      })
    );
    expect(mocks.getFeatureFlags).not.toHaveBeenCalled();
  });

  it("does not finalize consumption without an execution-started event", async () => {
    await expect(
      recordExecutionFinalized(auth, legacyAgentLoopArgs)
    ).resolves.toBe(null);
    expect(mocks.append).not.toHaveBeenCalled();
    expect(mocks.signal).not.toHaveBeenCalled();
  });
});

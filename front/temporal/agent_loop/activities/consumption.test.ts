import { Authenticator } from "@app/lib/auth";
import {
  recordExecutionFinalized,
  recordExecutionStarted,
} from "@app/temporal/agent_loop/activities/consumption";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  append: vi.fn(),
  fetchCreditContext: vi.fn(),
  fetchLatestExecutionStarted: vi.fn(),
  getFeatureFlags: vi.fn(),
  signal: vi.fn(),
}));

vi.mock("@app/lib/resources/agent_message_consumption_event_resource", () => ({
  AgentMessageConsumptionEventResource: {
    append: mocks.append,
    fetchLatestExecutionStartedForAgentMessage:
      mocks.fetchLatestExecutionStarted,
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
  rootAgentMessageId: "root-message",
  runKey: "execution",
  userMessageId: "user-message",
  userMessageOrigin: "web",
  userMessageVersion: 0,
} satisfies AgentLoopArgs;

describe("consumption execution events", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const workspace = await WorkspaceFactory.basic({
      metronomeCustomerId: "customer",
    });
    auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    mocks.fetchCreditContext.mockImplementation(
      async (_auth, { agentMessageId }) => ({
        agentMessageModelId: agentMessageId === "root-message" ? 24 : 42,
        status: "created",
      })
    );
    mocks.getFeatureFlags.mockResolvedValue([
      "agent_message_consumption_writes",
    ]);
    mocks.fetchLatestExecutionStarted.mockResolvedValue(null);
    mocks.signal.mockResolvedValue(new Ok(undefined));
  });

  it("opens an execution while its message is still running", async () => {
    await recordExecutionStarted(auth, agentLoopArgs, {
      canInitializeConsumption: true,
    });

    expect(mocks.append).toHaveBeenCalledWith(auth, {
      event: {
        kind: "execution_started",
        idempotencyKey: "execution:execution:started",
        runKey: "execution",
        rootAgentMessageModelId: 24,
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
    mocks.getFeatureFlags.mockResolvedValue([
      "agent_message_consumption_writes",
      "agent_message_consumption_bills",
    ]);

    await recordExecutionStarted(auth, agentLoopArgs, {
      canInitializeConsumption: true,
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
    mocks.fetchLatestExecutionStarted.mockResolvedValue({
      rootAgentMessageModelId: 24,
      consumptionMode: "live",
    });

    await recordExecutionStarted(auth, agentLoopArgs, {
      canInitializeConsumption: true,
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

  it("keeps a pre-rollout step-zero resume on the existing pipeline", async () => {
    await recordExecutionStarted(auth, agentLoopArgs, {
      canInitializeConsumption: false,
    });

    expect(mocks.getFeatureFlags).not.toHaveBeenCalled();
    expect(mocks.append).not.toHaveBeenCalled();
    expect(mocks.signal).not.toHaveBeenCalled();
  });

  it("closes an execution paused for approval", async () => {
    mocks.fetchLatestExecutionStarted.mockResolvedValue({
      rootAgentMessageModelId: 24,
      consumptionMode: "shadow",
    });

    await recordExecutionFinalized(auth, agentLoopArgs);

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
    mocks.fetchLatestExecutionStarted.mockResolvedValue({
      rootAgentMessageModelId: 24,
      consumptionMode: "live",
    });
    mocks.getFeatureFlags.mockResolvedValue([]);

    const result = await recordExecutionFinalized(auth, agentLoopArgs);

    expect(result).toEqual(new Ok("live"));
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
      recordExecutionFinalized(auth, agentLoopArgs)
    ).resolves.toEqual(new Ok(null));
    expect(mocks.append).not.toHaveBeenCalled();
    expect(mocks.signal).not.toHaveBeenCalled();
  });

  it("returns start signaling failures", async () => {
    const error = new Error("signal failed");
    mocks.signal.mockResolvedValue(new Err(error));

    await expect(
      recordExecutionStarted(auth, agentLoopArgs, {
        canInitializeConsumption: true,
      })
    ).resolves.toEqual(new Err(error));
  });

  it("returns finalization signaling failures", async () => {
    const error = new Error("signal failed");
    mocks.fetchLatestExecutionStarted.mockResolvedValue({
      rootAgentMessageModelId: 24,
      consumptionMode: "shadow",
    });
    mocks.signal.mockResolvedValue(new Err(error));

    await expect(
      recordExecutionFinalized(auth, agentLoopArgs)
    ).resolves.toEqual(new Err(error));
  });
});

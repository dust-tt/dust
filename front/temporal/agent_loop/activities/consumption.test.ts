import type { Authenticator } from "@app/lib/auth";
import {
  initializeConsumptionExecutionActivity,
  recordExecutionFinalized,
} from "@app/temporal/agent_loop/activities/consumption";
import type { AgentMessageConsumptionExecutionContext } from "@app/types/assistant/agent_message_consumption";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  append: vi.fn(),
  fetchConsumptionRolloutMode: vi.fn(),
  fetchCreditContext: vi.fn(),
  findRootAgentMessageId: vi.fn(),
  getFeatureFlags: vi.fn(),
  getOrSetConsumptionMode: vi.fn(),
  signal: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/consumption/events", () => ({
  appendConsumptionEvent: mocks.append,
}));

vi.mock("@app/lib/auth", () => ({
  Authenticator: {
    fromJSON: vi.fn(async () => auth),
  },
  getFeatureFlags: mocks.getFeatureFlags,
}));

vi.mock("@app/lib/resources/conversation_resource", () => ({
  ConversationResource: {
    fetchAgentMessageConsumptionRolloutMode: mocks.fetchConsumptionRolloutMode,
    fetchAgentMessageCreditContext: mocks.fetchCreditContext,
    findRootAgentMessageId: mocks.findRootAgentMessageId,
    getOrSetAgentMessageConsumptionRolloutMode: mocks.getOrSetConsumptionMode,
  },
}));

vi.mock("@app/lib/utils/sql_utils", () => ({
  withTransaction: vi.fn(
    async (callback: (transaction: object) => Promise<unknown>) => callback({})
  ),
}));

vi.mock("@app/temporal/consumption/client", () => ({
  signalConsumptionEventsAppended: mocks.signal,
}));

const auth = {
  getNonNullableWorkspace: () => ({
    id: 1,
    sId: "workspace",
    metronomeCustomerId: "customer",
  }),
  toJSON: () => ({ workspaceId: "workspace" }),
} as unknown as Authenticator;

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
  rootAgentMessageId: "root-message",
  runKey: "execution",
};

describe("consumption execution events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchConsumptionRolloutMode.mockResolvedValue("shadow");
    mocks.fetchCreditContext.mockResolvedValue({
      agentMessageModelId: 42,
      status: "created",
    });
    mocks.getFeatureFlags.mockResolvedValue([
      "agent_message_consumption_writes",
    ]);
    mocks.getOrSetConsumptionMode.mockResolvedValue("shadow");
    mocks.findRootAgentMessageId.mockResolvedValue("root-message");
    mocks.signal.mockResolvedValue({ isErr: () => false });
  });

  it("opens an execution while its message is still running", async () => {
    await initializeConsumptionExecutionActivity(auth.toJSON(), {
      agentMessageId: agentLoopArgs.agentMessageId,
      runKey: "execution",
      startStep: 0,
    });

    expect(mocks.append).toHaveBeenCalledWith(
      auth,
      {
        kind: "execution_started",
        idempotencyKey: "execution:execution:started",
        runKey: "execution",
        rootAgentMessageId: "root-message",
        agentMessageModelId: 42,
        subagentAgentMessageId: 42,
        consumptionMode: "shadow",
      },
      { transaction: {} }
    );
    expect(mocks.signal).toHaveBeenCalledOnce();
  });

  it("snapshots live billing when the execution starts", async () => {
    mocks.getFeatureFlags.mockResolvedValue([
      "agent_message_consumption_writes",
      "agent_message_consumption_bills",
    ]);
    mocks.getOrSetConsumptionMode.mockResolvedValue("live");

    mocks.findRootAgentMessageId.mockResolvedValue("message");

    await initializeConsumptionExecutionActivity(auth.toJSON(), {
      agentMessageId: agentLoopArgs.agentMessageId,
      runKey: "execution",
      startStep: 0,
    });

    expect(mocks.append).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({ consumptionMode: "live" }),
      { transaction: {} }
    );
    expect(mocks.getOrSetConsumptionMode).toHaveBeenCalledWith(auth, {
      agentMessageId: "message",
      mode: "live",
      transaction: {},
    });
  });

  it("reuses the root message mode when the start activity retries", async () => {
    mocks.getFeatureFlags.mockResolvedValue([]);
    mocks.getOrSetConsumptionMode.mockResolvedValue("live");

    mocks.findRootAgentMessageId.mockResolvedValue("message");

    await initializeConsumptionExecutionActivity(auth.toJSON(), {
      agentMessageId: agentLoopArgs.agentMessageId,
      runKey: "execution",
      startStep: 0,
    });

    expect(mocks.append).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({
        consumptionMode: "live",
        idempotencyKey: "execution:execution:started",
      }),
      { transaction: {} }
    );
    expect(mocks.signal).toHaveBeenCalledOnce();
  });

  it("keeps a pre-rollout resumed message on the existing pipeline", async () => {
    mocks.getOrSetConsumptionMode.mockResolvedValue("off");

    mocks.findRootAgentMessageId.mockResolvedValue("message");

    await initializeConsumptionExecutionActivity(auth.toJSON(), {
      agentMessageId: agentLoopArgs.agentMessageId,
      runKey: "execution",
      startStep: 2,
    });

    expect(mocks.getOrSetConsumptionMode).toHaveBeenCalledWith(auth, {
      agentMessageId: "message",
      mode: "off",
      transaction: {},
    });
    expect(mocks.getFeatureFlags).not.toHaveBeenCalled();
    expect(mocks.append).not.toHaveBeenCalled();
    expect(mocks.signal).not.toHaveBeenCalled();
  });

  it("keeps a descendant off when its root has no rollout snapshot", async () => {
    mocks.getOrSetConsumptionMode.mockResolvedValue("off");

    await initializeConsumptionExecutionActivity(auth.toJSON(), {
      agentMessageId: agentLoopArgs.agentMessageId,
      runKey: "execution",
      startStep: 0,
    });

    expect(mocks.getOrSetConsumptionMode).toHaveBeenCalledWith(auth, {
      agentMessageId: "root-message",
      mode: "off",
      transaction: {},
    });
    expect(mocks.getFeatureFlags).not.toHaveBeenCalled();
    expect(mocks.append).not.toHaveBeenCalled();
  });

  it("closes an execution paused for approval", async () => {
    await recordExecutionFinalized(auth, agentLoopArgs, consumptionContext);

    expect(mocks.append).toHaveBeenCalledWith(
      auth,
      {
        kind: "execution_finalized",
        idempotencyKey: "execution:execution:finalized",
        runKey: "execution",
        rootAgentMessageId: "root-message",
        agentMessageModelId: 42,
        consumptionMode: "shadow",
        status: "created",
      },
      { transaction: {} }
    );
    expect(mocks.signal).toHaveBeenCalledOnce();
  });

  it("keeps the persisted mode when feature flags change", async () => {
    mocks.fetchConsumptionRolloutMode.mockResolvedValue("live");
    mocks.getFeatureFlags.mockResolvedValue([]);

    await expect(
      recordExecutionFinalized(auth, legacyAgentLoopArgs)
    ).resolves.toBe("live");
    expect(mocks.append).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({ consumptionMode: "live" }),
      { transaction: {} }
    );
    expect(mocks.getFeatureFlags).not.toHaveBeenCalled();
  });

  it("does not finalize consumption when the root mode is off", async () => {
    mocks.fetchConsumptionRolloutMode.mockResolvedValue("off");

    await expect(
      recordExecutionFinalized(auth, legacyAgentLoopArgs)
    ).resolves.toBe(null);
    expect(mocks.append).not.toHaveBeenCalled();
    expect(mocks.signal).not.toHaveBeenCalled();
  });
});

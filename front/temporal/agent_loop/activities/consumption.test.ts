import { Authenticator } from "@app/lib/auth";
import { GroupPermissions } from "@app/lib/resources/group_permission_registry";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
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
  fetchParentExecution: vi.fn(),
  getFeatureFlags: vi.fn(),
  getOrSetConsumptionMode: vi.fn(),
  signal: vi.fn(),
}));

vi.mock("@app/lib/resources/agent_message_consumption_event_resource", () => ({
  AgentMessageConsumptionEventResource: {
    append: mocks.append,
    fetchLatestExecutionStartedForAgentMessage: mocks.fetchParentExecution,
  },
}));

vi.mock("@app/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/auth")>()),
  getFeatureFlags: mocks.getFeatureFlags,
}));

vi.mock("@app/lib/resources/conversation_resource", () => ({
  ConversationResource: {
    fetchAgentMessageConsumptionRolloutMode: mocks.fetchConsumptionRolloutMode,
    fetchAgentMessageCreditContext: mocks.fetchCreditContext,
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
  rootAgentMessageId: 24,
  runKey: "execution",
};

describe("consumption execution events", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const workspace = await WorkspaceResource.makeNew({
      sId: "workspace",
      name: "Workspace",
      description: null,
      workOSOrganizationId: null,
      metronomeCustomerId: "customer",
    });
    auth = new Authenticator({
      workspace,
      role: "admin",
      groupModelIds: [],
      authMethod: "internal",
      permissions: GroupPermissions.empty(),
    });
    vi.spyOn(Authenticator, "fromJSON").mockResolvedValue(auth);
    mocks.fetchConsumptionRolloutMode.mockResolvedValue("shadow");
    mocks.fetchCreditContext.mockImplementation(
      async (_auth, { agentMessageId }) => ({
        agentMessageModelId: agentMessageId === "root-message" ? 24 : 42,
        parentAgentMessageId: null,
        status: "created",
      })
    );
    mocks.fetchParentExecution.mockResolvedValue({
      rootAgentMessageId: 24,
      consumptionMode: "shadow",
    });
    mocks.getFeatureFlags.mockResolvedValue([
      "agent_message_consumption_writes",
    ]);
    mocks.getOrSetConsumptionMode.mockResolvedValue("shadow");
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
        event: {
          kind: "execution_started",
          idempotencyKey: "execution:execution:started",
          runKey: "execution",
          rootAgentMessageId: 42,
          agentMessageModelId: 42,
          consumptionMode: "shadow",
        },
        transaction: {},
      },
    );
    expect(mocks.signal).toHaveBeenCalledOnce();
  });

  it("snapshots live billing when the execution starts", async () => {
    mocks.getFeatureFlags.mockResolvedValue([
      "agent_message_consumption_writes",
      "agent_message_consumption_bills",
    ]);
    mocks.getOrSetConsumptionMode.mockResolvedValue("live");

    await initializeConsumptionExecutionActivity(auth.toJSON(), {
      agentMessageId: agentLoopArgs.agentMessageId,
      runKey: "execution",
      startStep: 0,
    });

    expect(mocks.append).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({
        event: expect.objectContaining({ consumptionMode: "live" }),
      })
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

    await initializeConsumptionExecutionActivity(auth.toJSON(), {
      agentMessageId: agentLoopArgs.agentMessageId,
      runKey: "execution",
      startStep: 0,
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
  });

  it("does not fail after persisting when signaling fails", async () => {
    mocks.signal.mockResolvedValue({
      error: new Error("Temporal unavailable"),
      isErr: () => true,
    });

    await expect(
      initializeConsumptionExecutionActivity(auth.toJSON(), {
        agentMessageId: agentLoopArgs.agentMessageId,
        runKey: "execution",
        startStep: 0,
      })
    ).resolves.toEqual({
      mode: "shadow",
      rootAgentMessageId: 42,
      runKey: "execution",
    });
    expect(mocks.append).toHaveBeenCalledOnce();
  });

  it("keeps a pre-rollout resumed message on the existing pipeline", async () => {
    mocks.getOrSetConsumptionMode.mockResolvedValue("off");

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

  it("inherits consumption from the immediate parent execution", async () => {
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
        runKey: "execution",
        startStep: 0,
      })
    ).resolves.toEqual(consumptionContext);

    expect(mocks.fetchParentExecution).toHaveBeenCalledWith(auth, {
      agentMessageModelId: 23,
    });
    expect(mocks.append).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({
        event: expect.objectContaining({
          rootAgentMessageId: 24,
          consumptionMode: "shadow",
        }),
      })
    );
    expect(mocks.getOrSetConsumptionMode).not.toHaveBeenCalled();
    expect(mocks.getFeatureFlags).not.toHaveBeenCalled();
  });

  it("keeps a descendant off without a parent execution", async () => {
    mocks.fetchCreditContext.mockResolvedValue({
      agentMessageModelId: 42,
      parentAgentMessageId: "parent-message",
      status: "created",
    });
    mocks.fetchParentExecution.mockResolvedValue(null);

    await expect(
      initializeConsumptionExecutionActivity(auth.toJSON(), {
        agentMessageId: agentLoopArgs.agentMessageId,
        runKey: "execution",
        startStep: 0,
      })
    ).resolves.toBeNull();

    expect(mocks.append).not.toHaveBeenCalled();
    expect(mocks.getOrSetConsumptionMode).not.toHaveBeenCalled();
    expect(mocks.getFeatureFlags).not.toHaveBeenCalled();
  });

  it("closes an execution paused for approval", async () => {
    await recordExecutionFinalized(auth, agentLoopArgs, consumptionContext);

    expect(mocks.append).toHaveBeenCalledWith(
      auth,
      {
        event: {
          kind: "execution_finalized",
          idempotencyKey: "execution:execution:finalized",
          runKey: "execution",
          rootAgentMessageId: 24,
          agentMessageModelId: 42,
          consumptionMode: "shadow",
          status: "created",
        },
        transaction: {},
      },
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
      expect.objectContaining({
        event: expect.objectContaining({ consumptionMode: "live" }),
      })
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

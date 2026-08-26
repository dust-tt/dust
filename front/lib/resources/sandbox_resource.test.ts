import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDistribution,
  mockExecuteWithLock,
  mockGetSandboxImage,
  mockGetSandboxProvider,
  mockProviderCreate,
  mockProviderDestroy,
  mockProviderExec,
  mockProviderWake,
  mockRevokeAllExecTokensForSandbox,
} = vi.hoisted(() => ({
  mockDistribution: vi.fn(),
  mockExecuteWithLock: vi.fn(),
  mockGetSandboxImage: vi.fn(),
  mockGetSandboxProvider: vi.fn(),
  mockProviderCreate: vi.fn(),
  mockProviderDestroy: vi.fn(),
  mockProviderExec: vi.fn(),
  mockProviderWake: vi.fn(),
  mockRevokeAllExecTokensForSandbox: vi.fn(),
}));

vi.mock("@app/lib/utils/statsd", () => ({
  getStatsDClient: () => ({
    increment: vi.fn(),
    distribution: mockDistribution,
  }),
}));

vi.mock("@app/lib/api/sandbox", () => ({
  getSandboxProvider: mockGetSandboxProvider,
}));

vi.mock("@app/lib/api/sandbox/access_tokens", () => ({
  revokeAllExecTokensForSandbox: mockRevokeAllExecTokensForSandbox,
}));

vi.mock("@app/lib/api/sandbox/image", () => ({
  getSandboxImage: mockGetSandboxImage,
}));

vi.mock("@app/lib/lock", () => ({
  executeWithLock: mockExecuteWithLock,
}));

import { SandboxNotFoundError } from "@app/lib/api/sandbox/provider";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationSandboxAdapter } from "@app/lib/resources/conversation_sandbox_adapter";
import { PodSandboxAdapter } from "@app/lib/resources/pod_sandbox_adapter";
import { SandboxEnvVarResource } from "@app/lib/resources/sandbox_env_var_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import {
  SandboxModel,
  SandboxOwnerModel,
} from "@app/lib/resources/storage/models/sandbox";
import { SandboxEnvVarModel } from "@app/lib/resources/storage/models/sandbox_env_var";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { ConversationType } from "@app/types/assistant/conversation";
import { Err, Ok } from "@app/types/shared/result";
import { encrypt } from "@app/types/shared/utils/encryption";
import type { WhereOptions } from "sequelize";

describe("SandboxResource.updateStatus", () => {
  let authenticator: Authenticator;
  let conversation: ConversationType;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExecuteWithLock.mockImplementation(
      async (_key: string, fn: () => Promise<unknown>) => fn()
    );
    mockGetSandboxProvider.mockReturnValue({
      destroy: mockProviderDestroy,
    });
    mockProviderDestroy.mockResolvedValue(new Ok(undefined));
    mockRevokeAllExecTokensForSandbox.mockResolvedValue(undefined);

    const testSetup = await createResourceTest({ role: "admin" });
    authenticator = testSetup.authenticator;

    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });
  });

  it("records state duration when statusChangedAt exists", async () => {
    const sandbox = await SandboxFactory.create(authenticator, conversation, {
      status: "running",
      statusChangedAt: new Date(Date.now() - 60_000),
    });

    await sandbox.updateStatus("sleeping");

    expect(mockDistribution).toHaveBeenCalledWith(
      "sandbox.lifecycle.duration",
      expect.any(Number),
      [expect.stringMatching(/^region:/), "status:running"]
    );

    const durationArg = mockDistribution.mock.calls[0][1];
    expect(durationArg).toBeGreaterThanOrEqual(60_000);
    expect(durationArg).toBeLessThan(65_000);
  });

  it("skips duration recording when statusChangedAt is null", async () => {
    const sandbox = await SandboxFactory.create(authenticator, conversation, {
      status: "running",
      statusChangedAt: null,
    });

    await sandbox.updateStatus("sleeping");

    expect(mockDistribution).not.toHaveBeenCalled();
  });

  it("does nothing when transitioning to same status", async () => {
    const sandbox = await SandboxFactory.create(authenticator, conversation, {
      status: "running",
      statusChangedAt: new Date(),
    });

    const originalStatusChangedAt = sandbox.statusChangedAt;
    await sandbox.updateStatus("running");

    expect(mockDistribution).not.toHaveBeenCalled();

    const reloaded = await ConversationSandboxAdapter.fetchSandbox(
      authenticator,
      conversation
    );
    expect(reloaded?.statusChangedAt?.getTime()).toBe(
      originalStatusChangedAt?.getTime()
    );
  });

  it("updates status and statusChangedAt", async () => {
    const originalTime = new Date(Date.now() - 60_000);
    const sandbox = await SandboxFactory.create(authenticator, conversation, {
      status: "running",
      statusChangedAt: originalTime,
    });

    const beforeTransition = Date.now();
    await sandbox.updateStatus("sleeping");
    const afterTransition = Date.now();

    const reloaded = await ConversationSandboxAdapter.fetchSandbox(
      authenticator,
      conversation
    );
    expect(reloaded?.status).toBe("sleeping");
    expect(reloaded?.statusChangedAt?.getTime()).toBeGreaterThanOrEqual(
      beforeTransition
    );
    expect(reloaded?.statusChangedAt?.getTime()).toBeLessThanOrEqual(
      afterTransition
    );
  });
});

describe("ConversationSandboxAdapter.withScopeTransition", () => {
  let authenticator: Authenticator;
  let conversationResource: ConversationResource;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExecuteWithLock.mockImplementation(
      async (_key: string, fn: () => Promise<unknown>) => fn()
    );
    mockGetSandboxProvider.mockReturnValue({
      destroy: mockProviderDestroy,
    });
    mockProviderDestroy.mockResolvedValue(new Ok(undefined));

    const testSetup = await createResourceTest({ role: "admin" });
    authenticator = testSetup.authenticator;

    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });
    const fetched = await ConversationResource.fetchById(
      authenticator,
      conversation.sId
    );
    if (!fetched) {
      throw new Error("Conversation not found.");
    }
    conversationResource = fetched;
  });

  it("validates, destroys, marks deleted, and commits in order under the lock", async () => {
    const sandbox = await SandboxFactory.create(
      authenticator,
      conversationResource.toJSON()
    );
    const prepare = vi.fn().mockResolvedValue(new Ok("validated"));
    const commit = vi.fn().mockResolvedValue(new Ok("moved"));

    const result = await ConversationSandboxAdapter.withScopeTransition(
      authenticator,
      conversationResource,
      { prepare, commit }
    );

    expect(result).toEqual(new Ok("moved"));
    // Both callbacks receive the conversation as re-fetched under the lock —
    // a fresh resource, not the caller's object.
    const freshArg = prepare.mock.calls[0][0];
    expect(freshArg).toBeInstanceOf(ConversationResource);
    expect(freshArg).not.toBe(conversationResource);
    expect(freshArg.sId).toBe(conversationResource.sId);
    expect(commit).toHaveBeenCalledWith(
      expect.any(ConversationResource),
      "validated"
    );
    // Ordering: validate BEFORE the destroy, commit after it.
    expect(prepare.mock.invocationCallOrder[0]).toBeLessThan(
      mockProviderDestroy.mock.invocationCallOrder[0]
    );
    expect(mockProviderDestroy.mock.invocationCallOrder[0]).toBeLessThan(
      commit.mock.invocationCallOrder[0]
    );
    expect(mockProviderDestroy).toHaveBeenCalledWith(sandbox.providerId, {
      workspaceId: authenticator.getNonNullableWorkspace().sId,
    });
    // The row survives as deleted with its owner link intact, so the next
    // access recreates it in place from the post-transition scope.
    const reloaded = await ConversationSandboxAdapter.fetchSandbox(
      authenticator,
      conversationResource
    );
    expect(reloaded?.status).toBe("deleted");
    expect(reloaded?.killRequestedAt).toEqual(expect.any(Date));
  });

  it("leaves the runtime untouched when validation fails", async () => {
    await SandboxFactory.create(authenticator, conversationResource.toJSON());
    const validationError = new Error("not allowed");
    const prepare = vi.fn().mockResolvedValue(new Err(validationError));
    const commit = vi.fn().mockResolvedValue(new Ok(undefined));

    const result = await ConversationSandboxAdapter.withScopeTransition(
      authenticator,
      conversationResource,
      { prepare, commit }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(validationError);
    }
    expect(commit).not.toHaveBeenCalled();
    // A rejected move must not grief the sandbox: no destroy, no kill mark.
    expect(mockProviderDestroy).not.toHaveBeenCalled();
    const reloaded = await ConversationSandboxAdapter.fetchSandbox(
      authenticator,
      conversationResource
    );
    expect(reloaded?.status).toBe("running");
    expect(reloaded?.killRequestedAt).toBeNull();
  });

  it("fails the transition when the provider destroy fails, leaving the kill request", async () => {
    await SandboxFactory.create(authenticator, conversationResource.toJSON());
    mockProviderDestroy.mockResolvedValue(
      new Err(new Error("provider unavailable"))
    );
    const commit = vi.fn().mockResolvedValue(new Ok(undefined));

    const result = await ConversationSandboxAdapter.withScopeTransition(
      authenticator,
      conversationResource,
      { prepare: async () => new Ok(undefined), commit }
    );

    expect(result.isErr()).toBe(true);
    expect(commit).not.toHaveBeenCalled();
    // killRequestedAt was set before the provider call: the next access (or
    // the reaper) completes the reset even though this transition failed.
    const reloaded = await ConversationSandboxAdapter.fetchSandbox(
      authenticator,
      conversationResource
    );
    expect(reloaded?.status).not.toBe("deleted");
    expect(reloaded?.killRequestedAt).toEqual(expect.any(Date));
  });

  it("treats provider NotFound as already destroyed and proceeds", async () => {
    await SandboxFactory.create(authenticator, conversationResource.toJSON());
    mockProviderDestroy.mockResolvedValue(
      new Err(new SandboxNotFoundError("gone"))
    );
    const commit = vi.fn().mockResolvedValue(new Ok(undefined));

    const result = await ConversationSandboxAdapter.withScopeTransition(
      authenticator,
      conversationResource,
      { prepare: async () => new Ok(undefined), commit }
    );

    expect(result.isOk()).toBe(true);
    expect(commit).toHaveBeenCalledTimes(1);
    const reloaded = await ConversationSandboxAdapter.fetchSandbox(
      authenticator,
      conversationResource
    );
    expect(reloaded?.status).toBe("deleted");
  });

  it("runs the transition without provider calls when no sandbox exists", async () => {
    const commit = vi.fn().mockResolvedValue(new Ok(undefined));

    const result = await ConversationSandboxAdapter.withScopeTransition(
      authenticator,
      conversationResource,
      { prepare: async () => new Ok(undefined), commit }
    );

    expect(result.isOk()).toBe(true);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(mockProviderDestroy).not.toHaveBeenCalled();
  });

  it("marks the sandbox deleted without a provider call when no provider is configured", async () => {
    // Environments without a sandbox provider still move conversations: the
    // runtime destroy is vacuous (nothing can be running), the transition is
    // mandatory.
    mockGetSandboxProvider.mockReturnValue(undefined);
    await SandboxFactory.create(authenticator, conversationResource.toJSON());
    const commit = vi.fn().mockResolvedValue(new Ok(undefined));

    const result = await ConversationSandboxAdapter.withScopeTransition(
      authenticator,
      conversationResource,
      { prepare: async () => new Ok(undefined), commit }
    );

    expect(result.isOk()).toBe(true);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(mockProviderDestroy).not.toHaveBeenCalled();
    const reloaded = await ConversationSandboxAdapter.fetchSandbox(
      authenticator,
      conversationResource
    );
    expect(reloaded?.status).toBe("deleted");
  });
});

describe("ConversationSandboxAdapter.dangerouslyDestroySandboxIfSleeping", () => {
  let authenticator: Authenticator;
  let conversationResource: ConversationResource;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExecuteWithLock.mockImplementation(
      async (_key: string, fn: () => Promise<unknown>) => fn()
    );
    mockGetSandboxProvider.mockReturnValue({
      destroy: mockProviderDestroy,
    });
    mockProviderDestroy.mockResolvedValue(new Ok(undefined));
    mockRevokeAllExecTokensForSandbox.mockResolvedValue(undefined);

    const testSetup = await createResourceTest({ role: "admin" });
    authenticator = testSetup.authenticator;

    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });
    const fetched = await ConversationResource.fetchById(
      authenticator,
      conversation.sId
    );
    if (!fetched) {
      throw new Error("Conversation not found.");
    }
    conversationResource = fetched;
  });

  it("deletes the sandbox egress policy after provider destroy succeeds", async () => {
    const sandbox = await SandboxFactory.create(
      authenticator,
      conversationResource.toJSON(),
      {
        status: "sleeping",
      }
    );

    const result =
      await ConversationSandboxAdapter.dangerouslyDestroySandboxIfSleeping(
        authenticator,
        conversationResource
      );

    expect(result.isOk()).toBe(true);
    expect(mockProviderDestroy).toHaveBeenCalledWith(sandbox.providerId, {
      workspaceId: authenticator.getNonNullableWorkspace().sId,
    });

    const reloaded = await ConversationSandboxAdapter.fetchSandbox(
      authenticator,
      conversationResource.toJSON()
    );
    expect(reloaded?.status).toBe("deleted");
  });

  it("does not operate on a sandbox when ownership is missing", async () => {
    const sandbox = await SandboxFactory.create(
      authenticator,
      conversationResource.toJSON(),
      {
        status: "sleeping",
      }
    );

    const where: WhereOptions = {
      sandboxId: sandbox.id,
      workspaceId: authenticator.getNonNullableWorkspace().id,
    };
    await SandboxOwnerModel.destroy({ where });

    const result =
      await ConversationSandboxAdapter.dangerouslyDestroySandboxIfSleeping(
        authenticator,
        conversationResource
      );

    expect(result.isOk()).toBe(true);
    expect(mockProviderDestroy).not.toHaveBeenCalled();

    const row = await SandboxModel.findOne({
      where: {
        id: sandbox.id,
        workspaceId: authenticator.getNonNullableWorkspace().id,
      },
    });
    expect(row?.status).toBe("sleeping");
  });

  it("deleteSandbox deletes the owner link and sandbox row", async () => {
    const sandbox = await SandboxFactory.create(
      authenticator,
      conversationResource.toJSON()
    );
    const workspaceModelId = authenticator.getNonNullableWorkspace().id;

    const result = await ConversationSandboxAdapter.deleteSandbox(
      authenticator,
      conversationResource
    );

    expect(result.isOk()).toBe(true);
    const [linkCount, sandboxCount] = await Promise.all([
      SandboxOwnerModel.count({
        where: {
          conversationId: conversationResource.id,
          sandboxId: sandbox.id,
          workspaceId: workspaceModelId,
        },
      }),
      SandboxModel.count({
        where: { id: sandbox.id, workspaceId: workspaceModelId },
      }),
    ]);
    expect([linkCount, sandboxCount]).toEqual([0, 0]);
  });
});

describe("ConversationSandboxAdapter.dangerouslyDestroySandboxIfKillRequested", () => {
  let authenticator: Authenticator;
  let conversationResource: ConversationResource;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExecuteWithLock.mockImplementation(
      async (_key: string, fn: () => Promise<unknown>) => fn()
    );
    mockGetSandboxProvider.mockReturnValue({
      destroy: mockProviderDestroy,
    });
    mockProviderDestroy.mockResolvedValue(new Ok(undefined));
    mockRevokeAllExecTokensForSandbox.mockResolvedValue(undefined);

    const testSetup = await createResourceTest({ role: "admin" });
    authenticator = testSetup.authenticator;

    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });
    const fetched = await ConversationResource.fetchById(
      authenticator,
      conversation.sId
    );
    if (!fetched) {
      throw new Error("Conversation not found.");
    }
    conversationResource = fetched;
  });

  it.each(["running", "sleeping", "pending_approval"] as const)(
    "destroys at the provider and marks deleted regardless of status (%s)",
    async (status) => {
      const sandbox = await SandboxFactory.create(
        authenticator,
        conversationResource.toJSON(),
        {
          status,
          killRequestedAt: new Date(),
        }
      );

      const result =
        await ConversationSandboxAdapter.dangerouslyDestroySandboxIfKillRequested(
          authenticator,
          conversationResource
        );

      expect(result.isOk()).toBe(true);
      expect(mockProviderDestroy).toHaveBeenCalledWith(sandbox.providerId, {
        workspaceId: authenticator.getNonNullableWorkspace().sId,
      });

      const reloaded = await ConversationSandboxAdapter.fetchSandbox(
        authenticator,
        conversationResource.toJSON()
      );
      expect(reloaded?.status).toBe("deleted");
    }
  );

  it("is a no-op when killRequestedAt is not set", async () => {
    await SandboxFactory.create(authenticator, conversationResource.toJSON(), {
      status: "running",
    });

    const result =
      await ConversationSandboxAdapter.dangerouslyDestroySandboxIfKillRequested(
        authenticator,
        conversationResource
      );

    expect(result.isOk()).toBe(true);
    expect(mockProviderDestroy).not.toHaveBeenCalled();

    const reloaded = await ConversationSandboxAdapter.fetchSandbox(
      authenticator,
      conversationResource.toJSON()
    );
    expect(reloaded?.status).toBe("running");
  });

  it("is a no-op when the sandbox is already deleted", async () => {
    await SandboxFactory.create(authenticator, conversationResource.toJSON(), {
      status: "deleted",
      killRequestedAt: new Date(),
    });

    const result =
      await ConversationSandboxAdapter.dangerouslyDestroySandboxIfKillRequested(
        authenticator,
        conversationResource
      );

    expect(result.isOk()).toBe(true);
    expect(mockProviderDestroy).not.toHaveBeenCalled();
  });
});

describe("SandboxResource.dangerouslyDestroyIfKillRequested pre-destroy flush", () => {
  let authenticator: Authenticator;
  let conversationResource: ConversationResource;

  // A flush that can never pass — e.g. a pod database the litestream user
  // cannot write, which fails identically on every sweep.
  const alwaysFailingCheck = () =>
    Promise.resolve(new Err(new Error("litestream sync of arena failed")));

  const lifecycleOwner = () => ({
    lockKey: conversationResource.sId,
    fetchSandbox: () =>
      ConversationSandboxAdapter.fetchSandbox(
        authenticator,
        conversationResource.toJSON()
      ),
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExecuteWithLock.mockImplementation(
      async (_key: string, fn: () => Promise<unknown>) => fn()
    );
    mockGetSandboxProvider.mockReturnValue({ destroy: mockProviderDestroy });
    mockProviderDestroy.mockResolvedValue(new Ok(undefined));
    mockRevokeAllExecTokensForSandbox.mockResolvedValue(undefined);

    const testSetup = await createResourceTest({ role: "admin" });
    authenticator = testSetup.authenticator;

    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });
    const fetched = await ConversationResource.fetchById(
      authenticator,
      conversation.sId
    );
    if (!fetched) {
      throw new Error("Conversation not found.");
    }
    conversationResource = fetched;
  });

  it("skips the destroy while the kill request is within the grace period", async () => {
    await SandboxFactory.create(authenticator, conversationResource.toJSON(), {
      status: "running",
      killRequestedAt: new Date(),
    });

    const result = await SandboxResource.dangerouslyDestroyIfKillRequested(
      authenticator,
      lifecycleOwner(),
      { beforeSleep: alwaysFailingCheck }
    );

    expect(result.isErr()).toBe(true);
    expect(mockProviderDestroy).not.toHaveBeenCalled();

    const reloaded = await ConversationSandboxAdapter.fetchSandbox(
      authenticator,
      conversationResource.toJSON()
    );
    expect(reloaded?.status).toBe("running");
  });

  it("destroys anyway once the kill request is older than the grace period", async () => {
    const sandbox = await SandboxFactory.create(
      authenticator,
      conversationResource.toJSON(),
      {
        status: "running",
        killRequestedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      }
    );

    const result = await SandboxResource.dangerouslyDestroyIfKillRequested(
      authenticator,
      lifecycleOwner(),
      { beforeSleep: alwaysFailingCheck }
    );

    expect(result.isOk()).toBe(true);
    expect(mockProviderDestroy).toHaveBeenCalledWith(sandbox.providerId, {
      workspaceId: authenticator.getNonNullableWorkspace().sId,
    });

    const reloaded = await ConversationSandboxAdapter.fetchSandbox(
      authenticator,
      conversationResource.toJSON()
    );
    expect(reloaded?.status).toBe("deleted");
  });
});

describe("SandboxResource.dangerouslyGetKillRequestedSandboxes", () => {
  let authenticator: Authenticator;
  let agentConfigurationId: string;
  let conversation: ConversationType;

  beforeEach(async () => {
    vi.clearAllMocks();
    const testSetup = await createResourceTest({ role: "admin" });
    authenticator = testSetup.authenticator;

    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    agentConfigurationId = agentConfig.sId;
    conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId,
      messagesCreatedAt: [new Date()],
    });
  });

  it("returns rows with killRequestedAt set and status != deleted", async () => {
    const sandbox = await SandboxFactory.create(authenticator, conversation, {
      status: "running",
      killRequestedAt: new Date(),
    });

    const rows = await SandboxResource.dangerouslyGetKillRequestedSandboxes({
      limit: 10,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(sandbox.id);
  });

  it("skips deleted rows even when killRequestedAt is set", async () => {
    await SandboxFactory.create(authenticator, conversation, {
      status: "deleted",
      killRequestedAt: new Date(),
    });

    const rows = await SandboxResource.dangerouslyGetKillRequestedSandboxes({
      limit: 10,
    });

    expect(rows).toHaveLength(0);
  });

  it("skips rows where killRequestedAt is null", async () => {
    await SandboxFactory.create(authenticator, conversation, {
      status: "running",
    });

    const rows = await SandboxResource.dangerouslyGetKillRequestedSandboxes({
      limit: 10,
    });

    expect(rows).toHaveLength(0);
  });

  it("paginates rows sharing a kill request timestamp", async () => {
    const secondConversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId,
      messagesCreatedAt: [new Date()],
    });
    const killRequestedAt = new Date();
    await SandboxFactory.create(authenticator, conversation, {
      status: "running",
      killRequestedAt,
    });
    await SandboxFactory.create(authenticator, secondConversation, {
      status: "running",
      killRequestedAt,
    });

    const firstPage =
      await SandboxResource.dangerouslyGetKillRequestedSandboxes({
        limit: 1,
      });
    const firstSandbox = firstPage[0];
    if (!firstSandbox?.killRequestedAt) {
      throw new Error("Expected a kill-requested sandbox.");
    }

    const secondPage =
      await SandboxResource.dangerouslyGetKillRequestedSandboxes({
        limit: 1,
        after: {
          sandboxModelId: firstSandbox.id,
          timestamp: firstSandbox.killRequestedAt,
        },
      });

    expect(secondPage).toHaveLength(1);
    expect(secondPage[0]?.id).not.toBe(firstSandbox.id);
  });

  it("filters by statuses when provided", async () => {
    const secondConversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId,
      messagesCreatedAt: [new Date()],
    });
    const runningSandbox = await SandboxFactory.create(
      authenticator,
      conversation,
      {
        status: "running",
        killRequestedAt: new Date(),
      }
    );
    const sleepingSandbox = await SandboxFactory.create(
      authenticator,
      secondConversation,
      {
        status: "sleeping",
        killRequestedAt: new Date(),
      }
    );

    const awakeRows =
      await SandboxResource.dangerouslyGetKillRequestedSandboxes({
        limit: 10,
        statuses: ["running", "pending_approval"],
      });
    expect(awakeRows.map((r) => r.id)).toEqual([runningSandbox.id]);

    const sleepingRows =
      await SandboxResource.dangerouslyGetKillRequestedSandboxes({
        limit: 10,
        statuses: ["sleeping"],
      });
    expect(sleepingRows.map((r) => r.id)).toEqual([sleepingSandbox.id]);
  });

  it("orders by lastActivityAt descending and paginates when requested", async () => {
    const secondConversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId,
      messagesCreatedAt: [new Date()],
    });
    const olderActivityAt = new Date(Date.now() - 60 * 60 * 1000);
    const recentActivityAt = new Date();
    const older = await SandboxFactory.create(authenticator, conversation, {
      status: "sleeping",
      killRequestedAt: new Date(),
      lastActivityAt: olderActivityAt,
    });
    const recent = await SandboxFactory.create(
      authenticator,
      secondConversation,
      {
        status: "sleeping",
        killRequestedAt: new Date(),
        lastActivityAt: recentActivityAt,
      }
    );

    const firstPage =
      await SandboxResource.dangerouslyGetKillRequestedSandboxes({
        limit: 1,
        statuses: ["sleeping"],
        order: "lastActivityAtDesc",
      });
    expect(firstPage.map((r) => r.id)).toEqual([recent.id]);

    const secondPage =
      await SandboxResource.dangerouslyGetKillRequestedSandboxes({
        limit: 1,
        statuses: ["sleeping"],
        order: "lastActivityAtDesc",
        after: {
          sandboxModelId: recent.id,
          timestamp: recentActivityAt,
        },
      });
    expect(secondPage.map((r) => r.id)).toEqual([older.id]);
  });
});

describe("SandboxResource.dangerouslyRequestKillForBaseImage", () => {
  let authenticator: Authenticator;
  let agentConfigSId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const testSetup = await createResourceTest({ role: "admin" });
    authenticator = testSetup.authenticator;
    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    agentConfigSId = agentConfig.sId;
  });

  async function makeConversation(): Promise<ConversationType> {
    return ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfigSId,
      messagesCreatedAt: [new Date()],
    });
  }

  it("marks matching baseImage rows when no version is given", async () => {
    const c1 = await makeConversation();
    const c2 = await makeConversation();
    const other = await makeConversation();

    await SandboxFactory.create(authenticator, c1, {
      baseImage: "dust-base",
      version: "1.0.0",
    });
    await SandboxFactory.create(authenticator, c2, {
      baseImage: "dust-base",
      version: "2.0.0",
    });
    await SandboxFactory.create(authenticator, other, {
      baseImage: "other-image",
      version: "1.0.0",
    });

    const affected = await SandboxResource.dangerouslyRequestKillForBaseImage({
      baseImage: "dust-base",
      limit: 10,
    });

    expect(affected).toBe(2);
    const stillUnmarked = await ConversationSandboxAdapter.fetchSandbox(
      authenticator,
      other
    );
    expect(stillUnmarked?.killRequestedAt).toBeNull();
  });

  it("with version, marks only rows whose version differs (incl. null)", async () => {
    const cMatch = await makeConversation();
    const cDifferent = await makeConversation();
    const cNullVersion = await makeConversation();

    await SandboxFactory.create(authenticator, cMatch, {
      baseImage: "dust-base",
      version: "2.0.0",
    });
    await SandboxFactory.create(authenticator, cDifferent, {
      baseImage: "dust-base",
      version: "1.0.0",
    });
    const nullVersionSandbox = await SandboxFactory.create(
      authenticator,
      cNullVersion,
      { baseImage: "dust-base", version: "0.0.0-test" }
    );
    await SandboxModel.update(
      { version: null },
      { where: { id: nullVersionSandbox.id } }
    );

    const affected = await SandboxResource.dangerouslyRequestKillForBaseImage({
      baseImage: "dust-base",
      version: "2.0.0",
      limit: 10,
    });

    expect(affected).toBe(2);
    const matched = await ConversationSandboxAdapter.fetchSandbox(
      authenticator,
      cMatch
    );
    expect(matched?.killRequestedAt).toBeNull();
  });

  it("skips deleted rows and rows already marked", async () => {
    const cDeleted = await makeConversation();
    const cAlreadyMarked = await makeConversation();
    const cFresh = await makeConversation();

    await SandboxFactory.create(authenticator, cDeleted, {
      baseImage: "dust-base",
      status: "deleted",
    });
    await SandboxFactory.create(authenticator, cAlreadyMarked, {
      baseImage: "dust-base",
      killRequestedAt: new Date("2020-01-01"),
    });
    await SandboxFactory.create(authenticator, cFresh, {
      baseImage: "dust-base",
    });

    const affected = await SandboxResource.dangerouslyRequestKillForBaseImage({
      baseImage: "dust-base",
      limit: 10,
    });

    expect(affected).toBe(1);
    const alreadyMarked = await ConversationSandboxAdapter.fetchSandbox(
      authenticator,
      cAlreadyMarked
    );
    expect(alreadyMarked?.killRequestedAt?.toISOString()).toBe(
      new Date("2020-01-01").toISOString()
    );
  });

  it("respects the limit", async () => {
    for (let i = 0; i < 3; i++) {
      const c = await makeConversation();
      await SandboxFactory.create(authenticator, c, { baseImage: "dust-base" });
    }

    const affected = await SandboxResource.dangerouslyRequestKillForBaseImage({
      baseImage: "dust-base",
      limit: 2,
    });

    expect(affected).toBe(2);
  });
});

describe("ConversationSandboxAdapter.fetchSandbox", () => {
  let authenticator: Authenticator;
  let agentConfigId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const testSetup = await createResourceTest({ role: "admin" });
    authenticator = testSetup.authenticator;

    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    agentConfigId = agentConfig.sId;
  });

  async function makeConversation(): Promise<ConversationType> {
    return ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfigId,
      messagesCreatedAt: [new Date()],
    });
  }

  it("reads from sandbox_owners", async () => {
    const conversation = await makeConversation();
    const sandbox = await SandboxFactory.create(authenticator, conversation);

    const fetched = await ConversationSandboxAdapter.fetchSandbox(
      authenticator,
      conversation
    );

    expect(fetched?.id).toBe(sandbox.id);
  });

  it("writes sandbox_owners", async () => {
    const conversation = await makeConversation();
    const sandbox = await SandboxFactory.create(authenticator, conversation);
    const where = {
      sandboxId: sandbox.id,
      workspaceId: authenticator.getNonNullableWorkspace().id,
    };

    await expect(SandboxOwnerModel.count({ where })).resolves.toBe(1);
  });

  it("returns null when no ownership row exists", async () => {
    const conversation = await makeConversation();
    const sandbox = await SandboxFactory.create(authenticator, conversation);
    const where = {
      sandboxId: sandbox.id,
      workspaceId: authenticator.getNonNullableWorkspace().id,
    };

    await SandboxOwnerModel.destroy({ where });

    const fetched = await ConversationSandboxAdapter.fetchSandbox(
      authenticator,
      conversation
    );

    expect(fetched).toBeNull();
  });

  it("loads conversation ownership mappings by sandboxes", async () => {
    const conversation = await makeConversation();
    const sandbox = await SandboxFactory.create(authenticator, conversation);

    const conversationModelIdsBySandboxModelId =
      await ConversationSandboxAdapter.dangerouslyFetchConversationModelIdsBySandboxes(
        [sandbox]
      );

    expect(conversationModelIdsBySandboxModelId.get(sandbox.id)).toBe(
      conversation.id
    );
  });

  it("does not load ownership mappings for the wrong workspace", async () => {
    const conversation = await makeConversation();
    const sandbox = await SandboxFactory.create(authenticator, conversation);

    const conversationModelIdsBySandboxModelId =
      await ConversationSandboxAdapter.dangerouslyFetchConversationModelIdsBySandboxes(
        [
          {
            id: sandbox.id,
            workspaceId: sandbox.workspaceId + 1,
          },
        ]
      );

    expect(
      conversationModelIdsBySandboxModelId.get(sandbox.id)
    ).toBeUndefined();
  });
});

describe("SandboxResource.ensureActive", () => {
  let authenticator: Authenticator;
  let conversation: ConversationType;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExecuteWithLock.mockImplementation(
      async (_key: string, fn: () => Promise<unknown>) => fn()
    );
    mockGetSandboxProvider.mockReturnValue({
      create: mockProviderCreate,
      destroy: mockProviderDestroy,
      exec: mockProviderExec,
      wake: mockProviderWake,
    });
    mockGetSandboxImage.mockReturnValue(
      new Ok({
        toCreateConfig: () => ({
          imageId: { imageName: "test-image", tag: "0.0.1" },
          envVars: {
            DST_API_TOKEN: "image-token",
            SPACE_ID: "image-space-id",
            WORKSPACE_ID: "image-workspace-id",
          },
          network: { egress: "restricted" },
          resources: { cpu: 1, memoryMB: 512 },
        }),
      })
    );
    mockProviderCreate.mockResolvedValue(new Ok({ providerId: "provider-id" }));
    mockProviderWake.mockResolvedValue(new Ok(undefined));
    mockProviderExec.mockResolvedValue(
      new Ok({ exitCode: 0, stdout: "", stderr: "" })
    );

    const testSetup = await createResourceTest({ role: "admin" });
    authenticator = testSetup.authenticator;

    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });
  });

  it("passes workspace env vars to provider.create with image and system precedence", async () => {
    const workspace = authenticator.getNonNullableWorkspace();
    const user = authenticator.getNonNullableUser();

    // Bypass resource validation via direct bulkCreate to verify layer
    // precedence: image and system layers must win over workspace rows after
    // the runtime prefix is composed.
    await SandboxEnvVarModel.bulkCreate([
      {
        workspaceId: workspace.id,
        name: "API_TOKEN",
        encryptedValue: encrypt({
          text: "workspace-token",
          key: workspace.sId,
          useCase: "developer_secret",
        }),
        createdByUserId: user.id,
        lastUpdatedByUserId: user.id,
      },
      {
        workspaceId: workspace.id,
        name: "DD_API_KEY",
        encryptedValue: encrypt({
          text: "workspace-dd-token",
          key: workspace.sId,
          useCase: "developer_secret",
        }),
        createdByUserId: user.id,
        lastUpdatedByUserId: user.id,
      },
      {
        workspaceId: workspace.id,
        name: "WORKSPACE_ID",
        encryptedValue: encrypt({
          text: "workspace-overridden-id",
          key: workspace.sId,
          useCase: "developer_secret",
        }),
        createdByUserId: user.id,
        lastUpdatedByUserId: user.id,
      },
      {
        workspaceId: workspace.id,
        name: "SECRET_TOKEN",
        kind: "https_secret",
        placeholderNonce: Buffer.alloc(16, 1),
        allowedDomains: ["api.example.com"],
        encryptedValue: encrypt({
          text: "workspace-secret-token",
          key: workspace.sId,
          useCase: "developer_secret",
        }),
        createdByUserId: user.id,
        lastUpdatedByUserId: user.id,
      },
    ]);

    const result = await ConversationSandboxAdapter.ensureSandboxActive(
      authenticator,
      conversation
    );

    expect(result.isOk()).toBe(true);
    expect(mockProviderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        envVars: expect.objectContaining({
          DST_API_TOKEN: "image-token",
          DSEC_SECRET_TOKEN: "__DSEC_01010101010101010101010101010101__",
          SSL_CERT_FILE: "/etc/dust/ca-bundle.pem",
          SSL_CERT_DIR: "/etc/ssl/certs",
          CURL_CA_BUNDLE: "/etc/dust/ca-bundle.pem",
          REQUESTS_CA_BUNDLE: "/etc/dust/ca-bundle.pem",
          AWS_CA_BUNDLE: "/etc/dust/ca-bundle.pem",
          GIT_SSL_CAINFO: "/etc/dust/ca-bundle.pem",
          NODE_EXTRA_CA_CERTS: "/run/dust/egress-ca.pem",
          DENO_CERT: "/run/dust/egress-ca.pem",
          DENO_TLS_CA_STORE: "system,mozilla",
          CONVERSATION_ID: conversation.sId,
          WORKSPACE_ID: workspace.sId,
        }),
      }),
      { workspaceId: workspace.sId }
    );
    expect(mockProviderCreate.mock.calls[0]?.[0].envVars).not.toHaveProperty(
      "DST_SECRET_TOKEN"
    );
    expect(mockProviderCreate.mock.calls[0]?.[0].envVars).not.toHaveProperty(
      "DD_API_KEY"
    );
    expect(mockProviderCreate.mock.calls[0]?.[0].envVars).not.toHaveProperty(
      "DD_HOST"
    );
    expect(mockProviderCreate.mock.calls[0]?.[0].envVars).not.toHaveProperty(
      "SPACE_ID"
    );
    expect(mockProviderExec).not.toHaveBeenCalled();
  });

  it("pod env vars win over workspace env vars in provider.create", async () => {
    const workspace = authenticator.getNonNullableWorkspace();
    const user = authenticator.getNonNullableUser();
    const pod = await SpaceFactory.project(workspace, user.id);

    const workspaceVarResult = await SandboxEnvVarResource.makeNew(
      authenticator,
      { kind: "workspace", workspace },
      {
        name: "COLLIDE_TOKEN",
        value: "workspace-collide-value",
      }
    );
    expect(workspaceVarResult.isOk()).toBe(true);

    const workspaceSecretResult = await SandboxEnvVarResource.makeNew(
      authenticator,
      { kind: "workspace", workspace },
      {
        name: "COLLIDE_SECRET",
        kind: "https_secret",
        value: "workspace-secret",
        allowedDomains: ["api.example.com"],
      }
    );
    expect(workspaceSecretResult.isOk()).toBe(true);

    const podVarResult = await SandboxEnvVarResource.makeNew(
      authenticator,
      { kind: "pod", pod },
      {
        name: "COLLIDE_TOKEN",
        value: "pod-collide-value",
      }
    );
    expect(podVarResult.isOk()).toBe(true);

    const podSecretResult = await SandboxEnvVarResource.makeNew(
      authenticator,
      { kind: "pod", pod },
      {
        name: "COLLIDE_SECRET",
        kind: "https_secret",
        value: "pod-secret",
        allowedDomains: ["api.example.com"],
      }
    );
    expect(podSecretResult.isOk()).toBe(true);
    if (podSecretResult.isErr()) {
      throw podSecretResult.error;
    }

    const result = await PodSandboxAdapter.ensureSandboxActive(
      authenticator,
      pod
    );
    expect(result.isOk()).toBe(true);

    // The owner env layer beats the workspace layer in buildSandboxEnvVars,
    // so a pod var shadows a workspace var of the same name — for cleartext
    // config vars and DSEC placeholders alike, matching the egress-secrets
    // file merge precedence.
    expect(mockProviderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        envVars: expect.objectContaining({
          DST_COLLIDE_TOKEN: "pod-collide-value",
          DSEC_COLLIDE_SECRET: `__DSEC_${podSecretResult.value.toJSON().placeholderNonce}__`,
          SPACE_ID: pod.sId,
        }),
      }),
      { workspaceId: workspace.sId }
    );
  });

  it("conversation sandboxes running in a pod receive the pod env vars", async () => {
    const workspace = authenticator.getNonNullableWorkspace();
    const user = authenticator.getNonNullableUser();
    const pod = await SpaceFactory.project(workspace, user.id);

    const workspaceVarResult = await SandboxEnvVarResource.makeNew(
      authenticator,
      { kind: "workspace", workspace },
      { name: "COLLIDE_TOKEN", value: "workspace-collide-value" }
    );
    expect(workspaceVarResult.isOk()).toBe(true);

    const podVarResult = await SandboxEnvVarResource.makeNew(
      authenticator,
      { kind: "pod", pod },
      { name: "COLLIDE_TOKEN", value: "pod-collide-value" }
    );
    expect(podVarResult.isOk()).toBe(true);

    const podSecretResult = await SandboxEnvVarResource.makeNew(
      authenticator,
      { kind: "pod", pod },
      {
        name: "POD_SECRET",
        kind: "https_secret",
        value: "pod-secret",
        allowedDomains: ["api.example.com"],
      }
    );
    expect(podSecretResult.isOk()).toBe(true);
    if (podSecretResult.isErr()) {
      throw podSecretResult.error;
    }

    // The pod association is resolved from the database under the lifecycle
    // lock, so the conversation must actually live in the pod — a spaceId on
    // the passed object would be (correctly) ignored.
    const conversationResource = await ConversationResource.fetchById(
      authenticator,
      conversation.sId
    );
    if (!conversationResource) {
      throw new Error("Test conversation not found");
    }
    await conversationResource.updateSpaceId(authenticator, pod);
    await authenticator.refresh();

    const result = await ConversationSandboxAdapter.ensureSandboxActive(
      authenticator,
      { id: conversation.id, sId: conversation.sId }
    );
    expect(result.isOk()).toBe(true);

    // Pod config applies to every Computer running in the Pod: the
    // conversation sandbox gets the pod vars (pod wins on collision) and
    // DSEC placeholders, but not the pod-owner SPACE_ID marker.
    expect(mockProviderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        envVars: expect.objectContaining({
          DST_COLLIDE_TOKEN: "pod-collide-value",
          DSEC_POD_SECRET: `__DSEC_${podSecretResult.value.toJSON().placeholderNonce}__`,
          CONVERSATION_ID: conversation.sId,
        }),
      }),
      { workspaceId: workspace.sId }
    );
    const createEnvVars =
      mockProviderCreate.mock.calls[mockProviderCreate.mock.calls.length - 1][0]
        .envVars;
    expect(createEnvVars.SPACE_ID).toBeUndefined();
  });

  it("records baseImage and version from the registered image on fresh create", async () => {
    const result = await ConversationSandboxAdapter.ensureSandboxActive(
      authenticator,
      conversation
    );

    expect(result.isOk()).toBe(true);

    const persisted = await ConversationSandboxAdapter.fetchSandbox(
      authenticator,
      conversation
    );
    expect(persisted?.baseImage).toBe("test-image");
    expect(persisted?.version).toBe("0.0.1");

    const link = await SandboxOwnerModel.findOne({
      where: {
        conversationId: conversation.id,
        workspaceId: authenticator.getNonNullableWorkspace().id,
      },
    });
    expect(link?.sandboxId).toBe(persisted?.id);
  });

  it("refreshes baseImage and version when recreating from a deleted row", async () => {
    const stale = await SandboxFactory.create(authenticator, conversation, {
      status: "deleted",
      baseImage: "stale-image",
      version: "0.0.0-old",
    });
    await stale.updateLastRuntimeRefreshAt(new Date());

    const result = await ConversationSandboxAdapter.ensureSandboxActive(
      authenticator,
      conversation
    );

    expect(result.isOk()).toBe(true);

    const persisted = await ConversationSandboxAdapter.fetchSandbox(
      authenticator,
      conversation
    );
    expect(persisted?.baseImage).toBe("test-image");
    expect(persisted?.version).toBe("0.0.1");
    expect(persisted?.providerId).toBe("provider-id");
    expect(persisted?.lastRuntimeRefreshAt).toBeNull();
    expect(mockProviderExec).not.toHaveBeenCalled();
  });

  it("invalidates the runtime refresh timestamp after wake", async () => {
    const sleeping = await SandboxFactory.create(authenticator, conversation, {
      status: "sleeping",
    });
    await sleeping.updateLastRuntimeRefreshAt(new Date());

    const result = await ConversationSandboxAdapter.ensureSandboxActive(
      authenticator,
      conversation
    );

    expect(result.isOk()).toBe(true);
    const persisted = await ConversationSandboxAdapter.fetchSandbox(
      authenticator,
      conversation
    );
    expect(persisted?.lastRuntimeRefreshAt).toBeNull();
  });

  // requireRunning is what lets a caller running inside a request use a sandbox without ever
  // waiting on one being made ready. It runs entirely off a lock-free read: it performs no
  // lifecycle transition, and queueing concurrent invocations of a busy pod behind the lifecycle
  // lock was measured as their dominant latency under load. A kill-requested sandbox reports
  // itself as running right up until it is destroyed and recreated, so the kill marker is part
  // of the check.
  describe("with requireRunning", () => {
    it("refuses a running sandbox that has a kill requested", async () => {
      const pod = await SpaceFactory.project(
        authenticator.getNonNullableWorkspace()
      );
      await SandboxFactory.createForPod(authenticator, pod, {
        status: "running",
        killRequestedAt: new Date(),
      });

      const result = await PodSandboxAdapter.ensureSandboxActive(
        authenticator,
        pod,
        { requireRunning: true }
      );

      expect(result.isErr()).toBe(true);
      expect(mockProviderDestroy).not.toHaveBeenCalled();
      expect(mockProviderCreate).not.toHaveBeenCalled();
    });

    it("refuses a sleeping sandbox instead of waking it", async () => {
      const pod = await SpaceFactory.project(
        authenticator.getNonNullableWorkspace()
      );
      await SandboxFactory.createForPod(authenticator, pod, {
        status: "sleeping",
      });

      const result = await PodSandboxAdapter.ensureSandboxActive(
        authenticator,
        pod,
        { requireRunning: true }
      );

      expect(result.isErr()).toBe(true);
      expect(mockProviderWake).not.toHaveBeenCalled();
    });

    it("refuses to create a sandbox when the pod has none", async () => {
      const pod = await SpaceFactory.project(
        authenticator.getNonNullableWorkspace()
      );

      const result = await PodSandboxAdapter.ensureSandboxActive(
        authenticator,
        pod,
        { requireRunning: true }
      );

      expect(result.isErr()).toBe(true);
      expect(mockProviderCreate).not.toHaveBeenCalled();
    });

    it("uses a running sandbox without taking the lifecycle lock", async () => {
      const pod = await SpaceFactory.project(
        authenticator.getNonNullableWorkspace()
      );
      const running = await SandboxFactory.createForPod(authenticator, pod, {
        status: "running",
        // Old enough that the fast path's throttled activity touch writes.
        lastActivityAt: new Date(Date.now() - 60_000),
      });

      mockExecuteWithLock.mockClear();
      const result = await PodSandboxAdapter.ensureSandboxActive(
        authenticator,
        pod,
        { requireRunning: true }
      );

      expect(result.isOk()).toBe(true);
      if (result.isErr()) {
        return;
      }
      expect(result.value.sandbox.sId).toBe(running.sId);
      expect(mockExecuteWithLock).not.toHaveBeenCalled();

      // The reaper's inactivity clock must keep running for sandboxes served
      // entirely through the fast path.
      const persisted = await PodSandboxAdapter.fetchSandbox(
        authenticator,
        pod
      );
      expect(persisted?.lastActivityAt?.getTime()).toBeGreaterThan(
        Date.now() - 5_000
      );
    });

    it("refuses without taking the lifecycle lock", async () => {
      const pod = await SpaceFactory.project(
        authenticator.getNonNullableWorkspace()
      );
      await SandboxFactory.createForPod(authenticator, pod, {
        status: "sleeping",
      });

      mockExecuteWithLock.mockClear();
      const result = await PodSandboxAdapter.ensureSandboxActive(
        authenticator,
        pod,
        { requireRunning: true }
      );

      expect(result.isErr()).toBe(true);
      expect(mockExecuteWithLock).not.toHaveBeenCalled();
    });
  });

  it("destroys and recreates when killRequestedAt is set on the existing row", async () => {
    const stale = await SandboxFactory.create(authenticator, conversation, {
      status: "running",
      baseImage: "stale-image",
      version: "0.0.0-old",
      killRequestedAt: new Date(),
    });

    const result = await ConversationSandboxAdapter.ensureSandboxActive(
      authenticator,
      conversation
    );

    expect(result.isOk()).toBe(true);
    expect(mockProviderDestroy).toHaveBeenCalledWith(stale.providerId, {
      workspaceId: authenticator.getNonNullableWorkspace().sId,
    });
    expect(mockProviderCreate).toHaveBeenCalled();

    const persisted = await ConversationSandboxAdapter.fetchSandbox(
      authenticator,
      conversation
    );
    expect(persisted?.providerId).toBe("provider-id");
    expect(persisted?.baseImage).toBe("test-image");
    expect(persisted?.version).toBe("0.0.1");
    expect(persisted?.killRequestedAt).toBeNull();
    expect(persisted?.status).toBe("running");
  });
});

describe("SandboxResource.updateLastActivityAt", () => {
  it("skips the write while the recorded activity is fresh", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const sandbox = await SandboxResource.makeNew(authenticator, {
      providerId: "throttle-test-provider",
      status: "running",
      baseImage: "dust-base",
      version: "0.0.0-test",
    });

    // makeNew stamps lastActivityAt with now, so an immediate touch is within
    // the throttle window and must not issue a write.
    const [affectedFresh] = await sandbox.updateLastActivityAt();
    expect(affectedFresh).toBe(0);

    // Backdate the in-memory timestamp past the 30s window: the next touch
    // writes through.
    Object.assign(sandbox, { lastActivityAt: new Date(Date.now() - 60_000) });
    const [affectedStale] = await sandbox.updateLastActivityAt();
    expect(affectedStale).toBe(1);
  });
});

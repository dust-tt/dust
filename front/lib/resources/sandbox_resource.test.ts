import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDeleteSandboxPolicy,
  mockDistribution,
  mockExecuteWithLock,
  mockGetSandboxImage,
  mockGetSandboxProvider,
  mockProviderCreate,
  mockProviderDestroy,
  mockProviderExec,
  mockRevokeAllExecTokensForSandbox,
} = vi.hoisted(() => ({
  mockDeleteSandboxPolicy: vi.fn(),
  mockDistribution: vi.fn(),
  mockExecuteWithLock: vi.fn(),
  mockGetSandboxImage: vi.fn(),
  mockGetSandboxProvider: vi.fn(),
  mockProviderCreate: vi.fn(),
  mockProviderDestroy: vi.fn(),
  mockProviderExec: vi.fn(),
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

vi.mock("@app/lib/api/sandbox/egress_policy", () => ({
  deleteSandboxPolicy: mockDeleteSandboxPolicy,
}));

vi.mock("@app/lib/api/sandbox/image", () => ({
  getSandboxImage: mockGetSandboxImage,
}));

vi.mock("@app/lib/lock", () => ({
  executeWithLock: mockExecuteWithLock,
}));

import type { Authenticator } from "@app/lib/auth";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { WorkspaceSandboxEnvVarModel } from "@app/lib/resources/storage/models/workspace_sandbox_env_var";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import type { ConversationType } from "@app/types/assistant/conversation";
import { Ok } from "@app/types/shared/result";
import { encrypt } from "@app/types/shared/utils/encryption";

process.env.DUST_DEVELOPERS_SECRETS_SECRET ??= "test-developer-secret";

describe("SandboxResource.updateStatus", () => {
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
    });
    mockGetSandboxImage.mockReturnValue(
      new Ok({
        toCreateConfig: () => ({
          imageId: { name: "test-image", tag: "latest" },
          envVars: {},
          network: { egress: "restricted" },
          resources: { cpu: 1, memoryMB: 512 },
        }),
      })
    );
    mockProviderCreate.mockResolvedValue(new Ok({ providerId: "provider-id" }));
    mockProviderDestroy.mockResolvedValue(new Ok(undefined));
    mockProviderExec.mockResolvedValue(
      new Ok({ exitCode: 0, stdout: "", stderr: "" })
    );
    mockDeleteSandboxPolicy.mockResolvedValue(new Ok(undefined));
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

    const ctx = { workspaceId: authenticator.getNonNullableWorkspace().sId };
    await sandbox.updateStatus("sleeping", { ctx });

    expect(mockDistribution).toHaveBeenCalledWith(
      "sandbox.lifecycle.duration",
      expect.any(Number),
      expect.arrayContaining([
        `workspace_id:${ctx.workspaceId}`,
        "status:running",
      ])
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

    const ctx = { workspaceId: authenticator.getNonNullableWorkspace().sId };
    await sandbox.updateStatus("sleeping", { ctx });

    expect(mockDistribution).not.toHaveBeenCalled();
  });

  it("does nothing when transitioning to same status", async () => {
    const sandbox = await SandboxFactory.create(authenticator, conversation, {
      status: "running",
      statusChangedAt: new Date(),
    });

    const originalStatusChangedAt = sandbox.statusChangedAt;
    const ctx = { workspaceId: authenticator.getNonNullableWorkspace().sId };
    await sandbox.updateStatus("running", { ctx });

    expect(mockDistribution).not.toHaveBeenCalled();

    const reloaded = await SandboxResource.fetchByConversationId(
      authenticator,
      conversation.sId
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

    const ctx = { workspaceId: authenticator.getNonNullableWorkspace().sId };
    const beforeTransition = Date.now();
    await sandbox.updateStatus("sleeping", { ctx });
    const afterTransition = Date.now();

    const reloaded = await SandboxResource.fetchByConversationId(
      authenticator,
      conversation.sId
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

describe("SandboxResource.dangerouslyDestroyIfSleeping", () => {
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
    });
    mockGetSandboxImage.mockReturnValue(
      new Ok({
        toCreateConfig: () => ({
          imageId: { name: "test-image", tag: "latest" },
          envVars: {},
          network: { egress: "restricted" },
          resources: { cpu: 1, memoryMB: 512 },
        }),
      })
    );
    mockProviderCreate.mockResolvedValue(new Ok({ providerId: "provider-id" }));
    mockProviderDestroy.mockResolvedValue(new Ok(undefined));
    mockProviderExec.mockResolvedValue(
      new Ok({ exitCode: 0, stdout: "", stderr: "" })
    );
    mockDeleteSandboxPolicy.mockResolvedValue(new Ok(undefined));
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

  it("deletes the sandbox egress policy after provider destroy succeeds", async () => {
    const sandbox = await SandboxFactory.create(authenticator, conversation, {
      status: "sleeping",
    });

    const result = await SandboxResource.dangerouslyDestroyIfSleeping(
      authenticator,
      conversation.sId
    );

    expect(result.isOk()).toBe(true);
    expect(mockProviderDestroy).toHaveBeenCalledWith(sandbox.providerId, {
      workspaceId: authenticator.getNonNullableWorkspace().sId,
    });
    expect(mockDeleteSandboxPolicy).toHaveBeenCalledWith(sandbox.providerId);

    const reloaded = await SandboxResource.fetchByConversationId(
      authenticator,
      conversation.sId
    );
    expect(reloaded?.status).toBe("deleted");
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
    });
    mockGetSandboxImage.mockReturnValue(
      new Ok({
        toCreateConfig: () => ({
          imageId: { name: "test-image", tag: "latest" },
          envVars: {
            API_TOKEN: "image-token",
            DD_API_KEY: "image-dd-token",
            WORKSPACE_ID: "image-workspace-id",
          },
          network: { egress: "restricted" },
          resources: { cpu: 1, memoryMB: 512 },
        }),
      })
    );
    mockProviderCreate.mockResolvedValue(new Ok({ providerId: "provider-id" }));
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

    await WorkspaceSandboxEnvVarModel.bulkCreate([
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
    ]);

    const result = await SandboxResource.ensureActive(
      authenticator,
      conversation
    );

    expect(result.isOk()).toBe(true);
    expect(mockProviderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        envVars: expect.objectContaining({
          API_TOKEN: "image-token",
          CONVERSATION_ID: conversation.sId,
          WORKSPACE_ID: workspace.sId,
        }),
      }),
      { workspaceId: workspace.sId }
    );
    const createConfig = mockProviderCreate.mock.calls[0][0];
    expect(createConfig.envVars.DD_API_KEY).not.toBe("workspace-dd-token");
    expect(createConfig.envVars.DD_API_KEY).not.toBe("image-dd-token");
  });
});

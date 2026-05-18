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

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { SandboxModel } from "@app/lib/resources/storage/models/sandbox";
import { WorkspaceSandboxEnvVarModel } from "@app/lib/resources/storage/models/workspace_sandbox_env_var";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import type { ConversationType } from "@app/types/assistant/conversation";
import { Ok } from "@app/types/shared/result";
import { encrypt } from "@app/types/shared/utils/encryption";

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
      destroy: mockProviderDestroy,
    });
    mockProviderDestroy.mockResolvedValue(new Ok(undefined));
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

describe("SandboxResource.dangerouslyDestroyIfKillRequested", () => {
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

  it.each([
    "running",
    "sleeping",
    "pending_approval",
  ] as const)("destroys at the provider and marks deleted regardless of status (%s)", async (status) => {
    const sandbox = await SandboxFactory.create(authenticator, conversation, {
      status,
      killRequestedAt: new Date(),
    });

    const result = await SandboxResource.dangerouslyDestroyIfKillRequested(
      authenticator,
      conversation.sId
    );

    expect(result.isOk()).toBe(true);
    expect(mockProviderDestroy).toHaveBeenCalledWith(sandbox.providerId, {
      workspaceId: authenticator.getNonNullableWorkspace().sId,
    });

    const reloaded = await SandboxResource.fetchByConversationId(
      authenticator,
      conversation.sId
    );
    expect(reloaded?.status).toBe("deleted");
  });

  it("is a no-op when killRequestedAt is not set", async () => {
    await SandboxFactory.create(authenticator, conversation, {
      status: "running",
    });

    const result = await SandboxResource.dangerouslyDestroyIfKillRequested(
      authenticator,
      conversation.sId
    );

    expect(result.isOk()).toBe(true);
    expect(mockProviderDestroy).not.toHaveBeenCalled();

    const reloaded = await SandboxResource.fetchByConversationId(
      authenticator,
      conversation.sId
    );
    expect(reloaded?.status).toBe("running");
  });

  it("is a no-op when the sandbox is already deleted", async () => {
    await SandboxFactory.create(authenticator, conversation, {
      status: "deleted",
      killRequestedAt: new Date(),
    });

    const result = await SandboxResource.dangerouslyDestroyIfKillRequested(
      authenticator,
      conversation.sId
    );

    expect(result.isOk()).toBe(true);
    expect(mockProviderDestroy).not.toHaveBeenCalled();
  });
});

describe("SandboxResource.dangerouslyGetKillRequestedConversationIds", () => {
  let authenticator: Authenticator;
  let conversation: ConversationType;

  beforeEach(async () => {
    vi.clearAllMocks();
    const testSetup = await createResourceTest({ role: "admin" });
    authenticator = testSetup.authenticator;

    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });
  });

  it("returns rows with killRequestedAt set and status != deleted", async () => {
    await SandboxFactory.create(authenticator, conversation, {
      status: "running",
      killRequestedAt: new Date(),
    });

    const rows =
      await SandboxResource.dangerouslyGetKillRequestedConversationIds({
        limit: 10,
      });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.conversationId).toBe(conversation.sId);
  });

  it("skips deleted rows even when killRequestedAt is set", async () => {
    await SandboxFactory.create(authenticator, conversation, {
      status: "deleted",
      killRequestedAt: new Date(),
    });

    const rows =
      await SandboxResource.dangerouslyGetKillRequestedConversationIds({
        limit: 10,
      });

    expect(rows).toHaveLength(0);
  });

  it("skips rows where killRequestedAt is null", async () => {
    await SandboxFactory.create(authenticator, conversation, {
      status: "running",
    });

    const rows =
      await SandboxResource.dangerouslyGetKillRequestedConversationIds({
        limit: 10,
      });

    expect(rows).toHaveLength(0);
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
    const stillUnmarked = await SandboxResource.fetchByConversationId(
      authenticator,
      other.sId
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
    const matched = await SandboxResource.fetchByConversationId(
      authenticator,
      cMatch.sId
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
    const alreadyMarked = await SandboxResource.fetchByConversationId(
      authenticator,
      cAlreadyMarked.sId
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
          imageId: { imageName: "test-image", tag: "0.0.1" },
          envVars: {
            DST_API_TOKEN: "image-token",
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

    // Bypass resource validation via direct bulkCreate to verify layer
    // precedence: image and system layers must win over workspace rows after
    // the runtime prefix is composed.
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

    const result = await SandboxResource.ensureActive(
      authenticator,
      conversation
    );

    expect(result.isOk()).toBe(true);
    expect(mockProviderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        envVars: expect.objectContaining({
          DST_API_TOKEN: "image-token",
          DSEC_SECRET_TOKEN: "__DSEC_01010101010101010101010101010101__",
          DD_API_KEY: config.getDatadogApiKey() ?? "",
          CONVERSATION_ID: conversation.sId,
          WORKSPACE_ID: workspace.sId,
        }),
      }),
      { workspaceId: workspace.sId }
    );
    expect(mockProviderCreate.mock.calls[0]?.[0].envVars).not.toHaveProperty(
      "DST_SECRET_TOKEN"
    );
  });

  it("records baseImage and version from the registered image on fresh create", async () => {
    const result = await SandboxResource.ensureActive(
      authenticator,
      conversation
    );

    expect(result.isOk()).toBe(true);

    const persisted = await SandboxResource.fetchByConversationId(
      authenticator,
      conversation.sId
    );
    expect(persisted?.baseImage).toBe("test-image");
    expect(persisted?.version).toBe("0.0.1");
  });

  it("refreshes baseImage and version when recreating from a deleted row", async () => {
    await SandboxFactory.create(authenticator, conversation, {
      status: "deleted",
      baseImage: "stale-image",
      version: "0.0.0-old",
    });

    const result = await SandboxResource.ensureActive(
      authenticator,
      conversation
    );

    expect(result.isOk()).toBe(true);

    const persisted = await SandboxResource.fetchByConversationId(
      authenticator,
      conversation.sId
    );
    expect(persisted?.baseImage).toBe("test-image");
    expect(persisted?.version).toBe("0.0.1");
    expect(persisted?.providerId).toBe("provider-id");
  });

  it("destroys and recreates when killRequestedAt is set on the existing row", async () => {
    const stale = await SandboxFactory.create(authenticator, conversation, {
      status: "running",
      baseImage: "stale-image",
      version: "0.0.0-old",
      killRequestedAt: new Date(),
    });

    const result = await SandboxResource.ensureActive(
      authenticator,
      conversation
    );

    expect(result.isOk()).toBe(true);
    expect(mockProviderDestroy).toHaveBeenCalledWith(stale.providerId, {
      workspaceId: authenticator.getNonNullableWorkspace().sId,
    });
    expect(mockProviderCreate).toHaveBeenCalled();

    const persisted = await SandboxResource.fetchByConversationId(
      authenticator,
      conversation.sId
    );
    expect(persisted?.providerId).toBe("provider-id");
    expect(persisted?.baseImage).toBe("test-image");
    expect(persisted?.version).toBe("0.0.1");
    expect(persisted?.killRequestedAt).toBeNull();
    expect(persisted?.status).toBe("running");
  });
});

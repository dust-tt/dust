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
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationSandboxAdapter } from "@app/lib/resources/conversation_sandbox_adapter";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import {
  SandboxModel,
  SandboxOwnerModel,
} from "@app/lib/resources/storage/models/sandbox";
import { WorkspaceSandboxEnvVarModel } from "@app/lib/resources/storage/models/workspace_sandbox_env_var";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import type { ConversationType } from "@app/types/assistant/conversation";
import { Ok } from "@app/types/shared/result";
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

    const ctx = { workspaceId: authenticator.getNonNullableWorkspace().sId };
    const beforeTransition = Date.now();
    await sandbox.updateStatus("sleeping", { ctx });
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
    mockDeleteSandboxPolicy.mockResolvedValue(new Ok(undefined));
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
    expect(mockDeleteSandboxPolicy).toHaveBeenCalledWith(sandbox.providerId);

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
    mockDeleteSandboxPolicy.mockResolvedValue(new Ok(undefined));
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

  it.each([
    "running",
    "sleeping",
    "pending_approval",
  ] as const)("destroys at the provider and marks deleted regardless of status (%s)", async (status) => {
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
  });

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

describe("SandboxResource.dangerouslyGetKillRequestedSandboxes", () => {
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
      await ConversationResource.dangerouslyFetchConversationModelIdsBySandboxes(
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
      await ConversationResource.dangerouslyFetchConversationModelIdsBySandboxes(
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
    });
    mockGetSandboxImage.mockReturnValue(
      new Ok({
        toCreateConfig: () => ({
          imageId: { imageName: "test-image", tag: "0.0.1" },
          envVars: {
            DST_API_TOKEN: "image-token",
            POD_ID: "image-pod-id",
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
      "POD_ID"
    );
    expect(mockProviderExec).not.toHaveBeenCalled();
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
    await SandboxFactory.create(authenticator, conversation, {
      status: "deleted",
      baseImage: "stale-image",
      version: "0.0.0-old",
    });

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
    expect(mockProviderExec).not.toHaveBeenCalled();
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

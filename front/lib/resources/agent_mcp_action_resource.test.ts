import { DEFAULT_MCP_SERVER_ICON } from "@app/lib/actions/constants";
import type { LightServerSideMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ToolGeneratedFilePathType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { getRedisCacheClient } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMCPActionModel,
  AgentMCPActionOutputItemModel,
} from "@app/lib/models/agent/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import {
  GCS_CONTENT_CACHE_TTL_MS,
  gcsContentCacheKey,
  warmGcsContentCache,
} from "@app/lib/resources/agent_mcp_action/output_storage";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { getNamespace } from "@app/tests/utils/test_cls";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type {
  ConversationType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import { frameV2ContentType } from "@app/types/files";
import type { ModelId } from "@app/types/shared/model_id";
import type { WorkspaceType } from "@app/types/user";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory GCS mock: writes persist content that reads can return.
const gcsStore = new Map<string, Buffer>();
let gcsSaveFailureMarker: string | null = null;

vi.mock("@app/lib/file_storage", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@app/lib/file_storage")>();

  return {
    ...original,
    getPrivateUploadBucket: vi.fn(() => ({
      file: vi.fn((path: string) => ({
        copy: vi.fn().mockResolvedValue(undefined),
        save: vi.fn(async (data: Buffer) => {
          if (
            gcsSaveFailureMarker &&
            data.toString("utf-8").includes(gcsSaveFailureMarker)
          ) {
            throw new Error("Simulated GCS write failure");
          }
          gcsStore.set(path, data);
        }),
        download: vi.fn(async () => {
          const buf = gcsStore.get(path);
          if (!buf) {
            throw new Error(`GCS file not found: ${path}`);
          }
          return [buf];
        }),
      })),
      delete: vi.fn(
        async (path: string, opts?: { ignoreNotFound?: boolean }) => {
          if (!gcsStore.has(path) && !opts?.ignoreNotFound) {
            throw new Error(`GCS file not found: ${path}`);
          }
          gcsStore.delete(path);
        }
      ),
      deleteByPrefix: vi.fn(async (prefix: string) => {
        for (const path of [...gcsStore.keys()]) {
          if (path.startsWith(prefix)) {
            gcsStore.delete(path);
          }
        }
      }),
    })),
  };
});

// Bypass Redis caching, pass through to the underlying function.
vi.mock("@app/lib/utils/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/utils/cache")>();
  return {
    ...actual,
    cacheWithRedis: vi
      .fn()
      .mockImplementation(
        <T, Args extends unknown[]>(fn: (...args: Args) => Promise<T>) => {
          return async (...args: Args): Promise<T> => fn(...args);
        }
      ),
  };
});

describe("listBlockedActionsForConversation", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationType;
  let globalSpace: SpaceResource;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;
    globalSpace = setup.globalSpace;

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
  });

  async function createBlockedAction({
    agentMessageModelId,
    status = "blocked_validation_required",
  }: {
    agentMessageModelId: number;
    status?: ToolExecutionStatus;
  }) {
    return AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId,
      status,
    });
  }

  it("should return empty array for conversation with no agent messages", async () => {
    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    expect(conversationResource).not.toBeNull();

    const result =
      await AgentMCPActionResource.listBlockedActionsForConversation(
        auth,
        conversationResource!
      );

    expect(result).toEqual([]);
  });

  it("should return blocked actions for conversation", async () => {
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
    });

    // Create user message at rank 0.
    const userMessageRow = await ConversationFactory.createUserMessageWithRank({
      auth,
      workspace,
      conversationId: conversation.id,
      rank: 0,
      content: "Test message",
    });

    // Create agent message at rank 1.
    const agentMessageRow =
      await ConversationFactory.createAgentMessageWithRank({
        workspace,
        conversationId: conversation.id,
        rank: 1,
        agentConfigurationId: agentConfig.sId,
        agentConfigurationVersion: agentConfig.version,
        parentId: userMessageRow.id,
      });

    const remoteServer = await RemoteMCPServerFactory.create(workspace);
    const mcpServerView = await MCPServerViewFactory.create(
      workspace,
      remoteServer.sId,
      globalSpace
    );
    const { action } = await createBlockedAction({
      agentMessageModelId: agentMessageRow.agentMessageId!,
    });
    await AgentMCPActionModel.update(
      {
        toolConfiguration: {
          ...action.toolConfiguration,
          mcpServerViewId: mcpServerView.sId,
        },
      },
      { where: { id: action.id, workspaceId: workspace.id } }
    );

    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    expect(conversationResource).not.toBeNull();

    const result =
      await AgentMCPActionResource.listBlockedActionsForConversation(
        auth,
        conversationResource!
      );

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("blocked_validation_required");
    expect(result[0].metadata.agentName).toBe("Test Agent");
    expect(result[0].metadata.icon).toBe(DEFAULT_MCP_SERVER_ICON);
  });

  it("should only return blocked actions, not succeeded ones", async () => {
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
    });

    // Create user message at rank 0.
    const userMessageRow = await ConversationFactory.createUserMessageWithRank({
      auth,
      workspace,
      conversationId: conversation.id,
      rank: 0,
      content: "Test message",
    });

    // Create agent message at rank 1.
    const agentMessageRow =
      await ConversationFactory.createAgentMessageWithRank({
        workspace,
        conversationId: conversation.id,
        rank: 1,
        agentConfigurationId: agentConfig.sId,
        agentConfigurationVersion: agentConfig.version,
        parentId: userMessageRow.id,
      });

    // Create one blocked action and one succeeded action on the same agent message.
    await createBlockedAction({
      agentMessageModelId: agentMessageRow.agentMessageId!,
    });
    await createBlockedAction({
      agentMessageModelId: agentMessageRow.agentMessageId!,
      status: "succeeded",
    });

    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    expect(conversationResource).not.toBeNull();

    const result =
      await AgentMCPActionResource.listBlockedActionsForConversation(
        auth,
        conversationResource!
      );

    // Only the blocked action should be returned, not the succeeded one.
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("blocked_validation_required");
  });

  it.each([
    "interrupted",
    "gracefully_stopped",
  ] as const)("should not return blocked actions whose agent message is %s", async (status) => {
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
    });

    // Create user message at rank 0.
    const userMessageRow = await ConversationFactory.createUserMessageWithRank({
      auth,
      workspace,
      conversationId: conversation.id,
      rank: 0,
      content: "Test message",
    });

    // Create agent message at rank 1 with a blocked action.
    const agentMessageRow =
      await ConversationFactory.createAgentMessageWithRank({
        workspace,
        conversationId: conversation.id,
        rank: 1,
        agentConfigurationId: agentConfig.sId,
        agentConfigurationVersion: agentConfig.version,
        parentId: userMessageRow.id,
      });

    await createBlockedAction({
      agentMessageModelId: agentMessageRow.agentMessageId!,
    });

    // Finalize the agent message while leaving the blocked action behind, as can happen for stale
    // historical rows.
    await ConversationFactory.setAgentMessageStatus({
      workspace,
      agentMessageModelId: agentMessageRow.agentMessageId!,
      status,
    });

    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    expect(conversationResource).not.toBeNull();

    const result =
      await AgentMCPActionResource.listBlockedActionsForConversation(
        auth,
        conversationResource!
      );

    // The blocked action is not actionable anymore: it must not be returned.
    expect(result).toEqual([]);
  });

  it("should only return blocked actions from the latest agent message version at a given rank", async () => {
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
    });

    // Create user message at rank 0.
    const userMessageRow = await ConversationFactory.createUserMessageWithRank({
      auth,
      workspace,
      conversationId: conversation.id,
      rank: 0,
      content: "Test message",
    });

    // Create agent message v0 at rank 1 with a blocked action.
    const agentMessageV0Row =
      await ConversationFactory.createAgentMessageWithRank({
        workspace,
        conversationId: conversation.id,
        rank: 1,
        agentConfigurationId: agentConfig.sId,
        agentConfigurationVersion: agentConfig.version,
        parentId: userMessageRow.id,
        version: 0,
      });

    await createBlockedAction({
      agentMessageModelId: agentMessageV0Row.agentMessageId!,
    });

    // Create agent message v1 at the same rank (simulating a retry) with its own blocked action.
    const agentMessageV1Row =
      await ConversationFactory.createAgentMessageWithRank({
        workspace,
        conversationId: conversation.id,
        rank: 1,
        agentConfigurationId: agentConfig.sId,
        agentConfigurationVersion: agentConfig.version,
        parentId: userMessageRow.id,
        version: 1,
      });

    const { action: v1Action } = await createBlockedAction({
      agentMessageModelId: agentMessageV1Row.agentMessageId!,
    });

    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    expect(conversationResource).not.toBeNull();

    const result =
      await AgentMCPActionResource.listBlockedActionsForConversation(
        auth,
        conversationResource!
      );

    // Only the v1 blocked action should be returned, not v0's.
    expect(result).toHaveLength(1);

    // Verify the returned action belongs to the v1 agent message (not v0).
    expect(result[0].actionId).toBe(v1Action.sId);
  });

  it("returns zero and leaves the action unchanged when the expected status does not match", async () => {
    const agentMessage = await AgentMessageModel.create({
      conversationId: conversation.id,
      workspaceId: workspace.id,
      agentConfigurationId: "test-agent",
      agentConfigurationVersion: 0,
      status: "created",
      skipToolsValidation: false,
    });
    const { action } = await createBlockedAction({
      agentMessageModelId: agentMessage.id,
    });
    const [affectedCount] = await action.updateStatusFromExpected(auth, {
      status: "denied",
      expectedStatus: "blocked_authentication_required",
    });
    expect(affectedCount).toBe(0);
    const reloadedAction = await AgentMCPActionResource.fetchById(
      auth,
      action.sId
    );
    expect(reloadedAction?.status).toBe("blocked_validation_required");
  });

  it("excludes sandbox child actions from conversation-visible metadata", async () => {
    const agentMessage = await AgentMessageModel.create({
      conversationId: conversation.id,
      workspaceId: workspace.id,
      agentConfigurationId: "test-agent",
      agentConfigurationVersion: 0,
      status: "created",
      skipToolsValidation: false,
    });
    const { action: parentAction } = await createBlockedAction({
      agentMessageModelId: agentMessage.id,
    });
    await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId: agentMessage.id,
      parentAction,
      sandboxChildActionInfo: { parentActionId: parentAction.sId },
    });

    const visibleActions =
      await AgentMCPActionResource.fetchVisibleByLatestStepContents(auth, [
        agentMessage.id,
      ]);

    expect(visibleActions.map(({ sId }) => sId)).toEqual([parentAction.sId]);
  });

  it("returns only actions linked to canonical function calls", async () => {
    const agentMessage = await AgentMessageModel.create({
      conversationId: conversation.id,
      workspaceId: workspace.id,
      agentConfigurationId: "test-agent",
      agentConfigurationVersion: 0,
      status: "created",
      skipToolsValidation: false,
    });
    const { action: supersededAction } = await createBlockedAction({
      agentMessageModelId: agentMessage.id,
    });
    const { action: canonicalAction } = await createBlockedAction({
      agentMessageModelId: agentMessage.id,
    });
    const { action: removedAction } = await createBlockedAction({
      agentMessageModelId: agentMessage.id,
    });

    await AgentStepContentModel.update(
      {
        step: supersededAction.stepContent.step,
        index: supersededAction.stepContent.index,
        version: supersededAction.stepContent.version + 1,
      },
      {
        where: {
          id: canonicalAction.stepContent.id,
          workspaceId: workspace.id,
        },
      }
    );
    await AgentStepContentModel.create({
      workspaceId: workspace.id,
      agentMessageId: agentMessage.id,
      step: removedAction.stepContent.step,
      index: removedAction.stepContent.index,
      version: removedAction.stepContent.version + 1,
      dustRunId: null,
      type: "text_content",
      value: { type: "text_content", value: "The retry did not call a tool" },
    });

    const visibleActions =
      await AgentMCPActionResource.fetchVisibleByLatestStepContents(auth, [
        agentMessage.id,
      ]);

    expect(visibleActions.map(({ sId }) => sId)).toEqual([canonicalAction.sId]);
  });

  it("does not rewind a final action through a stale sandbox parent resource", async () => {
    const agentMessage = await AgentMessageModel.create({
      conversationId: conversation.id,
      workspaceId: workspace.id,
      agentConfigurationId: "test-agent",
      agentConfigurationVersion: 0,
      status: "created",
      skipToolsValidation: false,
    });
    const { action } = await createBlockedAction({
      agentMessageModelId: agentMessage.id,
    });
    await action.updateStatus("running");

    const staleParent = await AgentMCPActionResource.fetchById(
      auth,
      action.sId
    );
    const currentParent = await AgentMCPActionResource.fetchById(
      auth,
      action.sId
    );
    if (!staleParent || !currentParent) {
      throw new Error("Expected both sandbox parent resources to exist.");
    }
    expect(staleParent.status).toBe("running");
    expect(currentParent.status).toBe("running");
    await currentParent.updateStatus("succeeded");

    await expect(staleParent.blockForSandboxChild(auth)).rejects.toThrow(
      "cannot transition from succeeded to blocked_child_action_input_required"
    );
    const reloadedParent = await AgentMCPActionResource.fetchById(
      auth,
      action.sId
    );
    expect(reloadedParent?.status).toBe("succeeded");
  });
});

describe("listNonFinalActionsForAgentMessage", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationType;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
  });

  it("should return only the message's non-final actions", async () => {
    const { agentMessage } = await AgentMCPActionFactory.createWithAgentMessage(
      auth,
      { workspace, conversation, status: "succeeded" }
    );

    const { action: runningAction } = await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId: agentMessage.agentMessageId,
      status: "running",
    });
    const { action: blockedAction } = await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId: agentMessage.agentMessageId,
      status: "blocked_validation_required",
    });

    // Non-final action on another agent message: must not be returned.
    const otherAgentConfig = await AgentConfigurationFactory.createTestAgent(
      auth,
      { name: "Other Agent" }
    );
    const { agentMessage: otherAgentMessage } =
      await ConversationFactory.createAgentMessage(auth, {
        workspace,
        conversation,
        agentConfig: otherAgentConfig,
        // The first agent message of the test occupies rank 0.
        rank: 1,
      });
    await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId: otherAgentMessage.agentMessageId,
      status: "running",
    });

    const actions =
      await AgentMCPActionResource.listNonFinalActionsForAgentMessage(auth, {
        agentMessageModelId: agentMessage.agentMessageId,
      });

    expect(actions.map((a) => a.id).sort()).toEqual(
      [runningAction.id, blockedAction.id].sort()
    );
  });

  it("should return an empty array when every action is final", async () => {
    const { agentMessage } = await AgentMCPActionFactory.createWithAgentMessage(
      auth,
      { workspace, conversation, status: "errored" }
    );

    const actions =
      await AgentMCPActionResource.listNonFinalActionsForAgentMessage(auth, {
        agentMessageModelId: agentMessage.agentMessageId,
      });

    expect(actions).toEqual([]);
  });
});

describe("Output items with GCS storage", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let agentConfig: LightAgentConfigurationType;
  let conversation: ConversationType | ConversationWithoutContentType;

  const toolConfiguration: LightServerSideMCPToolConfigurationType = {
    id: -1,
    sId: "test-tool-config",
    type: "mcp_configuration",
    name: "test_tool",
    originalName: "test_tool",
    mcpServerName: "test_server",
    dataSources: null,
    tables: null,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    additionalConfiguration: {},
    mcpServerViewId: "test-server-view",
    dustAppConfiguration: null,
    internalMCPServerId: null,
    secretName: null,
    dustProject: null,
    availability: "auto",
    permission: "never_ask",
    toolServerId: "test-server",
    retryPolicy: "no_retry",
  };

  beforeEach(async () => {
    gcsStore.clear();
    gcsSaveFailureMarker = null;

    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    const redis = await getRedisCacheClient({ origin: "cache_with_redis" });
    vi.mocked(redis.set).mockClear();

    agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
    });

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
  });

  const createAction = async () => {
    const { action } = await ConversationFactory.createAgentMessage(auth, {
      workspace,
      conversation,
      agentConfig,
      mcpAction: { toolConfiguration },
    });

    assert(action, "Action should be defined.");
    return action;
  };

  const createActionWithOutputItems = async (
    contents: Array<{ type: "text"; text: string }>
  ) => {
    const action = await createAction();

    const outputRes = await action.createOutputItems(
      auth,
      contents.map((c) => ({ content: c }))
    );
    if (outputRes.isErr()) {
      throw outputRes.error;
    }
    const outputItems = outputRes.value;

    // createOutputItems returns the generic content view; fetch the created rows for assertions
    // on persistence-side fields.
    const outputItemRows = await AgentMCPActionOutputItemModel.findAll({
      where: { workspaceId: workspace.id, agentMCPActionId: action.id },
      order: [["id", "ASC"]],
    });

    return { action, outputItems, outputItemRows };
  };

  it("should create output items in both DB and GCS", async () => {
    const { outputItems, outputItemRows } = await createActionWithOutputItems([
      { type: "text", text: "Hello from GCS" },
    ]);

    expect(outputItems).toHaveLength(1);
    expect(outputItems[0].content).toEqual({
      type: "text",
      text: "Hello from GCS",
    });

    // contentGcsPath should be set (GCS write succeeded).
    expect(outputItemRows[0].contentGcsPath).toBeTruthy();
    expect(outputItemRows[0].contentGcsPath).toMatch(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/
    );

    // GCS store should have one entry.
    expect(gcsStore.size).toBe(1);
  });

  it("uses distinct GCS objects across multiple writes for the same action", async () => {
    const action = await createAction();

    const firstResult = await action.createOutputItems(auth, [
      { content: { type: "text", text: "first" } },
    ]);
    const secondResult = await action.createOutputItems(auth, [
      { content: { type: "text", text: "second" } },
    ]);

    expect(firstResult.isOk()).toBe(true);
    expect(secondResult.isOk()).toBe(true);

    const outputItemRows = await AgentMCPActionOutputItemModel.findAll({
      where: { workspaceId: workspace.id, agentMCPActionId: action.id },
    });
    expect(outputItemRows).toHaveLength(2);
    expect(
      new Set(outputItemRows.map((item) => item.contentGcsPath)).size
    ).toBe(2);
    expect(gcsStore.size).toBe(2);
  });

  it("cleans up GCS and creates no rows when a batch GCS write fails", async () => {
    const action = await createAction();
    gcsSaveFailureMarker = "fail-this-write";

    const result = await action.createOutputItems(auth, [
      { content: { type: "text", text: "successful write" } },
      { content: { type: "text", text: "fail-this-write" } },
    ]);

    expect(result.isErr()).toBe(true);
    const outputItemRows = await AgentMCPActionOutputItemModel.findAll({
      where: { workspaceId: workspace.id, agentMCPActionId: action.id },
    });
    expect(outputItemRows).toHaveLength(0);
    expect(gcsStore.size).toBe(0);
  });

  it("retains ambiguous DB-failure objects until action-prefix cleanup", async () => {
    const action = await createAction();
    const namespace = getNamespace("test-namespace");
    const parentTransaction = namespace?.get("transaction");
    expect(parentTransaction).toBeDefined();

    await expect(
      frontSequelize.transaction(
        { transaction: parentTransaction },
        async () => {
          const result = await action.createOutputItems(auth, [
            {
              content: { type: "text", text: "orphan candidate" },
              fileId: -1,
            },
          ]);
          expect(result.isErr()).toBe(true);

          // Roll back the savepoint so the expected FK violation does not abort the test's
          // enclosing transaction.
          throw result.isErr()
            ? result.error
            : new Error("Expected output item creation to fail.");
        }
      )
    ).rejects.toThrow();

    const outputItemRows = await AgentMCPActionOutputItemModel.findAll({
      where: { workspaceId: workspace.id, agentMCPActionId: action.id },
    });
    expect(outputItemRows).toHaveLength(0);
    expect(gcsStore.size).toBe(1);

    await AgentMCPActionResource.destroyOutputItemsByActionIds(auth, [
      action.id,
    ]);

    expect(gcsStore.size).toBe(0);
  });

  it("should read content from GCS, not from DB", async () => {
    const { action } = await createActionWithOutputItems([
      { type: "text", text: "original content" },
    ]);

    // Overwrite the GCS file with different content to prove the fetch path
    // reads from GCS (not from the DB, which still has "original content").
    const [[gcsPath]] = [...gcsStore.entries()];
    const modified = JSON.stringify({ type: "text", text: "from GCS" });
    gcsStore.set(gcsPath, Buffer.from(modified, "utf-8"));

    const outputItemsByActionId =
      await AgentMCPActionResource.fetchOutputItemsByActionIds(auth, {
        actionIds: [action!.id],
        ignoreContent: false,
      });

    const items = outputItemsByActionId.get(action.id);
    expect(items).toBeDefined();
    expect(items).toHaveLength(1);

    // Content should match the GCS version, proving it was read from GCS.
    expect(items![0].content).toEqual({ type: "text", text: "from GCS" });
  });

  it("warms Redis cache for each item after createOutputItems succeeds", async () => {
    const { outputItemRows } = await createActionWithOutputItems([
      { type: "text", text: "first" },
      { type: "text", text: "second" },
    ]);

    const redis = await getRedisCacheClient({ origin: "cache_with_redis" });
    const setCalls = vi.mocked(redis.set).mock.calls;

    expect(outputItemRows).toHaveLength(2);

    for (const item of outputItemRows) {
      expect(setCalls).toContainEqual([
        `cacheWithRedis-fetchGcsContent-${gcsContentCacheKey(auth, "", item.id)}`,
        JSON.stringify(item.content),
        { PX: GCS_CONTENT_CACHE_TTL_MS },
      ]);
    }
  });

  it("succeeds when Redis cache warming fails", async () => {
    const action = await createAction();
    const redis = await getRedisCacheClient({ origin: "cache_with_redis" });
    vi.mocked(redis.set).mockRejectedValueOnce(new Error("redis down"));

    const result = await action.createOutputItems(auth, [
      { content: { type: "text", text: "persisted" } },
    ]);

    expect(result.isOk()).toBe(true);
    const outputItemRows = await AgentMCPActionOutputItemModel.findAll({
      where: { workspaceId: workspace.id, agentMCPActionId: action.id },
    });
    expect(outputItemRows).toHaveLength(1);
    expect(gcsStore.size).toBe(1);
  });

  it("should destroy output items from both DB and GCS", async () => {
    const { action } = await createActionWithOutputItems([
      { type: "text", text: "To be deleted" },
    ]);

    expect(gcsStore.size).toBe(1);

    await AgentMCPActionResource.destroyOutputItemsByActionIds(auth, [
      action.id,
    ]);

    // GCS files should be deleted.
    expect(gcsStore.size).toBe(0);

    // DB rows should be deleted.
    const remainingItems = await AgentMCPActionOutputItemModel.findAll({
      where: { workspaceId: workspace.id, agentMCPActionId: action.id },
    });
    expect(remainingItems).toHaveLength(0);
  });

  it("should delete legacy GCS paths that are outside the action prefix", async () => {
    const { action, outputItemRows } = await createActionWithOutputItems([
      { type: "text", text: "canonical" },
      { type: "text", text: "legacy" },
    ]);

    expect(gcsStore.size).toBe(2);

    // Point the second item at a legacy path that is not under the action prefix.
    const legacyPath = `mcp_output_items/${action.sId}/${outputItemRows[1].id}.json`;
    const legacyContent = gcsStore.get(outputItemRows[1].contentGcsPath!);
    assert(legacyContent);
    gcsStore.delete(outputItemRows[1].contentGcsPath!);
    gcsStore.set(legacyPath, legacyContent);
    await outputItemRows[1].update({ contentGcsPath: legacyPath });

    await AgentMCPActionResource.destroyOutputItemsByActionIds(auth, [
      action.id,
    ]);

    expect(gcsStore.size).toBe(0);

    const remainingItems = await AgentMCPActionOutputItemModel.findAll({
      where: { workspaceId: workspace.id, agentMCPActionId: action.id },
    });
    expect(remainingItems).toHaveLength(0);
  });

  it("should handle multiple actions independently", async () => {
    const { action: action1 } = await createActionWithOutputItems([
      { type: "text", text: "Action 1 content" },
    ]);

    // Create a second conversation so the factory can use rank 0 again
    // (rank is unique per conversation).
    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      visibility: "unlisted",
    });

    const { action: action2 } = await createActionWithOutputItems([
      { type: "text", text: "Action 2 content" },
    ]);

    expect(gcsStore.size).toBe(2);

    const outputItemsByActionId =
      await AgentMCPActionResource.fetchOutputItemsByActionIds(auth, {
        actionIds: [action1.id, action2.id],
        ignoreContent: false,
      });

    expect(outputItemsByActionId.get(action1.id)).toHaveLength(1);
    expect(outputItemsByActionId.get(action2.id)).toHaveLength(1);

    // Destroy only action1's items.
    await AgentMCPActionResource.destroyOutputItemsByActionIds(auth, [
      action1.id,
    ]);

    expect(gcsStore.size).toBe(1);

    // action2's items should still be fetchable.
    const remaining = await AgentMCPActionResource.fetchOutputItemsByActionIds(
      auth,
      {
        actionIds: [action2.id],
        ignoreContent: false,
      }
    );
    const items = remaining.get(action2.id);
    expect(items).toHaveLength(1);
    expect(items![0].content).toEqual({
      type: "text",
      text: "Action 2 content",
    });
  });

  it("fetchOutputItemsByActionIds returns an empty map when both id lists are empty", async () => {
    const map = await AgentMCPActionResource.fetchOutputItemsByActionIds(auth, {
      actionIds: [],
      ignoreContent: false,
    });

    expect(map.size).toBe(0);
  });

  it("fetchOutputItemsByActionIds with actionIdsWithoutContent does not load content or GCS path", async () => {
    const { action, outputItemRows } = await createActionWithOutputItems([
      { type: "text", text: "not loaded" },
    ]);

    const map = await AgentMCPActionResource.fetchOutputItemsByActionIds(auth, {
      actionIds: [action.id],
      ignoreContent: true,
    });

    const items = map.get(action.id);
    expect(items).toHaveLength(1);
    expect(items![0].id).toBe(outputItemRows[0].id);
    expect(items![0].content).toBeUndefined();
    expect(items![0].contentGcsPath).toBeUndefined();
  });

  it("should store generatedFilePath and generatedFileContentType for path-based output items", async () => {
    const { action } = await ConversationFactory.createAgentMessage(auth, {
      workspace,
      conversation,
      agentConfig,
      mcpAction: { toolConfiguration },
    });
    assert(action, "action should be defined");

    const outputResourceItem: ToolGeneratedFilePathType = {
      text: "file written",
      uri: "conversation-abc123/analysis.csv",
      mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE_PATH,
      path: "conversation-abc123/analysis.csv",
      title: "analysis.csv",
      contentType: "text/csv",
    };

    await action.createOutputItems(auth, [
      {
        content: {
          type: "resource",
          resource: outputResourceItem,
        },
      },
    ]);

    const outputItemRows = await AgentMCPActionOutputItemModel.findAll({
      where: { workspaceId: workspace.id, agentMCPActionId: action.id },
    });
    expect(outputItemRows).toHaveLength(1);
    expect(outputItemRows[0].generatedFilePath).toBe(
      "conversation-abc123/analysis.csv"
    );
    expect(outputItemRows[0].generatedFileContentType).toBe("text/csv");
  });

  it("should return generatedFilePath and generatedFileContentType when ignoreContent is true", async () => {
    const { action } = await ConversationFactory.createAgentMessage(auth, {
      workspace,
      conversation,
      agentConfig,
      mcpAction: { toolConfiguration },
    });
    assert(action, "action should be defined");

    const outputResourceItem: ToolGeneratedFilePathType = {
      text: "file written",
      uri: "conversation-abc123/analysis.csv",
      mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE_PATH,
      path: "conversation-abc123/analysis.csv",
      title: "analysis.csv",
      contentType: "text/csv",
    };

    await action.createOutputItems(auth, [
      {
        content: {
          type: "resource",
          resource: outputResourceItem,
        },
      },
    ]);

    const map = await AgentMCPActionResource.fetchOutputItemsByActionIds(auth, {
      actionIds: [action.id],
      ignoreContent: true,
    });

    const items = map.get(action.id);
    assert(items !== undefined, "items should be defined");
    expect(items).toHaveLength(1);
    // content and contentGcsPath are excluded by ignoreContent.
    expect(items[0].content).toBeUndefined();
    expect(items[0].contentGcsPath).toBeUndefined();
    // Path-based file metadata survives.
    expect(items[0].generatedFilePath).toBe("conversation-abc123/analysis.csv");
    expect(items[0].generatedFileContentType).toBe("text/csv");
  });

  it("fetchOutputItemsByActionIds mixes metadata-only and full-content actions in one call", async () => {
    const { action: actionMetadataOnly } = await createActionWithOutputItems([
      { type: "text", text: "should not appear on row" },
    ]);

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      visibility: "unlisted",
    });

    const { action: actionWithContent } = await createActionWithOutputItems([
      { type: "text", text: "loaded from GCS" },
    ]);

    const [a, b] = await Promise.all([
      AgentMCPActionResource.fetchOutputItemsByActionIds(auth, {
        actionIds: [actionWithContent.id],
        ignoreContent: false,
      }),
      AgentMCPActionResource.fetchOutputItemsByActionIds(auth, {
        actionIds: [actionMetadataOnly.id],
        ignoreContent: true,
      }),
    ]);

    const map = new Map<number, AgentMCPActionOutputItemModel[]>(
      [...a, ...b].map(([actionId, items]) => [actionId, items])
    );

    const metaItems = map.get(actionMetadataOnly.id);
    expect(metaItems).toHaveLength(1);
    expect(metaItems![0].content).toBeUndefined();
    expect(metaItems![0].contentGcsPath).toBeUndefined();

    const fullItems = map.get(actionWithContent.id);
    expect(fullItems).toHaveLength(1);
    expect(fullItems![0].content).toEqual({
      type: "text",
      text: "loaded from GCS",
    });
    expect(fullItems![0].contentGcsPath).toBeTruthy();
  });

  it("fetchOutputItemsByActionIds loads legacy rows (no GCS path) from DB content", async () => {
    const { action } = await ConversationFactory.createAgentMessage(auth, {
      workspace,
      conversation,
      agentConfig,
      mcpAction: { toolConfiguration },
    });
    expect(action).toBeDefined();

    await AgentMCPActionOutputItemModel.create({
      workspaceId: workspace.id,
      agentMCPActionId: action!.id,
      content: { type: "text", text: "db-only legacy" },
      contentGcsPath: null,
      citations: null,
    });

    const map = await AgentMCPActionResource.fetchOutputItemsByActionIds(auth, {
      actionIds: [action!.id],
      ignoreContent: false,
    });

    const items = map.get(action!.id);
    expect(items).toHaveLength(1);
    expect(items![0].content).toEqual({
      type: "text",
      text: "db-only legacy",
    });
    expect(items![0].contentGcsPath).toBeNull();
  });

  it("fetchOutputItemsByActionIds returns all output items for one action", async () => {
    const { action } = await createActionWithOutputItems([
      { type: "text", text: "first" },
      { type: "text", text: "second" },
    ]);

    const map = await AgentMCPActionResource.fetchOutputItemsByActionIds(auth, {
      actionIds: [action.id],
      ignoreContent: false,
    });

    const items = map.get(action.id)!;
    expect(items).toHaveLength(2);
    const texts = items
      .map((i) => (i.content as { type: "text"; text: string }).text)
      .sort();
    expect(texts).toEqual(["first", "second"]);
  });
});

describe("warmGcsContentCache", () => {
  let auth: Authenticator;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;

    const redis = await getRedisCacheClient({ origin: "cache_with_redis" });
    vi.mocked(redis.set).mockClear();
  });

  it("is a no-op for empty items", async () => {
    await warmGcsContentCache(auth, []);

    const redis = await getRedisCacheClient({ origin: "cache_with_redis" });
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("warms each item with the correct key, value, and TTL", async () => {
    const items = [
      {
        itemId: 42,
        gcsPath: "mcp_output_items/w/x/a/42.json",
        content: { type: "text" as const, text: "hello" },
      },
      {
        itemId: 43,
        gcsPath: "mcp_output_items/w/x/a/43.json",
        content: { type: "text" as const, text: "world" },
      },
    ];

    await warmGcsContentCache(auth, items);

    const redis = await getRedisCacheClient({ origin: "cache_with_redis" });
    const setCalls = vi.mocked(redis.set).mock.calls;

    expect(setCalls).toHaveLength(2);

    for (const item of items) {
      expect(setCalls).toContainEqual([
        `cacheWithRedis-fetchGcsContent-${gcsContentCacheKey(auth, "", item.itemId)}`,
        JSON.stringify(item.content),
        { PX: GCS_CONTENT_CACHE_TTL_MS },
      ]);
    }
  });

  it("propagates Redis errors", async () => {
    const redis = await getRedisCacheClient({ origin: "cache_with_redis" });
    vi.mocked(redis.set).mockRejectedValueOnce(new Error("redis down"));

    await expect(
      warmGcsContentCache(auth, [
        {
          itemId: 1,
          gcsPath: "mcp_output_items/w/x/a/1.json",
          content: { type: "text", text: "anything" },
        },
      ])
    ).rejects.toThrow("redis down");
  });
});

describe("listGeneratedFilesForConversation", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationType;
  let agentConfig: LightAgentConfigurationType;
  let user: Awaited<ReturnType<typeof createResourceTest>>["user"];

  const toolConfiguration: LightServerSideMCPToolConfigurationType = {
    id: 1,
    sId: "test-tool-config",
    type: "mcp_configuration",
    name: "test_tool",
    originalName: "test_tool",
    mcpServerName: "test_server",
    dataSources: null,
    tables: null,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    additionalConfiguration: {},
    mcpServerViewId: "test-server-view",
    dustAppConfiguration: null,
    internalMCPServerId: null,
    secretName: null,
    dustProject: null,
    availability: "auto",
    permission: "never_ask",
    toolServerId: "test-server",
    retryPolicy: "no_retry",
  };

  beforeEach(async () => {
    gcsStore.clear();

    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;
    user = setup.user;

    agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Generated Files Agent",
    });

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
  });

  it("returns empty array when conversation has no agent actions", async () => {
    const result =
      await AgentMCPActionResource.listGeneratedFilesForConversation(auth, {
        conversationId: conversation.id,
      });

    expect(result).toEqual([]);
  });

  it("returns FileResource-backed generated files with agent creator", async () => {
    const file = await FileFactory.create(auth, user, {
      contentType: "text/plain",
      fileName: "report.txt",
      fileSize: 42,
      status: "ready",
      useCase: "tool_output",
      snippet: "hello snippet",
    });

    const { action } = await ConversationFactory.createAgentMessage(auth, {
      workspace,
      conversation,
      agentConfig,
      mcpAction: { toolConfiguration },
    });
    assert(action);

    const outputRes = await action.createOutputItems(auth, [
      {
        content: { type: "text", text: "generated" },
        fileId: file.id,
      },
    ]);
    expect(outputRes.isOk()).toBe(true);

    const result =
      await AgentMCPActionResource.listGeneratedFilesForConversation(auth, {
        conversationId: conversation.id,
      });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      fileId: file.sId,
      title: "report.txt",
      contentType: "text/plain",
      snippet: "hello snippet",
      creator: {
        type: "agent",
        name: agentConfig.name,
        pictureUrl: agentConfig.pictureUrl,
      },
    });
  });

  it("uses the Frame name for a Frames v2 generated file", async () => {
    const frame = await FileFactory.create(auth, user, {
      contentType: frameV2ContentType,
      fileName: "manifest.json",
      fileSize: 42,
      status: "created",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: conversation.sId,
        frameName: "Hello Frame",
      },
    });

    const { action } = await ConversationFactory.createAgentMessage(auth, {
      workspace,
      conversation,
      agentConfig,
      mcpAction: { toolConfiguration },
    });
    assert(action);

    const outputRes = await action.createOutputItems(auth, [
      {
        content: { type: "text", text: "generated" },
        fileId: frame.id,
      },
    ]);
    expect(outputRes.isOk()).toBe(true);

    const result =
      await AgentMCPActionResource.listGeneratedFilesForConversation(auth, {
        conversationId: conversation.id,
      });

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("Hello Frame");
  });

  it("respects upToRank when filtering generated files", async () => {
    const earlyFile = await FileFactory.create(auth, user, {
      contentType: "text/plain",
      fileName: "early.txt",
      fileSize: 10,
      status: "ready",
      useCase: "tool_output",
      snippet: "early",
    });
    const lateFile = await FileFactory.create(auth, user, {
      contentType: "text/plain",
      fileName: "late.txt",
      fileSize: 10,
      status: "ready",
      useCase: "tool_output",
      snippet: "late",
    });

    const earlyAgentMessage =
      await ConversationFactory.createAgentMessageWithRank({
        workspace,
        conversationId: conversation.id,
        rank: 1,
        agentConfigurationId: agentConfig.sId,
        agentConfigurationVersion: agentConfig.version,
        parentId: null,
      });
    const { action: earlyAction } = await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId: earlyAgentMessage.agentMessageId!,
      status: "succeeded",
    });
    const earlyOutputRes = await earlyAction.createOutputItems(auth, [
      { content: { type: "text", text: "early" }, fileId: earlyFile.id },
    ]);
    expect(earlyOutputRes.isOk()).toBe(true);

    const lateAgentMessage =
      await ConversationFactory.createAgentMessageWithRank({
        workspace,
        conversationId: conversation.id,
        rank: 3,
        agentConfigurationId: agentConfig.sId,
        agentConfigurationVersion: agentConfig.version,
        parentId: null,
      });
    const { action: lateAction } = await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId: lateAgentMessage.agentMessageId!,
      status: "succeeded",
    });
    const lateOutputRes = await lateAction.createOutputItems(auth, [
      { content: { type: "text", text: "late" }, fileId: lateFile.id },
    ]);
    expect(lateOutputRes.isOk()).toBe(true);

    const all = await AgentMCPActionResource.listGeneratedFilesForConversation(
      auth,
      {
        conversationId: conversation.id,
      }
    );
    expect(all.map((f) => f.title).sort()).toEqual(["early.txt", "late.txt"]);

    const upToRank2 =
      await AgentMCPActionResource.listGeneratedFilesForConversation(auth, {
        conversationId: conversation.id,
        upToRank: 2,
      });
    expect(upToRank2).toHaveLength(1);
    expect(upToRank2[0].title).toBe("early.txt");
  });

  it("skips path-only generated files without a fileId", async () => {
    const { action } = await ConversationFactory.createAgentMessage(auth, {
      workspace,
      conversation,
      agentConfig,
      mcpAction: { toolConfiguration },
    });
    assert(action);

    const pathOnlyContent = {
      type: "resource" as const,
      resource: {
        uri: "file://conversation/out.txt",
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE_PATH,
        text: "path only",
        path: "/files/conversation/out.txt",
        title: "out.txt",
        contentType: "text/plain",
      } satisfies ToolGeneratedFilePathType,
    };

    const outputRes = await action.createOutputItems(auth, [
      { content: pathOnlyContent },
    ]);
    expect(outputRes.isOk()).toBe(true);

    const result =
      await AgentMCPActionResource.listGeneratedFilesForConversation(auth, {
        conversationId: conversation.id,
      });

    expect(result).toEqual([]);
  });
});

describe("fetchByStepContents", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationType;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
  });

  async function createAgentMessage(rank: number): Promise<ModelId> {
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: `Test Agent ${rank}`,
    });

    const userMessageRow = await ConversationFactory.createUserMessageWithRank({
      auth,
      workspace,
      conversationId: conversation.id,
      rank,
      content: "Test message",
    });

    const agentMessageRow =
      await ConversationFactory.createAgentMessageWithRank({
        workspace,
        conversationId: conversation.id,
        rank: rank + 1,
        agentConfigurationId: agentConfig.sId,
        agentConfigurationVersion: agentConfig.version,
        parentId: userMessageRow.id,
      });

    return agentMessageRow.agentMessageId!;
  }

  function createAction(agentMessageModelId: ModelId, step: number) {
    return AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId,
      status: "succeeded",
      step,
    });
  }

  it("should return the actions of every given agent message", async () => {
    const firstAgentMessageId = await createAgentMessage(0);
    const secondAgentMessageId = await createAgentMessage(2);

    const { action: firstAction } = await createAction(firstAgentMessageId, 1);
    const { action: secondAction } = await createAction(
      secondAgentMessageId,
      1
    );

    const stepContents = await AgentStepContentResource.fetchByAgentMessages(
      auth,
      { agentMessageIds: [firstAgentMessageId, secondAgentMessageId] }
    );

    const actions = await AgentMCPActionResource.fetchByStepContents(auth, {
      stepContents,
    });

    expect(actions.map((a) => a.id).sort()).toEqual(
      [firstAction.id, secondAction.id].sort()
    );
  });

  it("should only return the actions of the given step contents", async () => {
    const agentMessageId = await createAgentMessage(0);
    const { action: firstAction } = await createAction(agentMessageId, 1);
    await createAction(agentMessageId, 2);

    const actions = await AgentMCPActionResource.fetchByStepContents(auth, {
      stepContents: [firstAction.stepContent],
    });

    expect(actions.map((a) => a.id)).toEqual([firstAction.id]);
  });

  it("should return no action when no step content is a function call", async () => {
    const agentMessageId = await createAgentMessage(0);
    await createAction(agentMessageId, 1);

    const textContent = await AgentStepContentResource.createNewVersion({
      workspaceId: workspace.id,
      agentMessageId,
      step: 1,
      index: 42,
      type: "text_content",
      value: { type: "text_content", value: "Some text" },
    });

    const actions = await AgentMCPActionResource.fetchByStepContents(auth, {
      stepContents: [textContent],
    });

    expect(actions).toEqual([]);
  });

  it("should exclude sandbox child actions sharing their parent step content", async () => {
    const agentMessageId = await createAgentMessage(0);
    const { action: parentAction } = await createAction(agentMessageId, 1);

    await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId: agentMessageId,
      status: "succeeded",
      step: 1,
      parentAction,
      sandboxChildActionInfo: { parentActionId: parentAction.sId },
    });

    const stepContents = await AgentStepContentResource.fetchByAgentMessages(
      auth,
      { agentMessageIds: [agentMessageId] }
    );

    const actions = await AgentMCPActionResource.fetchByStepContents(auth, {
      stepContents,
    });

    expect(actions.map((a) => a.id)).toEqual([parentAction.id]);
  });
});

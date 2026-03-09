import type {
  LightMCPToolConfigurationType,
  LightServerSideMCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMCPActionModel,
  AgentMCPActionOutputItemModel,
} from "@app/lib/models/agent/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type {
  ConversationType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory GCS mock: writes persist content that reads can return.
const gcsStore = new Map<string, Buffer>();

vi.mock("@app/lib/file_storage", () => ({
  getPrivateUploadBucket: vi.fn(() => ({
    file: vi.fn((path: string) => ({
      save: vi.fn(async (data: Buffer) => {
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
    delete: vi.fn(async (path: string, opts?: { ignoreNotFound?: boolean }) => {
      if (!gcsStore.has(path) && !opts?.ignoreNotFound) {
        throw new Error(`GCS file not found: ${path}`);
      }
      gcsStore.delete(path);
    }),
  })),
}));

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

  let stepContentIndex = 0;

  beforeEach(async () => {
    stepContentIndex = 0;

    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
  });

  async function createBlockedAction({
    agentMessageId,
    status = "blocked_validation_required",
  }: {
    agentMessageId: number;
    status?: ToolExecutionStatus;
  }) {
    const functionCallId = generateRandomModelSId();
    const currentIndex = stepContentIndex++;

    const stepContent = await AgentStepContentModel.create({
      workspaceId: workspace.id,
      agentMessageId,
      step: 1,
      index: currentIndex,
      version: 0,
      type: "function_call",
      value: {
        type: "function_call",
        value: {
          id: functionCallId,
          name: "test_tool",
          arguments: "{}",
        },
      },
    });

    const toolConfiguration: LightMCPToolConfigurationType = {
      id: 1,
      sId: generateRandomModelSId(),
      type: "mcp_configuration",
      name: "test_tool",
      dataSources: null,
      tables: null,
      childAgentId: null,
      timeFrame: null,
      jsonSchema: null,
      additionalConfiguration: {},
      mcpServerViewId: "test-server-view",
      dustAppConfiguration: null,
      secretName: null,
      dustProject: null,
      internalMCPServerId: null,
      availability: "auto",
      permission: "low",
      toolServerId: "test-server",
      retryPolicy: "no_retry",
      originalName: "test_tool",
      mcpServerName: "test_server",
    };

    const action = await AgentMCPActionModel.create({
      workspaceId: workspace.id,
      agentMessageId,
      stepContentId: stepContent.id,
      mcpServerConfigurationId: generateRandomModelSId(),
      version: 0,
      status,
      citationsAllocated: 0,
      augmentedInputs: {},
      toolConfiguration,
      stepContext: {
        citationsCount: 0,
        citationsOffset: 0,
        resumeState: null,
        retrievalTopK: 10,
        websearchResultCount: 5,
      },
    });

    return { action, stepContent };
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

    await createBlockedAction({
      agentMessageId: agentMessageRow.agentMessageId!,
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

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("blocked_validation_required");
    expect(result[0].metadata.agentName).toBe("Test Agent");
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
      agentMessageId: agentMessageRow.agentMessageId!,
    });
    await createBlockedAction({
      agentMessageId: agentMessageRow.agentMessageId!,
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
      agentMessageId: agentMessageV0Row.agentMessageId!,
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
      agentMessageId: agentMessageV1Row.agentMessageId!,
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
    const expectedActionSId = AgentMCPActionResource.modelIdToSId({
      id: v1Action.id,
      workspaceId: workspace.id,
    });
    expect(result[0].actionId).toBe(expectedActionSId);
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

    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
    });

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
  });

  const createActionWithOutputItems = async (
    contents: Array<{ type: "text"; text: string }>
  ) => {
    const { action } = await ConversationFactory.createAgentMessage(auth, {
      workspace,
      conversation,
      agentConfig,
      mcpAction: { toolConfiguration },
    });

    expect(action).toBeDefined();

    const outputItems = await action!.createOutputItems(
      auth,
      contents.map((c) => ({ content: c }))
    );

    return { action: action!, outputItems };
  };

  it("should create output items in both DB and GCS", async () => {
    const { outputItems } = await createActionWithOutputItems([
      { type: "text", text: "Hello from GCS" },
    ]);

    expect(outputItems).toHaveLength(1);
    expect(outputItems[0].content).toEqual({
      type: "text",
      text: "Hello from GCS",
    });

    // contentGcsPath should be set (GCS write succeeded).
    expect(outputItems[0].contentGcsPath).toBeTruthy();

    // GCS store should have one entry.
    expect(gcsStore.size).toBe(1);
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
      await AgentMCPActionResource.fetchOutputItemsByActionIds(auth, [
        action.id,
      ]);

    const items = outputItemsByActionId.get(action.id);
    expect(items).toBeDefined();
    expect(items).toHaveLength(1);

    // Content should match the GCS version, proving it was read from GCS.
    expect(items![0].content).toEqual({ type: "text", text: "from GCS" });
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
      await AgentMCPActionResource.fetchOutputItemsByActionIds(auth, [
        action1.id,
        action2.id,
      ]);

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
      [action2.id]
    );
    const items = remaining.get(action2.id);
    expect(items).toHaveLength(1);
    expect(items![0].content).toEqual({
      type: "text",
      text: "Action 2 content",
    });
  });
});

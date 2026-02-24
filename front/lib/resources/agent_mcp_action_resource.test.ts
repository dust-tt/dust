import type { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionModel } from "@app/lib/models/agent/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

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

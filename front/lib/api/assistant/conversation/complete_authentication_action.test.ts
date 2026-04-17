import { beforeEach, describe, expect, it, vi } from "vitest";

const { removeEventMock } = vi.hoisted(() => ({
  removeEventMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: vi.fn().mockResolvedValue({ isOk: () => true }),
}));

vi.mock("@app/lib/api/redis-hybrid-manager", () => ({
  getRedisHybridManager: vi.fn().mockReturnValue({
    removeEvent: removeEventMock,
  }),
}));

import type { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { completeAuthenticationAction } from "@app/lib/api/assistant/conversation/complete_authentication_action";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPActionModel } from "@app/lib/models/agent/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { WorkspaceType } from "@app/types/user";

describe("completeAuthenticationAction", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationType;
  let stepContentIndex = 0;

  beforeEach(async () => {
    vi.clearAllMocks();
    removeEventMock.mockClear();
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
    status = "blocked_authentication_required",
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

    const actionSId = AgentMCPActionResource.modelIdToSId({
      id: action.id,
      workspaceId: workspace.id,
    });

    return { action, actionSId };
  }

  async function createAgentMessageChain() {
    const { messageRow } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: "Test message",
    });

    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
    });

    const agentMessageRow = await AgentMessageModel.create({
      workspaceId: workspace.id,
      status: "created",
      agentConfigurationId: agentConfig.sId,
      agentConfigurationVersion: 0,
      skipToolsValidation: false,
    });

    const agentMessageMessage = await MessageModel.create({
      workspaceId: workspace.id,
      sId: generateRandomModelSId(),
      conversationId: conversation.id,
      rank: 1,
      parentId: messageRow.id,
      agentMessageId: agentMessageRow.id,
    });

    return { agentMessageRow, agentMessageMessage };
  }

  it("marks the action as ready and relaunches the loop", async () => {
    const { agentMessageRow, agentMessageMessage } =
      await createAgentMessageChain();
    const { action, actionSId } = await createBlockedAction({
      agentMessageId: agentMessageRow.id,
    });

    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    expect(conversationResource).not.toBeNull();

    const result = await completeAuthenticationAction(
      auth,
      conversationResource!,
      {
        actionId: actionSId,
        messageId: agentMessageMessage.sId,
      }
    );

    expect(result.isOk()).toBe(true);

    await action.reload();
    expect(action.status).toBe("ready_allowed_explicitly");
    expect(removeEventMock).toHaveBeenCalledTimes(1);
    expect(launchAgentLoopWorkflow).toHaveBeenCalledTimes(1);
  });

  it("returns unauthorized when another user tries to complete the action", async () => {
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    const otherUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );

    const { agentMessageRow, agentMessageMessage } =
      await createAgentMessageChain();
    const { actionSId } = await createBlockedAction({
      agentMessageId: agentMessageRow.id,
    });

    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    expect(conversationResource).not.toBeNull();

    const result = await completeAuthenticationAction(
      otherUserAuth!,
      conversationResource!,
      {
        actionId: actionSId,
        messageId: agentMessageMessage.sId,
      }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("unauthorized");
    }
  });

  it("returns action_not_blocked when the action is in another status", async () => {
    const { agentMessageRow, agentMessageMessage } =
      await createAgentMessageChain();
    const { actionSId } = await createBlockedAction({
      agentMessageId: agentMessageRow.id,
      status: "blocked_validation_required",
    });

    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    expect(conversationResource).not.toBeNull();

    const result = await completeAuthenticationAction(
      auth,
      conversationResource!,
      {
        actionId: actionSId,
        messageId: agentMessageMessage.sId,
      }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("action_not_blocked");
    }
  });

  it("does not relaunch the loop when another blocked action remains", async () => {
    const { agentMessageRow, agentMessageMessage } =
      await createAgentMessageChain();
    const { actionSId } = await createBlockedAction({
      agentMessageId: agentMessageRow.id,
    });
    await createBlockedAction({
      agentMessageId: agentMessageRow.id,
      status: "blocked_validation_required",
    });

    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    expect(conversationResource).not.toBeNull();

    const result = await completeAuthenticationAction(
      auth,
      conversationResource!,
      {
        actionId: actionSId,
        messageId: agentMessageMessage.sId,
      }
    );

    expect(result.isOk()).toBe(true);
    expect(launchAgentLoopWorkflow).not.toHaveBeenCalled();
  });
});

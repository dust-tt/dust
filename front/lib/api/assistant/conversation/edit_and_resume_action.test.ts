import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: vi.fn().mockResolvedValue({ isOk: () => true }),
}));

vi.mock("@app/lib/api/redis-hybrid-manager", () => ({
  getRedisHybridManager: vi.fn().mockReturnValue({
    removeEvent: vi.fn().mockResolvedValue(undefined),
  }),
}));

import type { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { editAndResumeAction } from "@app/lib/api/assistant/conversation/edit_and_resume_action";
import { Authenticator } from "@app/lib/auth";
import { AgentStepContentToolExecutionModel } from "@app/lib/models/agent/actions/agent_step_content_tool_execution";
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
import type { ConversationType } from "@app/types/assistant/conversation";
import type { WorkspaceType } from "@app/types/user";

describe("editAndResumeAction", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationType;
  let conversationResource: ConversationResource;
  let agentMessageId: number;
  let messageRowSId: string;
  let stepContentIndex = 0;

  beforeEach(async () => {
    vi.clearAllMocks();
    stepContentIndex = 0;

    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
    });

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });

    conversationResource = (await ConversationResource.fetchById(
      auth,
      conversation.sId
    ))!;

    const { messageRow: userMessageRow } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: "Test message",
      });

    const agentMessageRow = await AgentMessageModel.create({
      workspaceId: workspace.id,
      status: "created",
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: 0,
      skipToolsValidation: false,
    });
    agentMessageId = agentMessageRow.id;

    const agentMsgRow = await MessageModel.create({
      workspaceId: workspace.id,
      sId: generateRandomModelSId(),
      conversationId: conversation.id,
      rank: 1,
      parentId: userMessageRow.id,
      agentMessageId: agentMessageRow.id,
    });
    messageRowSId = agentMsgRow.sId;
  });

  async function createEditableAction({
    status = "blocked_validation_required" as ToolExecutionStatus,
    editableArguments = ["body", "subject"] as string[],
    augmentedInputs = {
      body: "original body",
      subject: "original subject",
    } as Record<string, unknown>,
    permission = "editable" as LightMCPToolConfigurationType["permission"],
  } = {}) {
    const index = stepContentIndex++;

    const stepContent = await AgentStepContentModel.create({
      workspaceId: workspace.id,
      agentMessageId,
      step: 0,
      index,
      version: 0,
      type: "function_call",
      value: {
        type: "function_call",
        value: {
          id: generateRandomModelSId(),
          name: "send_email",
          arguments: JSON.stringify(augmentedInputs),
        },
      },
    });

    const toolConfiguration: LightMCPToolConfigurationType = {
      id: 1,
      sId: generateRandomModelSId(),
      type: "mcp_configuration",
      name: "send_email",
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
      permission,
      toolServerId: "test-server",
      retryPolicy: "no_retry",
      originalName: "send_email",
      mcpServerName: "test_email_server",
      ...(permission === "editable" ? { editableArguments } : {}),
    };

    const action = await AgentMCPActionModel.create({
      workspaceId: workspace.id,
      agentMessageId,
      mcpServerConfigurationId: generateRandomModelSId(),
      status,
      citationsAllocated: 0,
      augmentedInputs,
      toolConfiguration,
      stepContentId: stepContent.id,
      stepContext: {
        citationsCount: 0,
        citationsOffset: 0,
        resumeState: null,
        retrievalTopK: 10,
        websearchResultCount: 5,
      },
    });

    await AgentStepContentToolExecutionModel.create({
      workspaceId: workspace.id,
      conversationId: conversation.id,
      agentMessageId,
      agentMCPActionId: action.id,
      stepContentId: stepContent.id,
    });

    const actionId = AgentMCPActionResource.modelIdToSId({
      id: action.id,
      workspaceId: workspace.id,
    });

    return { action, actionId, stepContent };
  }

  it("creates a new agent message version with edited inputs and ready status", async () => {
    const { actionId } = await createEditableAction();

    const result = await editAndResumeAction(auth, conversationResource, {
      actionId,
      messageId: messageRowSId,
      editedInputs: { body: "edited body", subject: "edited subject" },
    });

    expect(result.isOk()).toBe(true);

    // Verify a new MessageModel version was created at the same rank
    const messages = await MessageModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        rank: 1,
      },
      order: [["version", "ASC"]],
    });
    expect(messages.length).toBe(2);
    expect(messages[1].version).toBe(1);

    // Verify new step content has the edited arguments
    const newAgentMessageModelId = messages[1].agentMessageId!;
    const newStepContents = await AgentStepContentModel.findAll({
      where: {
        workspaceId: workspace.id,
        agentMessageId: newAgentMessageModelId,
      },
    });
    expect(newStepContents.length).toBeGreaterThan(0);
    const functionCallContent = newStepContents.find(
      (sc) => sc.type === "function_call"
    );
    expect(functionCallContent).toBeDefined();

    const args = JSON.parse(
      (functionCallContent!.value as { type: string; value: { arguments: string } })
        .value.arguments
    );
    expect(args.body).toBe("edited body");
    expect(args.subject).toBe("edited subject");

    // Verify the new action has ready_allowed_explicitly status and edited inputs
    const newAction = await AgentMCPActionModel.findOne({
      where: {
        workspaceId: workspace.id,
        agentMessageId: newAgentMessageModelId,
      },
    });
    expect(newAction).toBeDefined();
    expect(newAction!.status).toBe("ready_allowed_explicitly");
    expect((newAction!.augmentedInputs as Record<string, unknown>).body).toBe(
      "edited body"
    );
    expect(
      (newAction!.augmentedInputs as Record<string, unknown>).subject
    ).toBe("edited subject");

    // Verify launchAgentLoopWorkflow was called at step 0
    expect(launchAgentLoopWorkflow).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(launchAgentLoopWorkflow).mock.calls[0][0];
    expect(callArgs.startStep).toBe(0);
    expect(callArgs.agentLoopArgs.agentMessageVersion).toBe(1);
  });

  it("marks the original blocked action as denied", async () => {
    const { action, actionId } = await createEditableAction();

    await editAndResumeAction(auth, conversationResource, {
      actionId,
      messageId: messageRowSId,
      editedInputs: { body: "edited body" },
    });

    const updatedAction = await AgentMCPActionModel.findByPk(action.id);
    expect(updatedAction!.status).toBe("denied");
  });

  it("rejects when tool is not editable (high stake)", async () => {
    const { actionId } = await createEditableAction({ permission: "high" });

    const result = await editAndResumeAction(auth, conversationResource, {
      actionId,
      messageId: messageRowSId,
      editedInputs: {},
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("tool_not_editable");
    }
  });

  it("rejects when action is not blocked (succeeded status)", async () => {
    const { actionId } = await createEditableAction({ status: "succeeded" });

    const result = await editAndResumeAction(auth, conversationResource, {
      actionId,
      messageId: messageRowSId,
      editedInputs: { body: "new body" },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("action_not_blocked");
    }
  });

  it("rejects when editing an out-of-scope key", async () => {
    const { actionId } = await createEditableAction({
      editableArguments: ["body"],
    });

    const result = await editAndResumeAction(auth, conversationResource, {
      actionId,
      messageId: messageRowSId,
      editedInputs: { body: "new body", forbidden_field: "hacked" },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_edited_inputs");
    }
  });

  it("returns action_not_found for a non-existent action", async () => {
    const result = await editAndResumeAction(auth, conversationResource, {
      actionId: "non-existent-action-id",
      messageId: messageRowSId,
      editedInputs: {},
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("action_not_found");
    }
  });

  it("preserves original inputs for fields not in editedInputs", async () => {
    const { actionId } = await createEditableAction({
      augmentedInputs: {
        body: "original body",
        subject: "original subject",
        to: "user@example.com",
      },
    });

    const result = await editAndResumeAction(auth, conversationResource, {
      actionId,
      messageId: messageRowSId,
      editedInputs: { body: "edited body" },
    });

    expect(result.isOk()).toBe(true);

    const messages = await MessageModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        rank: 1,
      },
      order: [["version", "ASC"]],
    });
    const newAgentMessageModelId = messages[1].agentMessageId!;

    const newAction = await AgentMCPActionModel.findOne({
      where: { workspaceId: workspace.id, agentMessageId: newAgentMessageModelId },
    });
    expect(newAction).toBeDefined();
    const inputs = newAction!.augmentedInputs as Record<string, unknown>;
    expect(inputs.body).toBe("edited body");
    expect(inputs.subject).toBe("original subject");
    expect(inputs.to).toBe("user@example.com");
  });
});

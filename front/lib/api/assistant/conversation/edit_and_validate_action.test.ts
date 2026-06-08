import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: vi.fn().mockResolvedValue({ isOk: () => true }),
}));

vi.mock("@app/lib/api/redis-hybrid-manager", () => ({
  getRedisHybridManager: vi.fn().mockReturnValue({
    removeEvent: vi.fn().mockResolvedValue(undefined),
  }),
}));

import type { LightServerSideMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { editAndValidateAction } from "@app/lib/api/assistant/conversation/edit_and_validate_action";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { WorkspaceType } from "@app/types/user";

function makeToolConfiguration({
  editable = true,
}: {
  editable?: boolean;
} = {}): LightServerSideMCPToolConfigurationType {
  return {
    id: 1,
    sId: generateRandomModelSId(),
    type: "mcp_configuration",
    name: "gmail_send_mail",
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
    internalMCPServerId: "gmail-server",
    availability: "auto",
    permission: "low",
    toolServerId: "test-server",
    retryPolicy: "no_retry",
    originalName: "send_mail",
    mcpServerName: "gmail",
    ...(editable
      ? {
          editable: {
            isEditable: true,
            editableArguments: ["subject"],
          },
        }
      : {}),
  };
}

describe("editAndValidateAction", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationType;

  beforeEach(async () => {
    vi.clearAllMocks();

    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
  });

  async function createAgentMessageWithBlockedAction({
    augmentedInputs = {
      subject: "Old subject",
      to: "user@example.com",
      body: "Hello",
    },
    editable = true,
    status = "blocked_validation_required",
  }: {
    augmentedInputs?: Record<string, unknown>;
    editable?: boolean;
    status?: ToolExecutionStatus;
  } = {}) {
    const { messageRow: userMessageRow } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: "Send an email",
      });

    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
    });

    const { agentMessage, action } =
      await ConversationFactory.createAgentMessage(auth, {
        workspace,
        conversation,
        agentConfig,
        parentMessageId: userMessageRow.id,
        rank: 1,
        mcpAction: {
          toolConfiguration: makeToolConfiguration({ editable }),
          status,
          augmentedInputs,
        },
      });

    expect(action).toBeDefined();

    return {
      actionId: action!.sId,
      messageId: agentMessage.sId,
      stepContentId: action!.stepContent.id,
    };
  }

  async function reloadAction(actionId: string) {
    const action = await AgentMCPActionResource.fetchById(auth, actionId);
    expect(action).not.toBeNull();

    return action!;
  }

  async function reloadStepContentValue(stepContentId: number) {
    const stepContent = await AgentStepContentResource.fetchByModelIdWithAuth(
      auth,
      stepContentId
    );
    expect(stepContent).not.toBeNull();

    return stepContent!.value;
  }

  async function getConversationResource() {
    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    expect(conversationResource).not.toBeNull();

    return conversationResource!;
  }

  it("updates editable inputs, stores user-edited inputs, and approves the action", async () => {
    const { actionId, messageId, stepContentId } =
      await createAgentMessageWithBlockedAction();
    const conversationResource = await getConversationResource();

    const result = await editAndValidateAction(auth, conversationResource, {
      actionId,
      approvalState: "approved",
      editedArguments: {
        subject: "New subject",
      },
      messageId,
    });

    expect(result.isOk()).toBe(true);

    const action = await reloadAction(actionId);
    expect(action.augmentedInputs).toEqual({
      subject: "Old subject",
      to: "user@example.com",
      body: "Hello",
    });
    expect(action.userEditedInputs).toEqual({
      subject: "New subject",
    });
    expect(action.toJSON().params).toEqual({
      subject: "Old subject",
      to: "user@example.com",
      body: "Hello",
    });
    expect(action.toJSON().userEditedInputs).toEqual({
      subject: "New subject",
    });
    expect(action.status).toBe("ready_allowed_explicitly");

    const stepContentValue = await reloadStepContentValue(stepContentId);
    expect(stepContentValue).toMatchObject({
      value: {
        arguments: JSON.stringify({
          subject: "Old subject",
          to: "user@example.com",
          body: "Hello",
        }),
      },
    });

    expect(vi.mocked(launchAgentLoopWorkflow)).toHaveBeenCalledTimes(1);
  });

  it("supports always_approved", async () => {
    const { actionId, messageId } = await createAgentMessageWithBlockedAction();
    const conversationResource = await getConversationResource();

    const result = await editAndValidateAction(auth, conversationResource, {
      actionId,
      approvalState: "always_approved",
      editedArguments: {
        subject: "New subject",
      },
      messageId,
    });

    expect(result.isOk()).toBe(true);

    const action = await reloadAction(actionId);
    expect(action.status).toBe("ready_allowed_explicitly");
  });

  it("rejects edits to non-editable arguments", async () => {
    const { actionId, messageId } = await createAgentMessageWithBlockedAction();
    const conversationResource = await getConversationResource();

    const result = await editAndValidateAction(auth, conversationResource, {
      actionId,
      approvalState: "approved",
      editedArguments: {
        body: "Updated body",
      },
      messageId,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_edited_arguments");
    }

    const action = await reloadAction(actionId);
    expect(action.augmentedInputs).toEqual({
      subject: "Old subject",
      to: "user@example.com",
      body: "Hello",
    });
    expect(action.status).toBe("blocked_validation_required");
    expect(action.userEditedInputs).toBeNull();
    expect(vi.mocked(launchAgentLoopWorkflow)).not.toHaveBeenCalled();
  });

  it("rejects non-editable actions", async () => {
    const { actionId, messageId } = await createAgentMessageWithBlockedAction({
      editable: false,
    });
    const conversationResource = await getConversationResource();

    const result = await editAndValidateAction(auth, conversationResource, {
      actionId,
      approvalState: "approved",
      editedArguments: {
        subject: "New subject",
      },
      messageId,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("action_not_editable");
    }

    const action = await reloadAction(actionId);
    expect(action.augmentedInputs).toEqual({
      subject: "Old subject",
      to: "user@example.com",
      body: "Hello",
    });
    expect(action.status).toBe("blocked_validation_required");
    expect(action.userEditedInputs).toBeNull();
    expect(vi.mocked(launchAgentLoopWorkflow)).not.toHaveBeenCalled();
  });

  it("validates without storing user-edited inputs when editable values are unchanged", async () => {
    const { actionId, messageId } = await createAgentMessageWithBlockedAction();
    const conversationResource = await getConversationResource();

    const result = await editAndValidateAction(auth, conversationResource, {
      actionId,
      approvalState: "approved",
      editedArguments: {
        subject: "Old subject",
      },
      messageId,
    });

    expect(result.isOk()).toBe(true);

    const action = await reloadAction(actionId);
    expect(action.augmentedInputs).toEqual({
      subject: "Old subject",
      to: "user@example.com",
      body: "Hello",
    });
    expect(action.status).toBe("ready_allowed_explicitly");
    expect(action.userEditedInputs).toBeNull();
    expect(vi.mocked(launchAgentLoopWorkflow)).toHaveBeenCalledTimes(1);
  });
});

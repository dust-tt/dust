import type {
  ActionApprovalStateType,
  LightMCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import {
  getMCPApprovalStateFromUserApprovalState,
  isMCPApproveExecutionEvent,
} from "@app/lib/actions/mcp";
import {
  extractArgRequiringApprovalValues,
  setUserAlwaysApprovedTool,
} from "@app/lib/actions/tool_status";
import { getUserMessageIdFromMessageId } from "@app/lib/api/assistant/conversation/messages";
import { getMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SandboxMCPActionResource } from "@app/lib/resources/sandbox_mcp_action_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Persists "always approved" rules for a tool when the user selects that option.
 * Shared between regular and sandbox action validation flows.
 */
async function handleAlwaysApproved(
  auth: Authenticator,
  user: UserResource,
  {
    toolConfiguration,
    functionCallName,
    augmentedInputs,
    agentMessageId,
  }: {
    toolConfiguration: LightMCPToolConfigurationType;
    functionCallName: string;
    augmentedInputs: Record<string, unknown>;
    agentMessageId: ModelId;
  }
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  switch (toolConfiguration.permission) {
    case "low":
      await setUserAlwaysApprovedTool(auth, {
        mcpServerId: toolConfiguration.toolServerId,
        functionCallName,
      });
      break;
    case "medium": {
      const agentMessage = await AgentMessageModel.findOne({
        where: {
          workspaceId: owner.id,
          id: agentMessageId,
        },
      });
      if (agentMessage) {
        const argumentsRequiringApproval =
          toolConfiguration.argumentsRequiringApproval ?? [];
        const argsAndValues = extractArgRequiringApprovalValues(
          argumentsRequiringApproval,
          augmentedInputs
        );

        await user.createToolApproval(auth, {
          mcpServerId: toolConfiguration.toolServerId,
          toolName: functionCallName,
          agentId: agentMessage.agentConfigurationId,
          argsAndValues,
        });
      }
      break;
    }
    default:
      break;
  }
}

export async function validateAction(
  auth: Authenticator,
  conversation: ConversationResource,
  {
    actionId,
    approvalState,
    messageId,
  }: {
    actionId: string;
    approvalState: ActionApprovalStateType;
    messageId: string;
  }
): Promise<Result<void, DustError>> {
  const owner = auth.getNonNullableWorkspace();
  const user = auth.user();
  const { sId: conversationId, title: conversationTitle } = conversation;

  logger.info(
    {
      actionId,
      messageId,
      approvalState,
      conversationId,
      workspaceId: owner.sId,
      userId: user?.sId,
    },
    "Tool validation request"
  );

  const {
    agentMessageId,
    agentMessageVersion,
    userMessageId,
    userMessageVersion,
    userMessageUserId,
    userMessageOrigin,
    branchId,
  } = await getUserMessageIdFromMessageId(auth, {
    messageId,
  });

  if (userMessageUserId !== user?.id) {
    return new Err(
      new DustError(
        "unauthorized",
        "User is not authorized to validate this action"
      )
    );
  }

  // Try regular MCP action first, then sandbox action.
  const action = await AgentMCPActionResource.fetchById(auth, actionId);

  if (!action) {
    return validateSandboxAction(auth, {
      actionId,
      approvalState,
      messageId,
      conversationId,
    });
  }

  // --- Regular MCP action validation flow ---

  const agentStepContent =
    await AgentStepContentResource.fetchByModelIdWithAuth(
      auth,
      action.stepContentId
    );
  if (!agentStepContent) {
    return new Err(
      new DustError(
        "internal_error",
        `Agent step content not found: ${action.stepContentId}`
      )
    );
  }

  if (action.status !== "blocked_validation_required") {
    return new Err(
      new DustError(
        "action_not_blocked",
        `Action is not blocked: ${action.status}`
      )
    );
  }

  const [updatedCount] = await action.updateStatus(
    getMCPApprovalStateFromUserApprovalState(approvalState)
  );

  if (approvalState === "always_approved" && user) {
    await handleAlwaysApproved(auth, user, {
      toolConfiguration: action.toolConfiguration,
      functionCallName: action.functionCallName,
      augmentedInputs: action.augmentedInputs,
      agentMessageId: action.agentMessageId,
    });
  }

  if (updatedCount === 0) {
    logger.info(
      {
        actionId,
        messageId,
        approvalState,
        workspaceId: owner.sId,
        userId: user?.sId,
      },
      "Action already approved or rejected"
    );

    return new Ok(undefined);
  }

  // Remove the tool approval request event from the message channel.
  await getRedisHybridManager().removeEvent((event) => {
    const payload = JSON.parse(event.message["payload"]);
    return isMCPApproveExecutionEvent(payload)
      ? payload.actionId === actionId
      : false;
  }, getMessageChannelId(messageId));

  // We only launch the agent loop if there are no remaining blocked actions.
  // Sandbox blocked actions are NOT included — they are handled independently
  // by the sandbox client polling for status.
  const blockedActions =
    await AgentMCPActionResource.listBlockedActionsForConversation(
      auth,
      conversation
    );

  // We only trigger an agent loop after the user has validated all actions
  // for the current message.
  // There is a harmless very rare race condition here where 2 validations get
  // blockedActions.length === 0. launchAgentLoopWorkflow will be called twice,
  // but only one will succeed.
  if (
    blockedActions.filter((action) => action.messageId === messageId).length > 0
  ) {
    logger.info(
      {
        blockedActions,
      },
      "Skipping agent loop launch because there are remaining blocked actions"
    );
    return new Ok(undefined);
  }

  await launchAgentLoopWorkflow({
    auth,
    agentLoopArgs: {
      agentMessageId,
      agentMessageVersion,
      conversationId,
      conversationTitle,
      conversationBranchId: branchId,
      userMessageId,
      userMessageVersion,
      userMessageOrigin,
    },
    // Resume from the step where the action was created.
    startStep: agentStepContent.step,
    // Wait for completion of the agent loop workflow that triggered the
    // validation. This avoids race conditions where validation re-triggers the
    // agent loop before it completes, and thus throws a workflow already
    // started error.
    waitForCompletion: true,
  });

  logger.info(
    {
      workspaceId: auth.getNonNullableWorkspace().id,
      conversationId,
      messageId,
      actionId,
    },
    `Action ${approvalState === "approved" ? "approved" : "rejected"} by user`
  );

  return new Ok(undefined);
}

/**
 * Validates a sandbox-originated action. Sandbox actions don't trigger an agent
 * loop re-launch — the agent loop is already running (the sandbox bash tool is
 * executing), and the sandbox client polls for the status change.
 */
async function validateSandboxAction(
  auth: Authenticator,
  {
    actionId,
    approvalState,
    messageId,
    conversationId,
  }: {
    actionId: string;
    approvalState: ActionApprovalStateType;
    messageId: string;
    conversationId: string;
  }
): Promise<Result<void, DustError>> {
  const owner = auth.getNonNullableWorkspace();
  const user = auth.user();

  const sandboxAction = await SandboxMCPActionResource.fetchById(
    auth,
    actionId
  );
  if (!sandboxAction) {
    return new Err(
      new DustError("action_not_found", `Action not found: ${actionId}`)
    );
  }

  if (sandboxAction.status !== "blocked_validation_required") {
    return new Err(
      new DustError(
        "action_not_blocked",
        `Action is not blocked: ${sandboxAction.status}`
      )
    );
  }

  const [updatedCount] = await sandboxAction.updateStatus(
    getMCPApprovalStateFromUserApprovalState(approvalState)
  );

  if (approvalState === "always_approved" && user) {
    await handleAlwaysApproved(auth, user, {
      toolConfiguration: sandboxAction.toolConfiguration,
      functionCallName: sandboxAction.functionCallName,
      augmentedInputs: sandboxAction.augmentedInputs,
      agentMessageId: sandboxAction.agentMessageId,
    });
  }

  if (updatedCount === 0) {
    logger.info(
      {
        actionId,
        messageId,
        approvalState,
        workspaceId: owner.sId,
        userId: user?.sId,
      },
      "Sandbox action already approved or rejected"
    );
    return new Ok(undefined);
  }

  // Remove the tool approval request event from the message channel.
  await getRedisHybridManager().removeEvent((event) => {
    const payload = JSON.parse(event.message["payload"]);
    return isMCPApproveExecutionEvent(payload)
      ? payload.actionId === actionId
      : false;
  }, getMessageChannelId(messageId));

  // Do NOT launch the agent loop — the sandbox bash tool is still running.
  // The sandbox client polls for the status change and re-executes the tool.

  logger.info(
    {
      workspaceId: owner.id,
      conversationId,
      messageId,
      actionId,
    },
    `Sandbox action ${approvalState === "approved" ? "approved" : "rejected"} by user`
  );

  return new Ok(undefined);
}

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
import { isResourceSId } from "@app/lib/resources/string_ids";
import type { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

async function removeMCPApprovalEvent({
  actionId,
  messageId,
}: {
  actionId: string;
  messageId: string;
}): Promise<void> {
  await getRedisHybridManager().removeEvent((event) => {
    const payload = JSON.parse(event.message["payload"]);
    return isMCPApproveExecutionEvent(payload)
      ? payload.actionId === actionId
      : false;
  }, getMessageChannelId(messageId));
}

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

type UserMessageInfo = Awaited<
  ReturnType<typeof getUserMessageIdFromMessageId>
>;

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

  logger.info(
    {
      actionId,
      messageId,
      approvalState,
      conversationId: conversation.sId,
      workspaceId: owner.sId,
      userId: user?.sId,
    },
    "Tool validation request"
  );

  const userMessageInfo = await getUserMessageIdFromMessageId(auth, {
    messageId,
  });

  if (userMessageInfo.userMessageUserId !== user?.id) {
    return new Err(
      new DustError(
        "unauthorized",
        "User is not authorized to validate this action"
      )
    );
  }

  if (isResourceSId("sandbox_tool_execution", actionId)) {
    return handleSandboxAction(auth, {
      actionId,
      approvalState,
      messageId,
    });
  }

  return handleMCPAction(auth, conversation, {
    actionId,
    approvalState,
    messageId,
    userMessageInfo,
  });
}

async function handleMCPAction(
  auth: Authenticator,
  conversation: ConversationResource,
  {
    actionId,
    approvalState,
    messageId,
    userMessageInfo,
  }: {
    actionId: string;
    approvalState: ActionApprovalStateType;
    messageId: string;
    userMessageInfo: UserMessageInfo;
  }
): Promise<Result<void, DustError>> {
  const owner = auth.getNonNullableWorkspace();
  const user = auth.user();

  const action = await AgentMCPActionResource.fetchById(auth, actionId);
  if (!action) {
    return new Err(
      new DustError("action_not_found", `Action not found: ${actionId}`)
    );
  }

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

  await removeMCPApprovalEvent({ actionId, messageId });

  // We only launch the agent loop if there are no remaining blocked actions.
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
      "Skipping agent loop launch because there are remaining blocked actions for this message"
    );
    return new Ok(undefined);
  }

  await launchAgentLoopWorkflow({
    auth,
    agentLoopArgs: {
      agentMessageId: userMessageInfo.agentMessageId,
      agentMessageVersion: userMessageInfo.agentMessageVersion,
      conversationId: conversation.sId,
      conversationTitle: conversation.title,
      conversationBranchId: userMessageInfo.branchId,
      userMessageId: userMessageInfo.userMessageId,
      userMessageVersion: userMessageInfo.userMessageVersion,
      userMessageOrigin: userMessageInfo.userMessageOrigin,
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
      workspaceId: owner.id,
      conversationId: conversation.sId,
      messageId,
      actionId,
    },
    `Action ${approvalState === "approved" ? "approved" : "rejected"} by user`
  );

  return new Ok(undefined);
}

async function handleSandboxAction(
  auth: Authenticator,
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

  const sandboxExecution =
    await AgentMCPActionResource.fetchSandboxToolExecutionById(auth, actionId);
  if (!sandboxExecution) {
    return new Err(
      new DustError("action_not_found", `Action not found: ${actionId}`)
    );
  }

  if (sandboxExecution.status !== "blocked_validation_required") {
    return new Err(
      new DustError(
        "action_not_blocked",
        `Action is not blocked: ${sandboxExecution.status}`
      )
    );
  }

  const newStatus = getMCPApprovalStateFromUserApprovalState(approvalState);
  const { updatedCount } =
    await AgentMCPActionResource.updateSandboxToolExecutionStatus(
      auth,
      sandboxExecution.sId,
      newStatus
    );

  if (approvalState === "always_approved" && user) {
    await handleAlwaysApproved(auth, user, {
      toolConfiguration: sandboxExecution.toolConfiguration,
      functionCallName: sandboxExecution.functionCallName,
      augmentedInputs: sandboxExecution.augmentedInputs,
      agentMessageId: sandboxExecution.agentMessageId,
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
      "Sandbox execution already approved or rejected"
    );
    return new Ok(undefined);
  }

  await removeMCPApprovalEvent({ actionId, messageId });

  return new Ok(undefined);
}

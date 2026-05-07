import type { ActionApprovalStateType } from "@app/lib/actions/mcp";
import {
  getMCPApprovalStateFromUserApprovalState,
  isMCPApproveExecutionEvent,
} from "@app/lib/actions/mcp";
import {
  extractArgRequiringApprovalValues,
  setUserAlwaysApprovedTool,
} from "@app/lib/actions/tool_status";
import { isSandboxChildResumeState } from "@app/lib/actions/types";
import { getUserMessageIdFromMessageId } from "@app/lib/api/assistant/conversation/messages";
import { getMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import {
  launchAgentLoopWorkflow,
  launchSandboxChildToolWorkflow,
} from "@app/temporal/agent_loop/client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

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

  const action = await AgentMCPActionResource.fetchById(auth, actionId);
  if (!action) {
    return new Err(
      new DustError("action_not_found", `Action not found: ${actionId}`)
    );
  }

  const agentStepContent = action.stepContent;

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
    switch (action.toolConfiguration.permission) {
      case "low":
        await setUserAlwaysApprovedTool(auth, {
          mcpServerId: action.toolConfiguration.toolServerId,
          functionCallName: action.functionCallName,
        });
        break;
      case "medium":
        const agentMessage = await AgentMessageModel.findOne({
          where: {
            workspaceId: owner.id,
            id: action.agentMessageId,
          },
        });
        if (agentMessage) {
          const argumentsRequiringApproval =
            action.toolConfiguration.argumentsRequiringApproval ?? [];
          const argsAndValues = extractArgRequiringApprovalValues(
            argumentsRequiringApproval,
            action.augmentedInputs
          );

          await user.createToolApproval(auth, {
            mcpServerId: action.toolConfiguration.toolServerId,
            toolName: action.functionCallName,
            agentId: agentMessage.agentConfigurationId,
            argsAndValues,
          });
        }
        break;
      default:
        break;
    }
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

  // Sandbox children share the parent bash's `agent_step_contents` row, so
  // they bypass the standard `launchAgentLoopWorkflow` (which would re-pick
  // the parent bash and clobber it). On approval, the dedicated single-action
  // workflow handles parent relaunch via its continuation activity. On
  // rejection there's no workflow to chain, so we trigger relaunch inline
  // gated on remaining blocked siblings — same gate the workflow uses.
  if (isSandboxChildResumeState(action.stepContext.resumeState)) {
    const parentActionId = action.stepContext.resumeState.parentActionId;
    const sharedAgentLoopArgs = {
      agentMessageId,
      agentMessageVersion,
      conversationId,
      conversationTitle,
      conversationBranchId: branchId,
      userMessageId,
      userMessageVersion,
      userMessageOrigin,
    };

    if (approvalState !== "rejected") {
      await launchSandboxChildToolWorkflow({
        auth,
        agentLoopArgs: { ...sharedAgentLoopArgs, initialStartTime: Date.now() },
        actionModelId: action.id,
        step: agentStepContent.step,
      });
    } else {
      const [parent, remaining] = await Promise.all([
        AgentMCPActionResource.fetchById(auth, parentActionId),
        AgentMCPActionResource.listBlockedSandboxChildren(auth, {
          agentMessageId: action.agentMessageId,
          parentActionId,
        }),
      ]);
      if (
        parent?.status === "blocked_child_action_input_required" &&
        remaining.length === 0
      ) {
        await launchAgentLoopWorkflow({
          auth,
          agentLoopArgs: sharedAgentLoopArgs,
          startStep: parent.stepContent.step,
          waitForCompletion: true,
        });
      }
    }

    logger.info(
      {
        workspaceId: owner.id,
        conversationId,
        messageId,
        actionId,
        approvalState,
      },
      "Sandbox child action validated by user"
    );

    return new Ok(undefined);
  }

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

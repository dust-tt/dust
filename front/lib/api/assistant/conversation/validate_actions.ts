import type { ActionApprovalStateType } from "@app/lib/actions/mcp";
import {
  getMCPApprovalStateFromUserApprovalState,
  isMCPApproveExecutionEvent,
} from "@app/lib/actions/mcp";
import {
  extractArgRequiringApprovalValues,
  setUserAlwaysApprovedTool,
} from "@app/lib/actions/tool_status";
import { isSandboxChildActionInfo } from "@app/lib/actions/types";
import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import { getUserMessageIdFromMessageId } from "@app/lib/api/assistant/conversation/messages";
import { resumeAncestorConversations as resumeAncestorConversationsHelper } from "@app/lib/api/assistant/conversation/resume_ancestor_conversations";
import { getMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import { resolveSandboxChildBlock } from "@app/lib/api/sandbox/sandbox_child_block";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";

function getAuditLogDecision(
  approvalState: ActionApprovalStateType
): "approved" | "rejected" {
  switch (approvalState) {
    case "approved":
    case "always_approved":
      return "approved";
    case "rejected":
      return "rejected";
    default:
      return assertNever(approvalState);
  }
}

function extractDataSourceId(input: unknown): string | null {
  if (isString(input)) {
    return input.split("/").pop() ?? input;
  }

  if (!input || typeof input !== "object" || !("uri" in input)) {
    return null;
  }

  const { uri } = input;
  return isString(uri) ? uri.split("/").pop() ?? uri : null;
}

function extractAccessedDataSourceIds(
  inputs: Record<string, unknown>
): string {
  const dataSources = inputs.dataSources;
  if (!Array.isArray(dataSources)) {
    return "";
  }

  return dataSources.map(extractDataSourceId).filter(isString).join(",");
}

async function emitToolApprovalDecidedAuditEvent({
  action,
  approvalState,
  auth,
  conversationId,
  messageId,
}: {
  action: AgentMCPActionResource;
  approvalState: ActionApprovalStateType;
  auth: Authenticator;
  conversationId: string;
  messageId: string;
}): Promise<void> {
  try {
    const owner = auth.getNonNullableWorkspace();
    const user = auth.user();
    const agentMessage = await AgentMessageModel.findOne({
      where: {
        workspaceId: owner.id,
        id: action.agentMessageId,
      },
      attributes: ["agentConfigurationId", "agentConfigurationVersion"],
    });
    const agentConfiguration = agentMessage
      ? await AgentConfigurationModel.findOne({
          where: {
            workspaceId: owner.id,
            sId: agentMessage.agentConfigurationId,
            version: agentMessage.agentConfigurationVersion,
          },
          attributes: ["name"],
        })
      : null;

    void emitAuditLogEvent({
      auth,
      action: "tool.approval_decided",
      targets: [
        buildAuditLogTarget("workspace", owner),
        buildAuditLogTarget("agent", {
          sId: agentMessage?.agentConfigurationId ?? "unknown",
          name:
            agentConfiguration?.name ??
            agentMessage?.agentConfigurationId ??
            "unknown",
        }),
        buildAuditLogTarget("tool", {
          sId: action.toolConfiguration.name,
          name: action.toolConfiguration.originalName,
        }),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        tool_name: String(action.toolConfiguration.originalName),
        mcp_server_name: String(action.toolConfiguration.mcpServerName),
        conversation_id: String(conversationId),
        message_id: String(messageId),
        decision: getAuditLogDecision(approvalState),
        deciding_user_id: user?.sId ?? "unknown",
        deciding_user_email: user?.email ?? "unknown",
        accessed_data_source_ids: extractAccessedDataSourceIds(
          action.augmentedInputs
        ),
      },
    });
  } catch (error) {
    logger.error(
      {
        ...normalizeError(error),
        actionId: action.sId,
        conversationId,
        messageId,
      },
      "Failed to prepare tool approval decision audit event"
    );
  }
}

export async function validateAction(
  auth: Authenticator,
  conversation: ConversationResource,
  {
    actionId,
    approvalState,
    messageId,
    resumeAncestorConversations = false,
  }: {
    actionId: string;
    approvalState: ActionApprovalStateType;
    messageId: string;
    resumeAncestorConversations?: boolean;
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

  if (
    !canCurrentUserRespondToParentUserMessage({
      parentUserId: userMessageUserId,
      currentUserId: user?.id,
    })
  ) {
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

  void emitToolApprovalDecidedAuditEvent({
    action,
    approvalState,
    auth,
    conversationId,
    messageId,
  });

  // Remove the tool approval request event from the message channel.
  await getRedisHybridManager().removeEvent((event) => {
    const payload = JSON.parse(event.message["payload"]);
    return isMCPApproveExecutionEvent(payload)
      ? payload.actionId === actionId
      : false;
  }, getMessageChannelId(messageId));

  const { sandboxChildActionInfo } = action.stepContext;
  if (isSandboxChildActionInfo(sandboxChildActionInfo)) {
    // Sandbox-child actions always pause the parent bash on any block, so
    // the parent is sitting in `blocked_child_action_input_required` by
    // the time we get here. Relaunch the parent agent loop in resume mode;
    // checkForResume + getExistingActionsAndBlobs dispatches both the
    // parent (resume mode via stored execId) and the now-ready child.
    await resolveSandboxChildBlock(auth, {
      action,
      sandboxChildActionInfo,
      agentLoopArgs: {
        agentMessageId,
        agentMessageVersion,
        conversationBranchId: branchId,
        conversationId,
        conversationTitle,
        userMessageId,
        userMessageVersion,
        userMessageOrigin,
      },
    });
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
    startStep: action.stepContent.step,
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

  if (!resumeAncestorConversations) {
    return new Ok(undefined);
  }

  return resumeAncestorConversationsHelper(auth, conversation, {
    agentMessageId,
  });
}

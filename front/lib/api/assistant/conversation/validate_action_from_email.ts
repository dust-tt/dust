import type { ActionApprovalStateType } from "@app/lib/actions/mcp";
import {
  getMCPApprovalStateFromUserApprovalState,
  isMCPApproveExecutionEvent,
} from "@app/lib/actions/mcp";
import { getMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import {
  AgentMessageModel,
  ConversationModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { getIdsFromSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Fetches action context from an action sId for email validation.
 * Returns workspace, conversation, user, and message identifiers.
 *
 * Builds an internal admin auth from the workspace encoded in the action sId,
 * then uses resources where available. Uses Models for the message chain
 * because there is no MessageResource yet.
 */
export async function getActionContextForEmailValidation(
  actionId: string
): Promise<
  Result<
    {
      workspaceId: string;
      conversationId: string;
      userId: string;
      messageId: string;
    },
    DustError
  >
> {
  // The action sId encodes [regionBit, shardBit, workspaceModelId, resourceModelId].
  const idsResult = getIdsFromSId(actionId);
  if (idsResult.isErr()) {
    return new Err(new DustError("invalid_id", "Invalid action ID format"));
  }
  const { workspaceModelId } = idsResult.value;

  const [workspace] = await WorkspaceResource.fetchByModelIds([
    workspaceModelId,
  ]);
  if (!workspace) {
    return new Err(new DustError("internal_error", "Workspace not found"));
  }

  // Build internal admin auth to use resources for workspace-scoped queries.
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const action = await AgentMCPActionResource.fetchById(auth, actionId);
  if (!action) {
    return new Err(
      new DustError("action_not_found", "Action not found or incomplete")
    );
  }

  // Fetch the agent message and its conversation. Uses Models because
  // there is no MessageResource yet.
  const agentMessage = await AgentMessageModel.findOne({
    where: { workspaceId: workspace.id, id: action.agentMessageId },
    include: [
      {
        model: MessageModel,
        as: "message",
        required: true,
        include: [
          {
            model: ConversationModel,
            as: "conversation",
            required: true,
          },
        ],
      },
    ],
  });

  if (!agentMessage?.message?.conversation) {
    return new Err(
      new DustError(
        "action_not_found",
        "Agent message or conversation not found"
      )
    );
  }

  // Non-null assertions: the optional chain above guarantees these exist,
  // but TS can't narrow through nested optional properties.
  const message = agentMessage.message!;
  const conversation = message.conversation!;

  // Get the parent user message to find the user who triggered the agent.
  if (!message.parentId) {
    return new Err(
      new DustError("internal_error", "Agent message has no parent")
    );
  }

  const parentMessage = await MessageModel.findOne({
    where: { id: message.parentId, workspaceId: workspace.id },
    include: [
      {
        model: UserMessageModel,
        as: "userMessage",
        required: true,
      },
    ],
  });

  if (!parentMessage?.userMessage) {
    return new Err(
      new DustError("internal_error", "Parent user message not found")
    );
  }

  const userMessage = parentMessage.userMessage;

  // Defensive check: email triggers always go through auth with a real user,
  // so userId should never be null here. Guard for data integrity.
  if (!userMessage.userId) {
    return new Err(
      new DustError("internal_error", "User not found for email validation")
    );
  }

  const [user] = await UserResource.fetchByModelIds([userMessage.userId]);
  if (!user) {
    return new Err(new DustError("user_not_found", "User resource not found"));
  }

  return new Ok({
    workspaceId: workspace.sId,
    conversationId: conversation.sId,
    userId: user.sId,
    messageId: message.sId,
  });
}

/**
 * Validates an action from an email link click.
 * This bypasses the normal user authorization check since the authorization
 * is done via the signed token in the email link.
 */
export async function validateActionFromEmail(
  auth: Authenticator,
  {
    actionId,
    approvalState,
  }: {
    actionId: string;
    approvalState: Exclude<ActionApprovalStateType, "always_approved">;
  }
): Promise<Result<{ conversationId: string; workspaceId: string }, DustError>> {
  const owner = auth.getNonNullableWorkspace();
  const user = auth.user();

  const action = await AgentMCPActionResource.fetchById(auth, actionId);
  if (!action) {
    return new Err(
      new DustError("action_not_found", `Action not found: ${actionId}`)
    );
  }

  // Get message info. Uses Models because there is no MessageResource yet.
  const agentMessage = await AgentMessageModel.findOne({
    where: {
      workspaceId: owner.id,
      id: action.agentMessageId,
    },
    include: [
      {
        model: MessageModel,
        as: "message",
        required: true,
        include: [
          {
            model: ConversationModel,
            as: "conversation",
            required: true,
          },
        ],
      },
    ],
  });

  if (!agentMessage?.message?.conversation) {
    return new Err(
      new DustError("internal_error", "Agent message or conversation not found")
    );
  }

  const message = agentMessage.message;
  // Non-null assertion: the optional chain above guarantees this exists.
  const conversationModel = message.conversation!;
  const messageId = message.sId;

  logger.info(
    {
      actionId,
      messageId,
      approvalState,
      conversationId: conversationModel.sId,
      workspaceId: owner.sId,
      userId: user?.sId,
    },
    "[email] Tool validation request from email"
  );

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

  if (updatedCount === 0) {
    logger.info(
      {
        actionId,
        messageId,
        approvalState,
        workspaceId: owner.sId,
      },
      "[email] Action already approved or rejected"
    );

    return new Err(
      new DustError("action_not_blocked", "Action was already validated")
    );
  }

  // Remove the tool approval request event from the message channel.
  await getRedisHybridManager().removeEvent((event) => {
    try {
      const payload = JSON.parse(event.message["payload"]);
      return isMCPApproveExecutionEvent(payload)
        ? payload.actionId === actionId
        : false;
    } catch {
      return false;
    }
  }, getMessageChannelId(messageId));

  // Get conversation resource for checking remaining blocked actions.
  const conversationResource = await ConversationResource.fetchById(
    auth,
    conversationModel.sId
  );
  if (!conversationResource) {
    return new Err(
      new DustError("internal_error", "Conversation resource not found")
    );
  }

  // We only launch the agent loop if there are no remaining blocked actions.
  const blockedActions =
    await AgentMCPActionResource.listBlockedActionsForConversation(
      auth,
      conversationResource
    );

  // We only trigger an agent loop after all actions for the current message are validated.
  if (blockedActions.filter((a) => a.messageId === messageId).length > 0) {
    logger.info(
      {
        blockedActionsCount: blockedActions.length,
        messageId,
      },
      "[email] Skipping agent loop launch because there are remaining blocked actions"
    );
    return new Ok({
      conversationId: conversationModel.sId,
      workspaceId: owner.sId,
    });
  }

  // Get user message info for agent loop.
  if (!message.parentId) {
    return new Err(
      new DustError("internal_error", "Agent message has no parent")
    );
  }

  const parentMessage = await MessageModel.findOne({
    where: { id: message.parentId, workspaceId: owner.id },
  });

  if (!parentMessage) {
    return new Err(new DustError("internal_error", "Parent message not found"));
  }

  await launchAgentLoopWorkflow({
    auth,
    agentLoopArgs: {
      agentMessageId: message.sId,
      agentMessageVersion: message.version,
      conversationId: conversationModel.sId,
      conversationTitle: conversationModel.title,
      userMessageId: parentMessage.sId,
      userMessageVersion: parentMessage.version,
    },
    startStep: agentStepContent.step,
    waitForCompletion: true,
  });

  logger.info(
    {
      workspaceId: owner.sId,
      conversationId: conversationModel.sId,
      messageId,
      actionId,
    },
    `[email] Action ${approvalState === "approved" ? "approved" : "rejected"} via email`
  );

  return new Ok({
    conversationId: conversationModel.sId,
    workspaceId: owner.sId,
  });
}

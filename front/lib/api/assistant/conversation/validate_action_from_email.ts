import type { ActionApprovalStateType } from "@app/lib/actions/mcp";
import {
  getMCPApprovalStateFromUserApprovalState,
  isMCPApproveExecutionEvent,
} from "@app/lib/actions/mcp";
import { getMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentMCPActionModel } from "@app/lib/models/agent/actions/mcp";
import {
  AgentMessageModel,
  ConversationModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

/**
 * Fetches action context from an action sId for email validation.
 * Returns workspace sId, conversation sId, user sId, and message sId.
 */
export async function getActionContextForEmailValidation(
  actionId: string
): Promise<
  Result<
    {
      workspaceSId: string;
      conversationSId: string;
      userSId: string;
      messageSId: string;
    },
    DustError
  >
> {
  const actionModelId = getResourceIdFromSId(actionId);
  if (!actionModelId) {
    return new Err(new DustError("invalid_id", "Invalid action ID format"));
  }

  // Query action with all needed relations.
  const action = await AgentMCPActionModel.findOne({
    where: { id: actionModelId },
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: true,
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
      },
    ],
  });

  if (!action?.agentMessage?.message?.conversation) {
    return new Err(
      new DustError("action_not_found", "Action not found or incomplete")
    );
  }

  const agentMessage = action.agentMessage;
  const message = agentMessage.message!;
  const conversation = message.conversation!;

  // Get the parent user message to find the user who triggered the agent.
  if (!message.parentId) {
    return new Err(
      new DustError("internal_error", "Agent message has no parent")
    );
  }

  const parentMessage = await MessageModel.findOne({
    where: { id: message.parentId },
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

  // Get the user sId from the userMessage.
  // For email triggers, userId might be null if it was an unauthenticated trigger,
  // but we need a user to validate. We'll use the email from context.
  if (!userMessage.userId) {
    return new Err(
      new DustError("internal_error", "User not found for email validation")
    );
  }

  // We need to fetch the user sId from the userId (ModelId).
  const { UserResource } = await import("@app/lib/resources/user_resource");
  const [user] = await UserResource.fetchByModelIds([userMessage.userId]);
  if (!user) {
    return new Err(new DustError("user_not_found", "User resource not found"));
  }

  // Get workspace sId from conversation.
  const { WorkspaceResource } = await import(
    "@app/lib/resources/workspace_resource"
  );
  const workspace = await WorkspaceResource.fetchByModelId(
    conversation.workspaceId
  );
  if (!workspace) {
    return new Err(new DustError("internal_error", "Workspace not found"));
  }

  return new Ok({
    workspaceSId: workspace.sId,
    conversationSId: conversation.sId,
    userSId: user.sId,
    messageSId: message.sId,
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
): Promise<
  Result<{ conversationSId: string; workspaceSId: string }, DustError>
> {
  const owner = auth.getNonNullableWorkspace();
  const user = auth.user();

  const action = await AgentMCPActionResource.fetchById(auth, actionId);
  if (!action) {
    return new Err(
      new DustError("action_not_found", `Action not found: ${actionId}`)
    );
  }

  // Get message info.
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
  const conversationModel = message.conversation!;
  const messageSId = message.sId;

  logger.info(
    {
      actionId,
      messageSId,
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
        messageSId,
        approvalState,
        workspaceId: owner.sId,
      },
      "[email] Action already approved or rejected"
    );

    return new Ok({
      conversationSId: conversationModel.sId,
      workspaceSId: owner.sId,
    });
  }

  // Remove the tool approval request event from the message channel.
  await getRedisHybridManager().removeEvent((event) => {
    const payload = JSON.parse(event.message["payload"]);
    return isMCPApproveExecutionEvent(payload)
      ? payload.actionId === actionId
      : false;
  }, getMessageChannelId(messageSId));

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
  if (blockedActions.filter((a) => a.messageId === messageSId).length > 0) {
    logger.info(
      {
        blockedActionsCount: blockedActions.length,
        messageSId,
      },
      "[email] Skipping agent loop launch because there are remaining blocked actions"
    );
    return new Ok({
      conversationSId: conversationModel.sId,
      workspaceSId: owner.sId,
    });
  }

  // Get user message info for agent loop.
  if (!message.parentId) {
    return new Err(
      new DustError("internal_error", "Agent message has no parent")
    );
  }

  const parentMessage = await MessageModel.findOne({
    where: { id: message.parentId },
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
      messageSId,
      actionId,
    },
    `[email] Action ${approvalState === "approved" ? "approved" : "rejected"} via email`
  );

  return new Ok({
    conversationSId: conversationModel.sId,
    workspaceSId: owner.sId,
  });
}

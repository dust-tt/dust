import assert from "assert";
import { Op } from "sequelize";

import type { ActionApprovalStateType } from "@app/lib/actions/mcp";
import {
  getMCPApprovalStateFromUserApprovalState,
  isMCPApproveExecutionEvent,
} from "@app/lib/actions/mcp";
import { setUserAlwaysApprovedTool } from "@app/lib/actions/tool_status";
import { getRelatedContentFragments } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import {
  publishAgentMessagesEvents,
  publishMessageEventsOnMessagePostOrEdit,
} from "@app/lib/api/assistant/streaming/events";
import { getMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import { getUserForWorkspace } from "@app/lib/api/user";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import {
  MentionModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { triggerConversationAddedAsParticipantNotification } from "@app/lib/notifications/workflows/conversation-added-as-participant";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger, { auditLog } from "@app/logger/logger";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type {
  AgentMessageType,
  APIErrorWithStatusCode,
  Result,
  UserMessageType,
} from "@app/types";
import {
  assertNever,
  Err,
  isAgentMessageType,
  isContentFragmentType,
  isRichUserMention,
  isUserMessageType,
  Ok,
  toMentionType,
} from "@app/types";

async function getUserMessageIdFromMessageId(
  auth: Authenticator,
  { messageId }: { messageId: string }
): Promise<{
  agentMessageId: string;
  agentMessageVersion: number;
  userMessageId: string;
  userMessageVersion: number;
  userMessageUserId: number | null;
}> {
  // Query 1: Get the message and its parentId.
  const agentMessage = await MessageModel.findOne({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      sId: messageId,
      agentMessageId: { [Op.ne]: null },
    },
    attributes: ["parentId", "version", "sId"],
  });

  assert(
    agentMessage?.parentId,
    "Agent message is expected to have a parentId"
  );

  // Query 2: Get the parent message's sId (which is the user message).
  const parentMessage = await MessageModel.findOne({
    where: {
      id: agentMessage.parentId,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
    attributes: ["sId", "version"],
    include: [
      {
        model: UserMessageModel,
        as: "userMessage",
        required: true,
        attributes: ["userId"],
      },
    ],
  });

  assert(
    parentMessage &&
      parentMessage.userMessage &&
      parentMessage.userMessage.userId,
    "A user message with a linked user is expected for the agent message"
  );

  return {
    agentMessageId: agentMessage.sId,
    agentMessageVersion: agentMessage.version,
    userMessageId: parentMessage.sId,
    userMessageVersion: parentMessage.version,
    userMessageUserId: parentMessage.userMessage.userId,
  };
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
    await setUserAlwaysApprovedTool({
      user,
      mcpServerId: action.toolConfiguration.toolServerId,
      functionCallName: action.functionCallName,
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
      userMessageId,
      userMessageVersion,
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

export async function validateUserMention(
  auth: Authenticator,
  {
    conversationId,
    userId,
    messageId,
    approvalState,
  }: {
    conversationId: string;
    userId: string;
    messageId: string;
    approvalState: "approved" | "rejected";
  }
): Promise<Result<void, APIErrorWithStatusCode>> {
  const conversationRes = await getConversation(auth, conversationId);
  if (conversationRes.isErr()) {
    return new Err({
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found",
      },
    });
  }

  const conversation = conversationRes.value;

  // Verify the message exists
  const message = conversation.content.flat().find((m) => m.sId === messageId);

  if (!message) {
    return new Err({
      status_code: 404,
      api_error: {
        type: "message_not_found",
        message: "Message not found",
      },
    });
  }
  if (approvalState === "approved") {
    auditLog(
      {
        author: auth.getNonNullableUser().toJSON(),
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        messageId: message.sId,
        userId,
        approvalState,
      },
      "User approved a mention"
    );
  }

  if (isUserMessageType(message)) {
    // Verify user is authorized to edit the message by checking the message user.
    if (message.user && message.user.id !== auth.getNonNullableUser().id) {
      return new Err({
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "User is not authorized to edit this mention",
        },
      });
    }
  } else if (isAgentMessageType(message)) {
    // Verify user is authorized to edit the message by going back to the user message.
    const { userMessageUserId } = await getUserMessageIdFromMessageId(auth, {
      messageId,
    });
    if (
      userMessageUserId !== null &&
      userMessageUserId !== auth.getNonNullableUser().id
    ) {
      return new Err({
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "User is not authorized to edit this mention",
        },
      });
    }
  } else if (isContentFragmentType(message)) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid message type",
      },
    });
  } else {
    assertNever(message);
  }
  const user = await getUserForWorkspace(auth, {
    userId,
  });
  if (!user) {
    return new Err({
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "User not found",
      },
    });
  }

  const updatedMessages: {
    userMessages: UserMessageType[];
    agentMessages: AgentMessageType[];
  } = {
    userMessages: [],
    agentMessages: [],
  };
  // Find all pending mentions for the same user on conversation messages latest versions.
  for (const messageVersions of conversation.content) {
    const latestMessage = messageVersions[messageVersions.length - 1];

    if (
      latestMessage.visibility !== "deleted" &&
      !isContentFragmentType(latestMessage) &&
      latestMessage.richMentions.some(
        (m) => m.status === "pending" && m.id === userId
      )
    ) {
      const mentionModel = await MentionModel.findOne({
        where: {
          workspaceId: conversation.owner.id,
          messageId: latestMessage.id,
          userId: user.id,
        },
      });
      if (!mentionModel) {
        continue;
      }
      await mentionModel.update({ status: approvalState });
      const newRichMentions = latestMessage.richMentions.map((m) =>
        isRichUserMention(m) && m.id === userId
          ? {
              ...m,
              status: approvalState,
            }
          : m
      );
      if (isUserMessageType(latestMessage)) {
        updatedMessages.userMessages.push({
          ...latestMessage,
          richMentions: newRichMentions,
          mentions: newRichMentions.map(toMentionType),
        });
      } else if (isAgentMessageType(latestMessage)) {
        updatedMessages.agentMessages.push({
          ...latestMessage,
          richMentions: newRichMentions,
        });
      }
    }
  }

  for (const userMessage of updatedMessages.userMessages) {
    await publishMessageEventsOnMessagePostOrEdit(
      conversation,
      {
        ...userMessage,
        contentFragments: getRelatedContentFragments(conversation, userMessage),
      },
      []
    );
  }

  if (updatedMessages.agentMessages.length > 0) {
    await publishAgentMessagesEvents(
      conversation,
      updatedMessages.agentMessages
    );
  }

  const isParticipant = await ConversationResource.isConversationParticipant(
    auth,
    {
      conversation,
      user: user.toJSON(),
    }
  );

  if (!isParticipant && approvalState === "approved") {
    const status = await ConversationResource.upsertParticipation(auth, {
      conversation,
      action: "subscribed",
      user: user.toJSON(),
    });

    if (status === "added") {
      await triggerConversationAddedAsParticipantNotification(auth, {
        conversation,
        addedUserId: user.sId,
      });
    }
  }

  return new Ok(undefined);
}

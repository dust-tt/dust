import type {
  ConversationType,
  ConversationWithoutContentType,
  Result,
} from "@dust-tt/types";
import type { UserType } from "@dust-tt/types";
import { ConversationError, Err, Ok } from "@dust-tt/types";
import { Op } from "sequelize";

import { canAccessConversation } from "@app/lib/api/assistant/conversation";
import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import {
  AgentMessage,
  AgentMessageFeedback,
} from "@app/lib/models/assistant/conversation";
import { Message } from "@app/lib/models/assistant/conversation";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";

/**
 * We retrieve the feedbacks for a whole conversation, not just a single message.
 */

export type ConversationMessageFeedbacks = {
  messageId: string;
  agentMessageId: string;
  feedback: AgentMessageFeedback[];
}[];

export async function getConversationUserFeedbacks(
  auth: Authenticator,
  conversation: ConversationType | ConversationWithoutContentType
): Promise<Result<ConversationMessageFeedbacks, ConversationError>> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }
  const user = auth.user();
  if (!canAccessConversation(auth, conversation) || !user) {
    return new Err(new ConversationError("conversation_access_restricted"));
  }

  const messages = await Message.findAll({
    where: {
      conversationId: conversation.id,
      agentMessageId: {
        [Op.ne]: null,
      },
    },
    attributes: ["sId"],
  });

  const agentMessages = await AgentMessage.findAll({
    where: {
      id: {
        [Op.in]: messages
          .map((m) => m.agentMessageId)
          .filter((id): id is number => id !== null),
      },
    },
  });

  const feedbacks = await AgentMessageFeedback.findAll({
    where: {
      userId: user.id,
      agentMessageId: {
        [Op.in]: agentMessages.map((m) => m.id),
      },
    },
  });

  const feedbacksByMessageId = feedbacks.reduce<
    Record<number, AgentMessageFeedback[]>
  >((acc, feedback) => {
    if (!acc[feedback.agentMessageId]) {
      acc[feedback.agentMessageId] = [];
    }
    acc[feedback.agentMessageId].push(feedback);
    return acc;
  }, {});

  return new Ok(
    messages
      .filter((m) => m.agentMessageId !== null)
      .map((m) => ({
        messageId: m.sId,
        agentMessageId: m.agentMessageId!.toString(),
        feedback: feedbacksByMessageId[m.agentMessageId!] ?? [],
      }))
  );
}

/**
 * We create a feedback for a single message.
 * As user can be null (user from Slack), we also store the user context, as we do for messages.
 */
export async function createOrUpdateMessageFeedback(
  auth: Authenticator,
  {
    messageId,
    conversation,
    user,
    thumbDirection,
    content,
  }: {
    messageId: string;
    conversation: ConversationType | ConversationWithoutContentType;
    user: UserType;
    thumbDirection: AgentMessageFeedbackDirection;
    content?: string;
  }
): Promise<boolean | null> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const message = await Message.findOne({
    where: {
      sId: messageId,
      conversationId: conversation.id,
    },
  });

  if (!message || !message.agentMessageId) {
    return null;
  }

  const agentMessage = await AgentMessage.findOne({
    where: {
      id: message.agentMessageId,
    },
  });

  if (!agentMessage) {
    return null;
  }

  const agentConfigurationId = agentMessage.agentConfigurationId;

  const agentConfiguration = await AgentConfiguration.findOne({
    where: {
      sId: agentConfigurationId,
    },
  });

  if (!agentConfiguration) {
    return null;
  }

  const feedback =
    await AgentMessageFeedbackResource.fetchByUserAndAgentMessage({
      user,
      agentMessage,
    });

  if (feedback) {
    const updatedFeedback = await feedback.updateContentAndThumbDirection(
      content ?? "",
      thumbDirection
    );

    return updatedFeedback.isOk();
  } else {
    const newFeedback = await AgentMessageFeedbackResource.makeNew({
      workspaceId: owner.id,
      agentConfigurationId: agentConfiguration.id,
      agentMessageId: agentMessage.id,
      userId: user.id,
      thumbDirection,
      content,
    });
    return newFeedback !== null;
  }
}

/**
 * The id of a reaction is not exposed on the API so we need to find it from the message id and the user context.
 * We destroy reactions, no point in soft-deleting them.
 */
export async function deleteMessageFeedback(
  auth: Authenticator,
  {
    messageId,
    conversation,
    user,
  }: {
    messageId: string;
    conversation: ConversationType | ConversationWithoutContentType;
    user: UserType;
  }
): Promise<boolean | null> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const message = await Message.findOne({
    where: {
      sId: messageId,
      conversationId: conversation.id,
    },
  });

  if (!message || !message.agentMessage) {
    return null;
  }

  const feedback =
    await AgentMessageFeedbackResource.fetchByUserAndAgentMessage({
      user,
      agentMessage: message.agentMessage,
    });

  if (!feedback) {
    return null;
  }

  const deletedFeedback = await feedback.delete(auth);

  return deletedFeedback.isOk();
}

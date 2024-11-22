import type {
  ConversationMessageReactions,
  ConversationType,
  ConversationWithoutContentType,
  MessageReactionType,
  Result,
} from "@dust-tt/types";
import type { UserType } from "@dust-tt/types";
import { ConversationError, Err, Ok } from "@dust-tt/types";

import { canAccessConversation } from "@app/lib/api/assistant/conversation";
import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import {
  Message,
  MessageReaction,
} from "@app/lib/models/assistant/conversation";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";

/**
 * We retrieve the reactions for a whole conversation, not just a single message.
 */
export async function getUserMessageFeedback(
  auth: Authenticator,
  conversation: ConversationType | ConversationWithoutContentType
): Promise<Result<ConversationMessageReactions, ConversationError>> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  if (!canAccessConversation(auth, conversation)) {
    return new Err(new ConversationError("conversation_access_restricted"));
  }

  const messages = await Message.findAll({
    where: {
      conversationId: conversation.id,
    },
    attributes: ["sId"],
    include: [
      {
        model: MessageReaction,
        as: "reactions",
        required: false,
      },
    ],
  });

  return new Ok(
    messages.map((m) => ({
      messageId: m.sId,
      reactions: _renderMessageReactions(m.reactions || []),
    }))
  );
}

function _renderMessageReactions(
  reactions: MessageReaction[]
): MessageReactionType[] {
  return reactions.reduce<MessageReactionType[]>(
    (acc: MessageReactionType[], r: MessageReaction) => {
      const reaction = acc.find((r2) => r2.emoji === r.reaction);
      if (reaction) {
        reaction.users.push({
          userId: r.userId,
          username: r.userContextUsername,
          fullName: r.userContextFullName,
        });
      } else {
        acc.push({
          emoji: r.reaction,
          users: [
            {
              userId: r.userId,
              username: r.userContextUsername,
              fullName: r.userContextFullName,
            },
          ],
        });
      }
      return acc;
    },
    []
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

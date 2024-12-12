import type {
  ConversationType,
  ConversationWithoutContentType,
  Result,
} from "@dust-tt/types";
import type { UserType } from "@dust-tt/types";
import { ConversationError, Err, GLOBAL_AGENTS_SID, Ok } from "@dust-tt/types";
import { Op } from "sequelize";

import { canAccessConversation } from "@app/lib/api/assistant/conversation";
import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { Message } from "@app/lib/models/assistant/conversation";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";

/**
 * We retrieve the feedbacks for a whole conversation, not just a single message.
 */

export type AgentMessageFeedbackType = {
  id: number;
  messageId: string;
  agentMessageId: number;
  userId: number;
  thumbDirection: AgentMessageFeedbackDirection;
  content: string | null;
  agentConfigurationVersion: number;
  agentConfigurationId: string;
  createdAt: Date;
};

export type AgentMessageFeedbackWithMetadataType = AgentMessageFeedbackType & {
  conversationId: string;
  userName: string;
  userImageUrl?: string;
};

export async function getAgentConfigurationFeedbacks({
  auth,
  agentConfigurationId,
  withMetadata,
}: {
  auth: Authenticator;
  agentConfigurationId: string;
  withMetadata?: boolean;
}): Promise<
  Result<
    (AgentMessageFeedbackType | AgentMessageFeedbackWithMetadataType)[],
    ConversationError
  >
> {
  const owner = auth.workspace();
  if (!owner || !auth.isUser()) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }
  const plan = auth.plan();
  if (!plan) {
    throw new Error("Unexpected `auth` without `plan`.");
  }
  const feedbacksRes =
    await AgentMessageFeedbackResource.fetchByAgentConfigurationId(
      auth,
      agentConfigurationId
    );

  const feedbacks = feedbacksRes.map(
    (feedback) =>
      ({
        id: feedback.id,
        userId: feedback.userId,
        thumbDirection: feedback.thumbDirection,
        content: feedback.content,
        agentConfigurationVersion: feedback.agentConfigurationVersion,
        agentConfigurationId: feedback.agentConfigurationId,
        createdAt: feedback.createdAt,
        userName: withMetadata ? feedback.user.name : undefined,
        userImageUrl: withMetadata ? feedback.user.imageUrl : undefined,
        messageId: feedback.agentMessage.message?.sId,
        // Only return conversationId if the user has access to the conversation
        conversationId:
          withMetadata &&
          feedback.agentMessage.message?.conversation &&
          canAccessConversation(
            auth,
            feedback.agentMessage.message.conversation
          )
            ? feedback.agentMessage.message.conversation.sId
            : undefined,
      }) as AgentMessageFeedbackType | AgentMessageFeedbackWithMetadataType
  );
  return new Ok(feedbacks);
}

export async function getConversationFeedbacksForUser(
  auth: Authenticator,
  conversation: ConversationType | ConversationWithoutContentType
): Promise<Result<AgentMessageFeedbackType[], ConversationError>> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }
  const user = auth.user();
  if (!canAccessConversation(auth, conversation) || !user) {
    return new Err(new ConversationError("conversation_access_restricted"));
  }

  const feedbackForMessages = await Message.findAll({
    where: {
      conversationId: conversation.id,
      agentMessageId: {
        [Op.ne]: null,
      },
    },
    attributes: ["id", "sId", "agentMessageId"],
    include: [
      {
        model: AgentMessage,
        as: "agentMessage",
        include: [
          {
            model: AgentMessageFeedbackResource.model,
            as: "feedbacks",
            where: {
              userId: user.id,
            },
          },
        ],
      },
    ],
  });

  const feedbacksWithMessageId = feedbackForMessages
    // typeguard needed because of TypeScript limitations
    .filter(
      (
        message
      ): message is Message & {
        agentMessage: { feedbacks: AgentMessageFeedbackResource[] };
      } =>
        !!message.agentMessage &&
        !!message.agentMessage.feedbacks &&
        message.agentMessage.feedbacks.length > 0
    )
    .map((message) => {
      // Only one feedback can be associated with a message
      const feedback = message.agentMessage.feedbacks[0];
      return {
        id: feedback.id,
        messageId: message.sId,
        agentMessageId: feedback.agentMessageId,
        userId: feedback.userId,
        thumbDirection: feedback.thumbDirection,
        content: feedback.content,
      } as AgentMessageFeedbackType;
    });

  return new Ok(feedbacksWithMessageId);
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

  let isGlobalAgent = false;
  let agentConfigurationId = agentMessage.agentConfigurationId;
  if (
    Object.values(GLOBAL_AGENTS_SID).includes(
      agentMessage.agentConfigurationId as GLOBAL_AGENTS_SID
    )
  ) {
    isGlobalAgent = true;
  }

  if (!isGlobalAgent) {
    const agentConfiguration = await AgentConfiguration.findOne({
      where: {
        sId: agentMessage.agentConfigurationId,
      },
    });

    if (!agentConfiguration) {
      return null;
    }
    agentConfigurationId = agentConfiguration.sId;
  }

  const feedback =
    await AgentMessageFeedbackResource.fetchByUserAndAgentMessage({
      auth,
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
      agentConfigurationId: agentConfigurationId,
      agentConfigurationVersion: agentMessage.agentConfigurationVersion,
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
    attributes: ["agentMessageId"],
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

  const feedback =
    await AgentMessageFeedbackResource.fetchByUserAndAgentMessage({
      auth,
      user,
      agentMessage,
    });

  if (!feedback) {
    return null;
  }

  const deletedFeedback = await feedback.delete(auth);

  return deletedFeedback.isOk();
}

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";
import type { PaginationParams } from "@app/lib/api/pagination";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { launchStoreAgentAnalyticsWorkflow } from "@app/temporal/analytics_queue/client";
import type {
  ConversationType,
  ConversationWithoutContentType,
  Result,
  UserType,
} from "@app/types";
import { ConversationError, Err, normalizeError, Ok } from "@app/types";

/**
 * We retrieve the feedbacks for a whole conversation, not just a single message.
 */

export type AgentMessageFeedbackType = {
  id: number;
  sId: string;
  messageId: string;
  agentMessageId: number;
  userId: number;
  thumbDirection: AgentMessageFeedbackDirection;
  content: string | null;
  createdAt: Date;
  agentConfigurationId: string;
  agentConfigurationVersion: number;
  isConversationShared: boolean;
  dismissed: boolean;
};

export type FeedbackUserInfo = {
  userName: string;
  userEmail: string;
  userImageUrl: string | null;
};

export type FeedbackConversationInfo = {
  conversationId: string | null;
};

export type AgentMessageFeedbackWithMetadataType = AgentMessageFeedbackType &
  FeedbackConversationInfo &
  FeedbackUserInfo;

export async function getConversationFeedbacksForUser(
  auth: Authenticator,
  conversation: ConversationType | ConversationWithoutContentType
) {
  if (!ConversationResource.canAccessConversation(auth, conversation)) {
    return new Err(new ConversationError("conversation_access_restricted"));
  }

  const feedbacksRes =
    await AgentMessageFeedbackResource.getConversationFeedbacksForUser(
      auth,
      conversation
    );

  const feedbacks = feedbacksRes.map((feedback) => {
    return feedback.toJSON() as AgentMessageFeedbackType;
  });

  return new Ok(feedbacks);
}

/**
 * We create a feedback for a single message.
 * As user can be null (user from Slack), we also store the user context, as we do for messages.
 */
export async function upsertMessageFeedback(
  auth: Authenticator,
  {
    messageId,
    conversation,
    user,
    thumbDirection,
    content,
    isConversationShared,
  }: {
    messageId: string;
    conversation: ConversationType | ConversationWithoutContentType;
    user: UserType;
    thumbDirection: AgentMessageFeedbackDirection;
    content?: string;
    isConversationShared?: boolean;
  }
): Promise<Result<AgentMessageFeedbackType, Error>> {
  const feedbackWithConversationContext =
    await AgentMessageFeedbackResource.getFeedbackWithConversationContext({
      auth,
      messageId,
      conversation,
      user,
    });

  if (feedbackWithConversationContext.isErr()) {
    return feedbackWithConversationContext;
  }

  const { agentMessage, feedback, agentConfiguration, isGlobalAgent, message } =
    feedbackWithConversationContext.value;

  if (feedback) {
    await feedback.updateFields({
      content,
      thumbDirection,
      isConversationShared,
    });

    const updatedFeedback = toAgentMessageFeedback({
      feedbackResource: feedback,
      messageSId: message.sId,
      userId: user.id,
    });

    return new Ok(updatedFeedback);
  }

  try {
    const newFeedback = await AgentMessageFeedbackResource.makeNew({
      workspaceId: auth.getNonNullableWorkspace().id,
      // If the agent is global, we use the agent configuration id from the agent message
      // Otherwise, we use the agent configuration id from the agent configuration
      agentConfigurationId: isGlobalAgent
        ? agentMessage.agentConfigurationId
        : agentConfiguration.sId,
      agentConfigurationVersion: agentMessage.agentConfigurationVersion,
      agentMessageId: agentMessage.id,
      userId: user.id,
      thumbDirection,
      content,
      isConversationShared: isConversationShared ?? false,
      dismissed: false,
    });

    const createdFeedback = toAgentMessageFeedback({
      feedbackResource: newFeedback,
      messageSId: message.sId,
      userId: user.id,
    });

    return new Ok(createdFeedback);
  } catch (e) {
    return new Err(normalizeError(e));
  }
}

/**
 * The id of a feedback is not exposed on the API so we need to find it from the message id and the user context.
 * We destroy feedbacks, no point in soft-deleting them.
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
) {
  if (!ConversationResource.canAccessConversation(auth, conversation)) {
    return new Err({
      type: "conversation_access_restricted",
      message: "You don't have access to this conversation.",
    });
  }

  const feedbackWithContext =
    await AgentMessageFeedbackResource.getFeedbackWithConversationContext({
      auth,
      messageId,
      conversation,
      user,
    });

  if (feedbackWithContext.isErr()) {
    return feedbackWithContext;
  }

  const { feedback } = feedbackWithContext.value;

  if (!feedback) {
    return new Ok(undefined);
  }

  const deleteRes = await feedback.delete(auth, {});

  if (deleteRes.isErr()) {
    return deleteRes;
  }

  return new Ok(undefined);
}

function toAgentMessageFeedback({
  feedbackResource,
  messageSId,
  userId,
}: {
  feedbackResource: AgentMessageFeedbackResource;
  messageSId: string;
  userId: number;
}): AgentMessageFeedbackType {
  return {
    id: feedbackResource.id,
    messageId: messageSId,
    agentMessageId: feedbackResource.agentMessageId,
    userId,
    thumbDirection: feedbackResource.thumbDirection,
    content: feedbackResource.content,
    createdAt: feedbackResource.createdAt,
    agentConfigurationId: feedbackResource.agentConfigurationId,
    agentConfigurationVersion: feedbackResource.agentConfigurationVersion,
    isConversationShared: feedbackResource.isConversationShared,
  };
}

export async function getAgentFeedbacks({
  auth,
  agentConfigurationId,
  withMetadata,
  paginationParams,
  filter = "active",
}: {
  auth: Authenticator;
  withMetadata: boolean;
  agentConfigurationId: string;
  paginationParams: PaginationParams;
  filter?: "active" | "all";
}): Promise<
  Result<
    (AgentMessageFeedbackType | AgentMessageFeedbackWithMetadataType)[],
    Error
  >
> {
  const owner = auth.getNonNullableWorkspace();

  // Make sure the user has access to the agent
  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: agentConfigurationId,
    variant: "light",
  });
  if (!agentConfiguration) {
    return new Err(new Error("agent_configuration_not_found"));
  }

  const feedbacksRes =
    await AgentMessageFeedbackResource.getAgentConfigurationFeedbacksByDescVersion(
      {
        workspace: owner,
        agentConfiguration,
        paginationParams,
        filter,
      }
    );

  const feedbacks = feedbacksRes.map((feedback) => feedback.toJSON());

  if (!withMetadata) {
    return new Ok(feedbacks as AgentMessageFeedbackType[]);
  }

  const feedbacksWithHiddenConversationId = feedbacks.map((feedback) => ({
    ...feedback,
    // Redact the conversationId if user did not share the conversation.
    conversationId: feedback.isConversationShared
      ? feedback.conversationId
      : null,
  }));
  return new Ok(
    feedbacksWithHiddenConversationId as AgentMessageFeedbackWithMetadataType[]
  );
}

export async function triggerAgentMessageFeedbackWorkflow(
  auth: Authenticator,
  {
    feedback,
    messageId,
    conversationId,
  }: {
    feedback: AgentMessageFeedbackType;
    messageId: string;
    conversationId: string;
  }
): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(workspace);

  if (!featureFlags.includes("agent_builder_observability")) {
    return;
  }

  const launchResult = await launchStoreAgentAnalyticsWorkflow({
    authType: auth.toJSON(),
    agentMessageAnalyticsArgs: {
      type: "agent_message_feedback",
      feedback,
      message: {
        agentMessageId: messageId,
        conversationId,
      },
    },
  });

  if (launchResult.isErr()) {
    logger.warn(
      {
        feedbackId: feedback.id,
        messageId: feedback.messageId,
        workspaceId: workspace.sId,
        error: launchResult.error,
      },
      "Failed to launch store agent message feedback workflow"
    );
  }
}

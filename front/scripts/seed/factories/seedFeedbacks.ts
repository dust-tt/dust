import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";

import type { FeedbackAsset, SeedContext } from "./types";

export async function seedFeedbacks(
  ctx: SeedContext,
  feedbackAssets: FeedbackAsset[]
): Promise<void> {
  const { auth, workspace, user, execute, logger } = ctx;

  for (const feedbackAsset of feedbackAssets) {
    logger.info(
      {
        conversationSId: feedbackAsset.conversationSId,
        agentMessageSId: feedbackAsset.agentMessageSId,
      },
      "Creating feedback"
    );

    if (execute) {
      // Find the conversation (skip permission filtering for seed script)
      const conversation = await ConversationResource.fetchById(
        auth,
        feedbackAsset.conversationSId,
        { dangerouslySkipPermissionFiltering: true, includeDeleted: true }
      );

      if (!conversation) {
        logger.warn(
          { conversationSId: feedbackAsset.conversationSId },
          "Conversation not found for feedback, skipping"
        );
        continue;
      }

      // Find the message row
      const messageResult = await conversation.getMessageById(
        auth,
        feedbackAsset.agentMessageSId
      );

      if (messageResult.isErr()) {
        logger.warn(
          { agentMessageSId: feedbackAsset.agentMessageSId },
          "Agent message not found for feedback, skipping"
        );
        continue;
      }

      const messageRow = messageResult.value;
      if (!messageRow.agentMessageId || !messageRow.agentMessage) {
        logger.warn(
          { agentMessageSId: feedbackAsset.agentMessageSId },
          "Agent message not found for feedback, skipping"
        );
        continue;
      }

      const agentMessage = messageRow.agentMessage;

      // Check if feedback already exists
      const existingFeedback = await AgentMessageFeedbackResource.model.findOne(
        {
          where: {
            agentMessageId: agentMessage.id,
            userId: user.id,
            workspaceId: workspace.id,
          },
        }
      );

      if (existingFeedback) {
        logger.info(
          { agentMessageSId: feedbackAsset.agentMessageSId },
          "Feedback already exists, skipping"
        );
        continue;
      }

      // Create the feedback
      await AgentMessageFeedbackResource.makeNew({
        agentConfigurationId: agentMessage.agentConfigurationId,
        agentConfigurationVersion: agentMessage.agentConfigurationVersion,
        agentMessageId: agentMessage.id,
        userId: user.id,
        workspaceId: workspace.id,
        isConversationShared: false,
        dismissed: false,
        thumbDirection: feedbackAsset.thumbDirection,
        content: feedbackAsset.content,
      });

      logger.info(
        {
          agentMessageSId: feedbackAsset.agentMessageSId,
          thumbDirection: feedbackAsset.thumbDirection,
        },
        "Feedback created"
      );
    }
  }
}

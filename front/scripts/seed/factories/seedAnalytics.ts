import { ANALYTICS_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";
import {
  AgentMessageFeedbackModel,
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type {
  AgentMessageAnalyticsData,
  AgentMessageAnalyticsFeedback,
} from "@app/types/assistant/analytics";
import { Op } from "sequelize";

import type { SeedContext } from "./types";

/**
 * Indexes analytics documents to Elasticsearch for seeded conversations.
 * This enables feedbacks to appear in agent insights.
 */
export async function seedAnalytics(
  ctx: SeedContext,
  conversationSIds: string[]
): Promise<void> {
  const { auth, workspace, execute, logger } = ctx;

  if (!execute) {
    logger.info("Dry run: skipping analytics indexing");
    return;
  }

  if (conversationSIds.length === 0) {
    logger.info("No conversations to index analytics for");
    return;
  }

  // Find all conversations by sId (skip permission filtering for seed script).
  const conversations = await ConversationResource.fetchByIds(
    auth,
    conversationSIds,
    { dangerouslySkipPermissionFiltering: true, includeDeleted: true }
  );

  if (conversations.length === 0) {
    logger.warn("No conversations found for the provided sIds");
    return;
  }

  // Create a map from conversation id to sId for lookup.
  const conversationIdToSId = new Map(conversations.map((c) => [c.id, c.sId]));

  // Find all agent messages for these conversations.
  const messages = await MessageModel.findAll({
    where: {
      conversationId: conversations.map((c) => c.id),
      workspaceId: workspace.id,
      agentMessageId: { [Op.ne]: null },
    },
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: true,
        include: [
          {
            model: AgentMessageFeedbackModel,
            as: "feedbacks",
            include: [{ model: UserModel, as: "user" }],
          },
        ],
      },
    ],
  });

  logger.info(
    { messageCount: messages.length },
    "Found agent messages to index"
  );

  for (const message of messages) {
    const { agentMessage } = message;
    const conversationSId = conversationIdToSId.get(message.conversationId);
    if (!agentMessage || !conversationSId) {
      continue;
    }

    // Get the user from parent message.
    let userId = "unknown";
    if (message.parentId) {
      const parentMessage = await MessageModel.findOne({
        where: { id: message.parentId, workspaceId: workspace.id },
        include: [
          {
            model: UserMessageModel,
            as: "userMessage",
            include: [{ model: UserModel, as: "user" }],
          },
        ],
      });
      if (parentMessage?.userMessage?.user) {
        userId = parentMessage.userMessage.user.sId;
      }
    }

    // Build feedbacks array.
    const feedbacks: AgentMessageAnalyticsFeedback[] = (
      agentMessage.feedbacks ?? []
    ).map((f) => ({
      feedback_id: f.id,
      user_id: f.user?.sId ?? "unknown",
      thumb_direction: f.thumbDirection,
      content: f.content ?? undefined,
      dismissed: f.dismissed,
      is_conversation_shared: f.isConversationShared,
      created_at: f.createdAt.toISOString(),
    }));

    // Build analytics document with zero values for tokens/tools (seeded data has none).
    const document: AgentMessageAnalyticsData = {
      agent_id: agentMessage.agentConfigurationId,
      agent_version: agentMessage.agentConfigurationVersion.toString(),
      conversation_id: conversationSId,
      context_origin: "web",
      latency_ms: agentMessage.modelInteractionDurationMs ?? 0,
      message_id: message.sId,
      status: agentMessage.status,
      timestamp: new Date(message.createdAt).toISOString(),
      tokens: {
        prompt: 0,
        completion: 0,
        reasoning: 0,
        cached: 0,
        cost_micro_usd: 0,
      },
      tools_used: [],
      user_id: userId,
      workspace_id: workspace.sId,
      feedbacks,
      version: message.version.toString(),
    };

    // Index to ES using the same document ID format as production.
    const documentId = `${workspace.sId}_${message.sId}_${message.version}`;

    const result = await withEs(async (client) => {
      await client.index({
        index: ANALYTICS_ALIAS_NAME,
        id: documentId,
        body: document,
      });
    });

    if (result.isErr()) {
      logger.error(
        { error: result.error, messageId: message.sId },
        "Failed to index analytics document"
      );
    } else {
      logger.info(
        { messageId: message.sId, feedbackCount: feedbacks.length },
        "Indexed analytics document"
      );
    }
  }
}

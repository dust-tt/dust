import { destroyConversationMessages } from "@app/lib/api/assistant/conversation/destroy";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { UserResource } from "@app/lib/resources/user_resource";

import type { ConversationAsset, CreatedAgent, SeedContext } from "./types";

function replacePlaceholders(
  content: string,
  placeholders: Record<string, string>
): string {
  let result = content;
  for (const [placeholder, value] of Object.entries(placeholders)) {
    result = result.replace(new RegExp(placeholder, "g"), value);
  }
  return result;
}

// Seeded conversations only hold user/agent messages with text step contents, so a DB-only
// delete is enough (no content fragments, actions or conversation data source to clean up).
async function deleteConversation(
  ctx: SeedContext,
  conversation: ConversationResource
): Promise<void> {
  const { auth, workspace } = ctx;
  const messages = await MessageModel.findAll({
    attributes: [
      "id",
      "userMessageId",
      "agentMessageId",
      "contentFragmentId",
      "compactionMessageId",
    ],
    where: { conversationId: conversation.id, workspaceId: workspace.id },
  });
  await destroyConversationMessages(auth, messages);
  const deleteResult = await conversation.delete(auth);
  if (deleteResult.isErr()) {
    throw new Error(
      `Failed to delete conversation ${conversation.sId}: ${deleteResult.error.message}`
    );
  }
}

interface SeedConversationsOptions {
  agents?: Map<string, CreatedAgent>;
  defaultAgentId?: string;
  placeholders?: Record<string, string>;
  additionalUsers?: Map<string, UserResource>;
}

export async function seedConversations(
  ctx: SeedContext,
  conversationAssets: ConversationAsset[],
  options: SeedConversationsOptions = {}
): Promise<void> {
  const { auth, workspace, user, execute, logger } = ctx;
  const {
    agents = new Map(),
    defaultAgentId,
    placeholders = {},
    additionalUsers = new Map(),
  } = options;

  for (const conv of conversationAssets) {
    // Determine the agent to use
    let agentId: string | undefined;
    if (conv.agentName) {
      const agent = agents.get(conv.agentName);
      if (agent) {
        agentId = agent.sId;
      } else {
        logger.warn(
          { agentName: conv.agentName },
          "Agent not found for conversation, skipping"
        );
        continue;
      }
    } else {
      agentId = defaultAgentId;
    }

    if (!agentId) {
      logger.warn(
        { title: conv.title },
        "No agent specified for conversation, skipping"
      );
      continue;
    }

    // Determine which user to use for this conversation
    let conversationUser = user;
    if (conv.userId) {
      const specifiedUser = additionalUsers.get(conv.userId);
      if (specifiedUser) {
        conversationUser = specifiedUser;
      } else {
        logger.warn(
          { userId: conv.userId },
          "Specified user not found in additionalUsers, using default user"
        );
      }
    }

    logger.info({ title: conv.title }, "Creating conversation");

    if (execute) {
      // Check if conversation already exists (skip permission filtering for seed script)
      const existingConversation = await ConversationResource.fetchById(
        auth,
        conv.sId,
        { dangerouslySkipPermissionFiltering: true, includeDeleted: true }
      );

      if (existingConversation) {
        if (!conv.overwrite) {
          logger.info(
            { sId: conv.sId },
            "Conversation already exists, skipping"
          );
          continue;
        }
        logger.info(
          { sId: conv.sId },
          "Conversation already exists, deleting to recreate it"
        );
        await deleteConversation(ctx, existingConversation);
      }

      // Create conversation with deterministic sId
      const conversation = await ConversationResource.makeNew(
        auth,
        {
          sId: conv.sId,
          title: conv.title,
          visibility: "unlisted",
          depth: 0,
          requestedSpaceIds: [],
        },
        null // no space
      );

      // Add user as participant so they can see the conversation
      await ConversationResource.upsertParticipation(auth, {
        conversation: conversation.toJSON(),
        action: "posted",
        user: conversationUser.toJSON(),
        lastReadAt: new Date(),
      });

      // Create user message and agent message for each exchange
      for (let i = 0; i < conv.exchanges.length; i++) {
        const exchange = conv.exchanges[i];

        // Replace all placeholders in message contents (agent mentions, suggestion directives...)
        const userContent = replacePlaceholders(
          exchange.user.content,
          placeholders
        );
        const agentContent = replacePlaceholders(
          exchange.agent.content,
          placeholders
        );

        // Create user message
        const userMessageRow = await UserMessageModel.create({
          userId: conversationUser.id,
          conversationId: conversation.id,
          workspaceId: workspace.id,
          content: userContent,
          userContextUsername: conversationUser.username ?? "dev-user",
          userContextTimezone: "UTC",
          userContextFullName: conversationUser.fullName() ?? "Dev User",
          userContextEmail: conversationUser.email ?? "dev@dust.tt",
          userContextProfilePictureUrl: null,
          userContextOrigin: "web",
          clientSideMCPServerIds: [],
        });

        const userMsgRow = await MessageModel.create({
          sId: exchange.user.sId,
          rank: i * 2,
          conversationId: conversation.id,
          parentId: null,
          userMessageId: userMessageRow.id,
          workspaceId: workspace.id,
        });

        // Create agent message with "succeeded" status since it has content
        const agentMessageRow = await AgentMessageModel.create({
          status: "succeeded",
          agentConfigurationId: agentId,
          agentConfigurationVersion: 0,
          conversationId: conversation.id,
          workspaceId: workspace.id,
          skipToolsValidation: false,
        });

        // Create agent step content with the response
        await AgentStepContentResource.createNewVersion({
          agentMessageId: agentMessageRow.id,
          workspaceId: workspace.id,
          step: 0,
          index: 0,
          type: "text_content",
          value: {
            type: "text_content",
            value: agentContent,
          },
        });

        await MessageModel.create({
          sId: exchange.agent.sId,
          rank: i * 2 + 1,
          conversationId: conversation.id,
          parentId: userMsgRow.id,
          agentMessageId: agentMessageRow.id,
          workspaceId: workspace.id,
        });
      }

      logger.info({ sId: conv.sId }, "Conversation created");
    }
  }
}

import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { UserResource } from "@app/lib/resources/user_resource";

import type { ConversationAsset, CreatedAgent, SeedContext } from "./types";

export interface SeedConversationsOptions {
  agents?: Map<string, CreatedAgent>;
  defaultAgentSId?: string;
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
    defaultAgentSId,
    placeholders = {},
    additionalUsers = new Map(),
  } = options;

  for (const conv of conversationAssets) {
    // Determine the agent to use
    let agentSId: string | undefined;
    if (conv.agentName) {
      const agent = agents.get(conv.agentName);
      if (agent) {
        agentSId = agent.sId;
      } else {
        logger.warn(
          { agentName: conv.agentName },
          "Agent not found for conversation, skipping"
        );
        continue;
      }
    } else {
      agentSId = defaultAgentSId;
    }

    if (!agentSId) {
      logger.warn(
        { title: conv.title },
        "No agent specified for conversation, skipping"
      );
      continue;
    }

    // Determine which user to use for this conversation
    let conversationUser = user;
    if (conv.userSId) {
      const specifiedUser = additionalUsers.get(conv.userSId);
      if (specifiedUser) {
        conversationUser = specifiedUser;
      } else {
        logger.warn(
          { userSId: conv.userSId },
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
        logger.info({ sId: conv.sId }, "Conversation already exists, skipping");
        continue;
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

        // Replace all placeholders in user message content
        let userContent = exchange.user.content;
        for (const [placeholder, value] of Object.entries(placeholders)) {
          userContent = userContent.replace(
            new RegExp(placeholder, "g"),
            value
          );
        }

        // Create user message
        const userMessageRow = await UserMessageModel.create({
          userId: conversationUser.id,
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
          agentConfigurationId: agentSId,
          agentConfigurationVersion: 0,
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
            value: exchange.agent.content,
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

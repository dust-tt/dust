import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import {
  AgentMessageModel,
  ConversationModel,
  ConversationParticipantModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { GLOBAL_AGENTS_SID } from "@app/types";

import type {
  ConversationAsset,
  ConversationsAsset,
  SeedContext,
} from "./types";

interface ConversationWithAgent extends ConversationAsset {
  agentId: string;
  isCustomAgent: boolean;
}

export async function seedConversations(
  ctx: SeedContext,
  conversationsAsset: ConversationsAsset,
  customAgentSId: string | null
): Promise<void> {
  const { workspace, user, execute, logger } = ctx;

  // Merge all conversations for processing
  const allConversations: ConversationWithAgent[] = [
    ...conversationsAsset.customAgentConversations.map((c) => ({
      ...c,
      agentId: customAgentSId ?? "",
      isCustomAgent: true,
    })),
    ...conversationsAsset.dustAgentConversations.map((c) => ({
      ...c,
      agentId: GLOBAL_AGENTS_SID.DUST,
      isCustomAgent: false,
    })),
  ];

  for (const conv of allConversations) {
    const agentLabel = conv.isCustomAgent
      ? "custom agent"
      : "Dust global agent";
    logger.info(
      { title: conv.title },
      `Creating conversation with ${agentLabel}`
    );

    // Skip custom agent conversations if we don't have the agent ID
    if (conv.isCustomAgent && !customAgentSId) {
      continue;
    }

    if (execute) {
      // Check if conversation already exists
      const existingConversation = await ConversationModel.findOne({
        where: { sId: conv.sId, workspaceId: workspace.id },
      });

      if (existingConversation) {
        logger.info({ sId: conv.sId }, "Conversation already exists, skipping");
        continue;
      }

      // Create conversation directly with the model for deterministic sId
      const conversation = await ConversationModel.create({
        sId: conv.sId,
        workspaceId: workspace.id,
        title: conv.title,
        visibility: "unlisted",
        depth: 0,
        requestedSpaceIds: [],
      });

      // Add user as participant so they can see the conversation
      await ConversationParticipantModel.create({
        conversationId: conversation.id,
        action: "posted",
        userId: user.id,
        workspaceId: workspace.id,
        unread: false,
        actionRequired: false,
      });

      // Create user message and agent message for each exchange
      for (let i = 0; i < conv.exchanges.length; i++) {
        const exchange = conv.exchanges[i];
        const agentIdToUse = conv.agentId;

        // Replace placeholder with actual agent sId in user message
        const userContent = exchange.user.content.replace(
          /__CUSTOM_AGENT_SID__/g,
          customAgentSId ?? ""
        );

        // Create user message
        const userMessageRow = await UserMessageModel.create({
          userId: user.id,
          workspaceId: workspace.id,
          content: userContent,
          userContextUsername: user.username ?? "dev-user",
          userContextTimezone: "UTC",
          userContextFullName: user.fullName() ?? "Dev User",
          userContextEmail: user.email ?? "dev@dust.tt",
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
          agentConfigurationId: agentIdToUse,
          agentConfigurationVersion: 0,
          workspaceId: workspace.id,
          skipToolsValidation: false,
        });

        // Create agent step content with the response
        await AgentStepContentModel.create({
          agentMessageId: agentMessageRow.id,
          workspaceId: workspace.id,
          step: 0,
          index: 0,
          version: 0,
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

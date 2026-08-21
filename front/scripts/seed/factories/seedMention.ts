import type { MentionStatusType } from "@app/lib/models/agent/conversation";
import {
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MentionResource } from "@app/lib/resources/mention_resource";

import type { CreatedAgent, SeedContext } from "./types";

export interface MentionAsset {
  // Deterministic, so a second run finds the conversation instead of duplicating it.
  conversationId: string;
  agentName: string;
  mentionedAt: Date;
  status?: MentionStatusType;
}

/**
 * Records that an agent was mentioned on a given date. A mention hangs off a message, so this
 * creates the conversation and message it needs.
 */
export async function seedMentions(
  ctx: SeedContext,
  mentionAssets: MentionAsset[],
  agents: Map<string, CreatedAgent>
): Promise<void> {
  const { auth, workspace, user, execute, logger } = ctx;

  for (const asset of mentionAssets) {
    const agent = agents.get(asset.agentName);
    if (!agent) {
      logger.warn(
        { agentName: asset.agentName },
        "Agent not found for mention, skipping"
      );
      continue;
    }

    logger.info(
      { agentName: asset.agentName, mentionedAt: asset.mentionedAt },
      "Creating mention"
    );

    if (!execute) {
      continue;
    }

    const existing = await ConversationResource.fetchById(
      auth,
      asset.conversationId,
      { dangerouslySkipPermissionFiltering: true, includeDeleted: true }
    );
    if (existing) {
      logger.info(
        { conversationId: asset.conversationId },
        "Conversation already exists, skipping"
      );
      continue;
    }

    const conversation = await ConversationResource.makeNew(
      auth,
      {
        sId: asset.conversationId,
        title: `Mention of ${asset.agentName}`,
        visibility: "unlisted",
        depth: 0,
        requestedSpaceIds: [],
      },
      null
    );

    const userMessageRow = await UserMessageModel.create({
      userId: user.id,
      conversationId: conversation.id,
      workspaceId: workspace.id,
      content: `@${asset.agentName}`,
      userContextUsername: user.username ?? "dev-user",
      userContextTimezone: "UTC",
      userContextFullName: user.fullName() ?? "Dev User",
      userContextEmail: user.email ?? "dev@dust.tt",
      userContextProfilePictureUrl: null,
      userContextOrigin: "web",
      clientSideMCPServerIds: [],
    });

    const messageRow = await MessageModel.create({
      sId: `${asset.conversationId}Msg`,
      rank: 0,
      conversationId: conversation.id,
      parentId: null,
      userMessageId: userMessageRow.id,
      workspaceId: workspace.id,
      createdAt: asset.mentionedAt,
    });

    await MentionResource.makeNew({
      messageId: messageRow.id,
      agentConfigurationId: agent.sId,
      workspaceId: workspace.id,
      status: asset.status ?? "approved",
      createdAt: asset.mentionedAt,
    });
  }
}

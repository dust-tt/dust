import _ from "lodash";
import { Op } from "sequelize";

import { destroyConversation } from "@app/lib/api/assistant/conversation/destroy";
import { Authenticator } from "@app/lib/auth";
import { Conversation } from "@app/lib/models/assistant/conversation";
import { Workspace } from "@app/lib/models/workspace";
import logger from "@app/logger/logger";

/**
 * Get workspace ids with conversations retention policy.
 */
export async function getWorkspacesWithConversationsRetentionActivity(): Promise<
  number[]
> {
  const workspaces = await Workspace.findAll({
    attributes: ["id"],
    where: {
      conversationsRetentionDays: {
        [Op.not]: null,
      },
    },
  });
  return workspaces.map((w) => w.id);
}

/**
 * Purge conversations for workspaces with retention policy.
 * We chunk the workspaces to avoid hitting the database with too many queries at once.
 */
type PurgeConversationsBatchActivityReturnType = {
  workspaceModelId: number;
  workspaceId: string;
  nbConversationsDeleted: number;
};

export async function purgeConversationsBatchActivity({
  workspaceIds,
}: {
  workspaceIds: number[];
}): Promise<PurgeConversationsBatchActivityReturnType[]> {
  const res: PurgeConversationsBatchActivityReturnType[] = [];

  for (const workspaceId of workspaceIds) {
    const workspace = await Workspace.findByPk(workspaceId);
    if (!workspace) {
      logger.error(
        { workspaceId },
        "Workspace with retention policy not found."
      );
      continue;
    }
    if (!workspace.conversationsRetentionDays) {
      logger.error(
        { workspaceId },
        "Workspace with retention policy has no retention days."
      );
      continue;
    }
    const retentionDays = workspace.conversationsRetentionDays;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const conversations = await Conversation.findAll({
      where: { workspaceId: workspace.id, updatedAt: { [Op.lt]: cutoffDate } },
    });

    logger.info(
      {
        workspaceId,
        retentionDays,
        cutoffDate,
        nbConversations: conversations.length,
      },
      "Purging conversations for workspace."
    );

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const conversationChunks = _.chunk(conversations, 4);
    for (const conversationChunk of conversationChunks) {
      await Promise.all(
        conversationChunk.map(async (c) => {
          await destroyConversation(auth, { conversationId: c.sId });
        })
      );
    }

    res.push({
      workspaceModelId: workspace.id,
      workspaceId: workspace.sId,
      nbConversationsDeleted: conversations.length,
    });
  }

  return res;
}

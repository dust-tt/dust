import _ from "lodash";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { Workspace } from "@app/lib/models/workspace";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
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

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const conversations = await ConversationResource.listAll(auth, {
      where: {
        updatedAt: {
          [Op.lt]: cutoffDate,
        },
      },
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

    const conversationChunks = _.chunk(conversations, 4);
    for (const conversationChunk of conversationChunks) {
      await Promise.all(
        conversationChunk.map(async (c) => {
          await c.delete(auth);
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

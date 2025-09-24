import { Op } from "sequelize";

import { destroyConversation } from "@app/lib/api/assistant/conversation/destroy";
import { Authenticator } from "@app/lib/auth";
import { AgentDataRetentionModel } from "@app/lib/models/assistant/agent_data_retention";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types";

/**
 * Get workspace ids with conversations retention policy.
 */
export async function getWorkspacesWithConversationsRetentionActivity(): Promise<
  number[]
> {
  const workspaces = await WorkspaceModel.findAll({
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
    const workspace = await WorkspaceResource.fetchByModelId(workspaceId);
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

    const conversations = await ConversationResource.listAllBeforeDate({
      auth,
      cutoffDate,
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

    await concurrentExecutor(
      conversations,
      async (c) => {
        const result = await destroyConversation(auth, {
          conversationId: c.sId,
        });
        if (result.isErr() && result.error.type !== "conversation_not_found") {
          throw result.error;
        }
      },
      {
        concurrency: 4,
      }
    );

    res.push({
      workspaceModelId: workspace.id,
      workspaceId: workspace.sId,
      nbConversationsDeleted: conversations.length,
    });
  }

  return res;
}

/**
 * Get agent configurations with conversations retention policy.
 */
export async function getAgentsWithConversationsRetentionActivity(): Promise<
  {
    agentConfigurationId: string;
    workspaceId: ModelId;
    retentionDays: number;
  }[]
> {
  const agentRetentions = await AgentDataRetentionModel.findAll();
  return agentRetentions.map((a) => ({
    agentConfigurationId: a.agentConfigurationId,
    workspaceId: a.workspaceId,
    retentionDays: a.retentionDays,
  }));
}

/**
 * Purge conversations for an agent.
 * We chunk the conversations to avoid hitting the database with too many queries at once.
 */
export async function purgeAgentConversationsBatchActivity({
  agentConfigurationId,
  workspaceId,
  retentionDays,
}: {
  agentConfigurationId: string;
  workspaceId: ModelId;
  retentionDays: number;
}): Promise<{
  agentConfigurationId: string;
  workspaceModelId: ModelId;
  workspaceId: string;
  retentionDays: number;
  nbConversationsDeleted: number;
}> {
  const workspace = await WorkspaceResource.fetchByModelId(workspaceId);
  if (!workspace) {
    throw new Error("Workspace not found");
  }
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const conversationIds =
    await ConversationResource.listConversationWithAgentCreatedBeforeDate({
      auth,
      agentConfigurationId,
      cutoffDate,
    });

  await concurrentExecutor(
    conversationIds,
    async (conversationId) => {
      const result = await destroyConversation(auth, {
        conversationId,
      });
      if (result.isErr() && result.error.type !== "conversation_not_found") {
        throw result.error;
      }
    },
    {
      concurrency: 4,
    }
  );

  return {
    agentConfigurationId,
    workspaceModelId: workspace.id,
    workspaceId: workspace.sId,
    retentionDays,
    nbConversationsDeleted: conversationIds.length,
  };
}

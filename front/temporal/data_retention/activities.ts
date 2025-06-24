import { Op } from "sequelize";

import { destroyConversation } from "@app/lib/api/assistant/conversation/destroy";
import { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";

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
    const workspace = await WorkspaceModel.findByPk(workspaceId);
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
      async (c) => destroyConversation(auth, { conversationId: c.sId }),
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

function hasRetentionDays(
  agent: AgentConfiguration
): agent is AgentConfiguration & { conversationsRetentionDays: number } {
  return agent.conversationsRetentionDays !== null;
}

/**
 * Get agent configurations with conversations retention policy.
 */
export async function getAgentConfigurationsWithConversationsRetentionActivity(): Promise<
  { agentConfigurationId: string; workspaceId: number; retentionDays: number }[]
> {
  const agentConfigurations = await AgentConfiguration.findAll({
    attributes: ["sId", "workspaceId", "conversationsRetentionDays"],
    where: {
      conversationsRetentionDays: {
        [Op.not]: null,
      },
      status: "active",
    },
  });

  return agentConfigurations.filter(hasRetentionDays).map((a) => ({
    agentConfigurationId: a.sId,
    workspaceId: a.workspaceId,
    retentionDays: a.conversationsRetentionDays,
  }));
}

/**
 * Purge conversations for agents with retention policy.
 * Uses createdAt instead of updatedAt for agent-specific retention.
 */
export async function purgeAgentConversationsBatchActivity({
  agentConfigs,
}: {
  agentConfigs: {
    agentConfigurationId: string;
    workspaceId: number;
    retentionDays: number;
  }[];
}): Promise<
  { agentConfigurationId: string; nbConversationsDeleted: number }[]
> {
  const res: {
    agentConfigurationId: string;
    nbConversationsDeleted: number;
  }[] = [];

  for (const config of agentConfigs) {
    const workspace = await WorkspaceModel.findByPk(config.workspaceId);
    if (!workspace) {
      logger.error(
        { workspaceId: config.workspaceId },
        "Workspace not found for agent retention."
      );
      continue;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.retentionDays);

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    // Find conversations with this agent created before cutoff.
    const conversations =
      await ConversationResource.listAgentConversationsBeforeDate({
        auth,
        agentConfigurationId: config.agentConfigurationId,
        cutoffDate,
      });

    logger.info(
      {
        agentConfigurationId: config.agentConfigurationId,
        retentionDays: config.retentionDays,
        cutoffDate,
        nbConversations: conversations.length,
      },
      "Purging conversations for agent."
    );

    await concurrentExecutor(
      conversations,
      async (c) => destroyConversation(auth, { conversationId: c.sId }),
      { concurrency: 4 }
    );

    res.push({
      agentConfigurationId: config.agentConfigurationId,
      nbConversationsDeleted: conversations.length,
    });
  }

  return res;
}

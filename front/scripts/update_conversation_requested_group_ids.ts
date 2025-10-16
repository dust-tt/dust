import isEqual from "lodash/isEqual";
import sortBy from "lodash/sortBy";
import { Op } from "sequelize";

import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentMessage, Message } from "@app/lib/models/assistant/conversation";
import { ConversationModel } from "@app/lib/models/assistant/conversation";
import { GroupResource } from "@app/lib/resources/group_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { isArrayEqual2DUnordered, normalizeArrays } from "@app/lib/utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types";

async function updateConversationRequestedGroupIds(
  workspaceId: string,
  execute: boolean,
  logger: Logger,
  options: {
    conversationIds?: string[];
    limit?: number;
  } = {}
) {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  logger.info(
    {
      workspaceId,
      workspaceName: workspace.name,
    },
    "Starting requestedGroupIds update for conversations"
  );

  // Build where clause
  const whereClause: any = { workspaceId: workspace.id };

  if (options.conversationIds && options.conversationIds.length > 0) {
    whereClause.sId = options.conversationIds;
  }

  // Fetch conversations
  const conversations = await ConversationModel.findAll({
    where: whereClause,
    order: [["createdAt", "DESC"]],
    limit: options.limit,
  });

  logger.info(
    {
      totalConversations: conversations.length,
    },
    "Found conversations"
  );

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const conversation of conversations) {
    try {
      // Get all agent messages in this conversation with their versions
      const messages = await Message.findAll({
        where: {
          conversationId: conversation.id,
          workspaceId: workspace.id,
        },
        attributes: [],
        include: [
          {
            model: AgentMessage,
            as: "agentMessage",
            required: true,
            attributes: ["agentConfigurationId", "agentConfigurationVersion"],
          },
        ],
      });

      // Extract unique (agentConfigurationId, version) pairs
      const agentVersionPairs = new Map<
        string,
        { sId: string; version: number }
      >();
      for (const message of messages) {
        if (message.agentMessage) {
          const key = `${message.agentMessage.agentConfigurationId}-${message.agentMessage.agentConfigurationVersion}`;
          agentVersionPairs.set(key, {
            sId: message.agentMessage.agentConfigurationId,
            version: message.agentMessage.agentConfigurationVersion,
          });
        }
      }

      if (agentVersionPairs.size === 0) {
        logger.debug(
          {
            conversationId: conversation.sId,
            conversationTitle: conversation.title,
          },
          "No agents in conversation, skipping"
        );
        skippedCount++;
        continue;
      }

      // Get the exact agent versions that were used in the conversation
      // We fetch directly from the database to bypass permission filtering
      const agents = await AgentConfiguration.findAll({
        where: {
          workspaceId: workspace.id,
          [Op.or]: Array.from(agentVersionPairs.values()).map((v) => ({
            sId: v.sId,
            version: v.version,
          })),
        },
      });

      logger.debug(
        {
          conversationId: conversation.sId,
          requestedAgentVersions: Array.from(agentVersionPairs.values()),
          foundAgents: agents.map((a) => ({ sId: a.sId, version: a.version })),
          foundCount: agents.length,
          requestedCount: agentVersionPairs.size,
        },
        "Fetched agents for conversation"
      );

      if (agents.length === 0) {
        logger.warn(
          {
            conversationId: conversation.sId,
            conversationTitle: conversation.title,
            requestedAgentVersions: Array.from(agentVersionPairs.values()),
          },
          "No agents found in database, skipping"
        );
        errorCount++;
        continue;
      }

      if (agents.length < agentVersionPairs.size) {
        logger.warn(
          {
            conversationId: conversation.sId,
            requestedAgentVersions: Array.from(agentVersionPairs.values()),
            foundAgents: agents.map((a) => ({
              sId: a.sId,
              version: a.version,
            })),
            missing: agentVersionPairs.size - agents.length,
          },
          "Some agent versions not found in database"
        );
      }

      // Calculate new requestedGroupIds from agents
      // Note: Agent.requestedGroupIds in the DB is number[][] (modelIds)
      // We need to convert to string[][] (sIds) for deduplication, then back to number[][]
      const agentRequirements: string[][] = agents.flatMap((agent) =>
        agent.requestedGroupIds.map((groupIds) =>
          groupIds.map((gId) =>
            GroupResource.modelIdToSId({
              id: gId,
              workspaceId: workspace.id,
            })
          )
        )
      );

      logger.debug(
        {
          conversationId: conversation.sId,
          agentRequirements,
          agentsWithGroupIds: agents.map((a) => ({
            sId: a.sId,
            requestedGroupIds: a.requestedGroupIds,
          })),
        },
        "Agent requirements extracted"
      );

      // Remove duplicates and sort each requirement
      const uniqueRequirements = agentRequirements
        .map((r) => sortBy(r))
        .filter(
          (req, index, self) => self.findIndex((r) => isEqual(r, req)) === index
        );

      // Convert sIds to modelIds
      const newRequestedGroupIds: ModelId[][] = uniqueRequirements.map(
        (groupSIds) =>
          groupSIds.map((groupSId) => {
            const modelId = getResourceIdFromSId(groupSId);
            if (modelId === null) {
              throw new Error(
                `Invalid group sId: ${groupSId} for conversation ${conversation.sId}`
              );
            }
            return modelId;
          })
      );

      // Convert current requestedGroupIds (already modelIds in DB)
      const currentRequestedGroupIds = conversation.requestedGroupIds;

      // Normalize for comparison
      const normalizedNewGroupIds = normalizeArrays(newRequestedGroupIds);
      const normalizedCurrentGroupIds = normalizeArrays(
        currentRequestedGroupIds
      );

      // Check if changed
      if (
        isArrayEqual2DUnordered(
          normalizedNewGroupIds,
          normalizedCurrentGroupIds
        )
      ) {
        logger.debug(
          {
            conversationId: conversation.sId,
            conversationTitle: conversation.title,
          },
          "Conversation group IDs are already up to date, skipping"
        );
        skippedCount++;
        continue;
      }

      logger.info(
        {
          conversationId: conversation.sId,
          conversationTitle: conversation.title,
          agentCount: agents.length,
          currentGroupIds: normalizedCurrentGroupIds,
          newGroupIds: normalizedNewGroupIds,
          execute,
        },
        execute
          ? "Updating conversation requestedGroupIds"
          : "[DRY RUN] Would update conversation requestedGroupIds"
      );

      if (execute) {
        await ConversationModel.update(
          { requestedGroupIds: normalizedNewGroupIds },
          {
            where: {
              id: conversation.id,
              workspaceId: workspace.id,
            },
          }
        );
        updatedCount++;
      } else {
        updatedCount++;
      }
    } catch (error) {
      logger.error(
        {
          conversationId: conversation.sId,
          conversationTitle: conversation.title,
          error,
        },
        "Error updating conversation requestedGroupIds"
      );
      errorCount++;
    }
  }

  logger.info(
    {
      workspaceId,
      totalConversations: conversations.length,
      updated: updatedCount,
      skipped: skippedCount,
      errors: errorCount,
      execute,
    },
    execute
      ? "Completed requestedGroupIds update"
      : "[DRY RUN] Completed requestedGroupIds dry run"
  );

  return {
    total: conversations.length,
    updated: updatedCount,
    skipped: skippedCount,
    errors: errorCount,
  };
}

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: true,
      description: "The workspace ID (sId) to update conversations for",
    },
    conversationIds: {
      type: "array",
      default: [],
      description:
        "Optional list of specific conversation IDs to update. If empty, updates all conversations in workspace.",
    },
    limit: {
      type: "number",
      description: "Limit the number of conversations to process",
    },
  },
  async ({ workspaceId, execute, conversationIds, limit }, logger) => {
    await updateConversationRequestedGroupIds(workspaceId, execute, logger, {
      conversationIds: conversationIds.map(String),
      limit,
    });
  }
);

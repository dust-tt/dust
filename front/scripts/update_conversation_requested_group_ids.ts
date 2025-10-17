import isEqual from "lodash/isEqual";
import sortBy from "lodash/sortBy";
import type { WhereOptions } from "sequelize";
import { Op } from "sequelize";

import { enrichAgentConfigurations } from "@app/lib/api/assistant/configuration/helpers";
import { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import {
  AgentMessage,
  ConversationModel,
  Message,
} from "@app/lib/models/assistant/conversation";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { isArrayEqual2DUnordered, normalizeArrays } from "@app/lib/utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { LightAgentConfigurationType, ModelId } from "@app/types";

const BATCH_SIZE = 1000; // Process conversations in batches of 1000

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

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId, {
    dangerouslyRequestAllGroups: true,
  });

  logger.info(
    {
      workspaceId,
      workspaceName: workspace.name,
    },
    "Starting requestedGroupIds update for conversations"
  );

  // Build where clause
  const whereClause: WhereOptions<ConversationModel> = {
    workspaceId: workspace.id,
  };

  if (options.conversationIds && options.conversationIds.length > 0) {
    whereClause.sId = options.conversationIds;
  }

  // Get total count for progress tracking
  const totalCount = await ConversationModel.count({ where: whereClause });

  logger.info(
    {
      totalConversations: totalCount,
      batchSize: BATCH_SIZE,
    },
    "Found conversations to process"
  );

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let processedCount = 0;

  // Process conversations in batches to avoid memory issues
  const effectiveLimit = options.limit ?? totalCount;
  let offset = 0;

  while (processedCount < effectiveLimit) {
    const batchLimit = Math.min(BATCH_SIZE, effectiveLimit - processedCount);

    logger.info(
      {
        offset,
        batchLimit,
        processedSoFar: processedCount,
        totalToProcess: effectiveLimit,
      },
      "Fetching next batch of conversations"
    );

    const conversations = await ConversationModel.findAll({
      where: whereClause,
      order: [["createdAt", "DESC"]],
      limit: batchLimit,
      offset,
    });

    if (conversations.length === 0) {
      break;
    }

    for (const conversation of conversations) {
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
        logger.info(
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
      // Fetch directly from DB to get specific versions (not just latest)
      const agentConfigs = await AgentConfiguration.findAll({
        where: {
          workspaceId: workspace.id,
          [Op.or]: Array.from(agentVersionPairs.values()).map((v) => ({
            sId: v.sId,
            version: v.version,
          })),
        },
      });

      // Enrich with actions if needed (uses auth with dangerouslyRequestAllGroups)
      const agents = await enrichAgentConfigurations(auth, agentConfigs, {
        variant: "light",
      });

      logger.info(
        {
          conversationId: conversation.sId,
          requestedAgentVersions: Array.from(agentVersionPairs.values()),
          foundAgents: agents.map((a: LightAgentConfigurationType) => ({
            sId: a.sId,
            version: a.version,
          })),
          foundCount: agents.length,
          requestedCount: agentVersionPairs.size,
        },
        "Fetched exact agent versions for conversation"
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
            foundAgents: agents.map((a: LightAgentConfigurationType) => ({
              sId: a.sId,
              version: a.version,
            })),
            missing: agentVersionPairs.size - agents.length,
          },
          "Some agent versions not found in database"
        );
      }

      // Calculate new requestedGroupIds from agents
      // Note: agents.requestedGroupIds is string[][] (sIds) from the API after enrichment
      const agentRequirements: string[][] = agents.flatMap(
        (agent: LightAgentConfigurationType) => agent.requestedGroupIds
      );

      logger.info(
        {
          conversationId: conversation.sId,
          agentRequirements,
          agentsWithGroupIds: agents.map((a: LightAgentConfigurationType) => ({
            sId: a.sId,
            version: a.version,
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

      // Convert current requestedGroupIds (stored as BIGINT, returned as strings by Sequelize)
      // Parse strings to numbers for proper comparison
      const currentRequestedGroupIds = conversation.requestedGroupIds.map(
        (groupArray) =>
          groupArray.map((groupId) =>
            typeof groupId === "string" ? parseInt(groupId, 10) : groupId
          )
      );

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
        logger.info(
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
            hooks: false,
          }
        );
        updatedCount++;
      } else {
        updatedCount++;
      }

      processedCount++;
    }

    offset += conversations.length;

    logger.info(
      {
        batchProcessed: conversations.length,
        totalProcessed: processedCount,
        updated: updatedCount,
        skipped: skippedCount,
        errors: errorCount,
      },
      "Completed batch"
    );
  }

  logger.info(
    {
      workspaceId,
      totalProcessed: processedCount,
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
    total: processedCount,
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

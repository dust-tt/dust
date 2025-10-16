import isEqual from "lodash/isEqual";
import sortBy from "lodash/sortBy";

import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { AgentMessage, Message } from "@app/lib/models/assistant/conversation";
import { ConversationModel } from "@app/lib/models/assistant/conversation";
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

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

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
      // Get all agent messages in this conversation
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
            attributes: ["agentConfigurationId"],
          },
        ],
      });

      // Extract unique agent IDs
      const agentConfigurationIds = new Set<string>();
      for (const message of messages) {
        if (message.agentMessage) {
          agentConfigurationIds.add(message.agentMessage.agentConfigurationId);
        }
      }

      if (agentConfigurationIds.size === 0) {
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

      // Get all mentioned agents with their requestedGroupIds
      const agents = await getAgentConfigurations(auth, {
        agentIds: Array.from(agentConfigurationIds),
        variant: "light",
      });

      // Calculate new requestedGroupIds from agents
      // Note: This follows the same logic as updateConversationRequestedGroupIds
      // but recalculates from scratch instead of being additive
      const agentRequirements: string[][] = agents.flatMap(
        (agent) => agent.requestedGroupIds
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

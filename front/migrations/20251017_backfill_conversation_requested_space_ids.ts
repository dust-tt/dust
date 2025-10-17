import * as _ from "lodash";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import {
  AgentMessage,
  ConversationModel,
  Message,
} from "@app/lib/models/assistant/conversation";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

interface ConversationUpdateStats {
  total: number;
  updated: number;
  errors: number;
}

async function updateConversationRequestedSpaceIds(
  auth: Authenticator,
  conversation: ConversationModel,
  execute: boolean,
  logger: Logger
): Promise<{ updated: boolean; error?: string }> {
  try {
    // Skip if requestedSpaceIds is already populated
    if (conversation.requestedSpaceIds.length > 0) {
      logger.debug(
        { conversationId: conversation.sId },
        "Conversation already has requestedSpaceIds, skipping"
      );
      return { updated: false };
    }

    // Find all agent messages in this conversation to determine which agents are involved
    const messages = await Message.findAll({
      where: {
        conversationId: conversation.id,
        agentMessageId: { [Op.not]: null },
      },
      include: [
        {
          model: AgentMessage,
          as: "agentMessage",
          required: true,
          attributes: ["agentConfigurationId", "agentConfigurationVersion"],
        },
      ],
      attributes: [],
    });

    const agentConfigPairs = _.uniqWith(
      messages.map((m) => ({
        sId: m.agentMessage!.agentConfigurationId,
        version: m.agentMessage!.agentConfigurationVersion,
      })),
      _.isEqual
    );

    if (agentConfigPairs.length === 0) {
      logger.debug(
        { conversationId: conversation.sId },
        "Conversation has no agent messages, skipping"
      );
      return { updated: false };
    }

    // Get the agent configurations involved in this conversation (matching sId and version pairs)
    const agentConfigurations = await AgentConfiguration.findAll({
      where: {
        [Op.or]: agentConfigPairs.map((pair) => ({
          sId: pair.sId,
          version: pair.version,
        })),
        status: "active",
      },
      attributes: ["id", "sId", "version", "requestedSpaceIds"],
    });

    if (agentConfigurations.length === 0) {
      logger.debug(
        { conversationId: conversation.sId },
        "No active agents found for conversation, skipping"
      );
      return { updated: false };
    }

    // Collect all space IDs from involved agents
    const allSpaceIds = agentConfigurations.flatMap(
      (agent) => agent.requestedSpaceIds || []
    );

    // Remove duplicates and filter out empty values
    const uniqueSpaceIds = _.uniq(
      allSpaceIds.filter((id) => id !== null && id !== undefined)
    );

    // Skip if no space IDs are required
    if (uniqueSpaceIds.length === 0) {
      logger.debug(
        { conversationId: conversation.sId },
        "Involved agents have no space requirements, skipping"
      );
      return { updated: false };
    }

    logger.info(
      {
        conversationId: conversation.sId,
        agentCount: agentConfigurations.length,
        spaceIds: uniqueSpaceIds,
        execute,
      },
      "Updating conversation requestedSpaceIds"
    );

    if (execute) {
      await ConversationModel.update(
        {
          requestedSpaceIds: uniqueSpaceIds,
        },
        { where: { id: conversation.id } }
      );
    }

    return { updated: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error(
      { conversationId: conversation.sId, error: errorMessage },
      "Error updating conversation requestedSpaceIds"
    );
    return { updated: false, error: errorMessage };
  }
}

async function updateConversationsForWorkspace(
  workspaceId: string,
  execute: boolean,
  logger: Logger
): Promise<ConversationUpdateStats> {
  const workspace = await WorkspaceModel.findOne({
    where: { sId: workspaceId },
  });
  if (!workspace) {
    logger.error({ workspaceId }, "Workspace not found");
    return { total: 0, updated: 0, errors: 0 };
  }

  logger.info(
    { workspaceId, workspaceName: workspace.name, execute },
    "Processing workspace"
  );

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId, {
    dangerouslyRequestAllGroups: true,
  });

  const stats: ConversationUpdateStats = {
    total: 0,
    updated: 0,
    errors: 0,
  };

  // Process conversations in paginated batches to handle large datasets
  const batchSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const conversations = await ConversationModel.findAll({
      where: {
        workspaceId: workspace.id,
        requestedSpaceIds: [],
      },
      attributes: ["id", "sId", "requestedSpaceIds"],
      limit: batchSize,
      offset: offset,
      order: [["id", "ASC"]], // Ensure consistent ordering for pagination
    });

    if (conversations.length === 0) {
      hasMore = false;
      break;
    }

    logger.info(
      { workspaceId, batchSize: conversations.length, offset },
      "Processing conversation batch"
    );

    stats.total += conversations.length;

    // Process conversations in smaller chunks within each batch
    const conversationChunks = _.chunk(conversations, 10);

    for (const chunk of conversationChunks) {
      const results = await concurrentExecutor(
        chunk,
        async (conversation) =>
          updateConversationRequestedSpaceIds(
            auth,
            conversation,
            execute,
            logger
          ),
        { concurrency: 5 }
      );

      for (const result of results) {
        if (result.error) {
          stats.errors++;
        } else if (result.updated) {
          stats.updated++;
        }
      }
    }

    offset += batchSize;

    // If we got fewer results than the batch size, we're done
    if (conversations.length < batchSize) {
      hasMore = false;
    }
  }

  logger.info(
    { workspaceId, totalProcessed: stats.total },
    "Completed processing all conversation batches for workspace"
  );

  logger.info(
    {
      workspaceId,
      workspaceName: workspace.name,
      stats,
      execute,
    },
    "Completed workspace processing"
  );

  return stats;
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description: "Specific workspace SID to process",
      required: false,
    },
  },
  async ({ execute, workspaceId }, logger) => {
    logger.info(
      { execute, workspaceId },
      "Starting conversation requestedSpaceIds backfill"
    );

    const globalStats: ConversationUpdateStats = {
      total: 0,
      updated: 0,
      errors: 0,
    };

    if (workspaceId) {
      // Process specific workspace
      const stats = await updateConversationsForWorkspace(
        workspaceId,
        execute,
        logger
      );
      globalStats.total += stats.total;
      globalStats.updated += stats.updated;
      globalStats.errors += stats.errors;
    } else {
      // Process all workspaces
      await runOnAllWorkspaces(
        async (workspace) => {
          const stats = await updateConversationsForWorkspace(
            workspace.sId,
            execute,
            logger
          );
          globalStats.total += stats.total;
          globalStats.updated += stats.updated;
          globalStats.errors += stats.errors;
        },
        { concurrency: 3 }
      );
    }

    logger.info(
      {
        execute,
        globalStats,
      },
      execute
        ? "Completed conversation requestedSpaceIds backfill"
        : "Dry run completed - would have backfilled conversation requestedSpaceIds"
    );

    if (globalStats.errors > 0) {
      logger.warn(
        { errorCount: globalStats.errors },
        "Some conversations failed to update - check logs for details"
      );
    }
  }
);

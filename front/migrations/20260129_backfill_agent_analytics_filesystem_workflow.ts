import { subDays } from "date-fns";
import type { FindOptions } from "sequelize";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { AgentMCPActionModel } from "@app/lib/models/agent/actions/mcp";
import {
  AgentMessageModel,
  ConversationModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { launchStoreAgentAnalyticsWorkflow } from "@app/temporal/analytics_queue/client";
import type { LightWorkspaceType } from "@app/types";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

async function backfillAgentAnalyticsWorkflow(
  workspace: LightWorkspaceType,
  logger: Logger,
  execute: boolean
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId, {
    dangerouslyRequestAllGroups: true,
  });
  const authType = auth.toJSON();

  // Get all agent messages from the last 30 days for this workspace.
  // We fetch messages in batches, then filter post-query for semantic_search actions.
  // This avoids expensive JSONB queries without indexes by filtering in app code.
  const thirtyDaysAgo = subDays(new Date(), 30);

  logger.info(
    {
      workspaceId: workspace.sId,
      since: thirtyDaysAgo.toISOString(),
    },
    "Starting agent analytics workflow backfill for semantic_search tool"
  );

  // Query all agent messages from the last 30 days.
  // We'll filter for semantic_search tool usage post-query.
  const baseWhere: FindOptions<MessageModel>["where"] = {
    workspaceId: workspace.id,
    createdAt: {
      [Op.gte]: thirtyDaysAgo,
    },
    agentMessageId: {
      [Op.not]: null,
    },
  };

  // First, count total messages to process
  const totalCount = await MessageModel.count({
    where: baseWhere,
    include: [
      {
        model: ConversationModel,
        as: "conversation",
        required: true,
        where: {
          visibility: ["unlisted", "workspace"],
        },
      },
    ],
  });

  logger.info(
    {
      workspaceId: workspace.sId,
      count: totalCount,
    },
    "Found agent messages to process"
  );

  if (!totalCount) {
    return;
  }

  let successCount = 0;
  let errorCount = 0;
  let processedCount = 0;

  // Process in batches to avoid OOM
  const BATCH_SIZE = 5000;
  let lastCreatedAt: Date | null = null;
  let lastId: number | null = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    logger.info(
      {
        workspaceId: workspace.sId,
        processedCount,
        totalCount,
        progress: `${Math.round((processedCount / totalCount) * 100)}%`,
      },
      "Processing batch"
    );

    const where: FindOptions<MessageModel>["where"] =
      lastCreatedAt && lastId !== null
        ? {
            [Op.and]: [
              baseWhere,
              {
                [Op.or]: [
                  {
                    createdAt: {
                      [Op.gt]: lastCreatedAt,
                    },
                  },
                  {
                    createdAt: lastCreatedAt,
                    id: {
                      [Op.gt]: lastId,
                    },
                  },
                ],
              },
            ],
          }
        : baseWhere;

    const agentMessagesBatch: MessageModel[] = await MessageModel.findAll({
      where,
      include: [
        {
          model: AgentMessageModel,
          as: "agentMessage",
          required: true,
        },
        {
          model: ConversationModel,
          as: "conversation",
          required: true,
          where: {
            visibility: ["unlisted", "workspace"],
          },
        },
      ],
      order: [
        ["createdAt", "ASC"],
        ["id", "ASC"],
      ],
      limit: BATCH_SIZE,
    });

    if (agentMessagesBatch.length === 0) {
      break;
    }

    const lastMessage = agentMessagesBatch[agentMessagesBatch.length - 1];
    lastCreatedAt = lastMessage.createdAt;
    lastId = lastMessage.id;

    // Get agent message model IDs for this batch
    const agentMessageModelIds = agentMessagesBatch
      .map((m) => m.agentMessageId)
      .filter((id): id is number => id !== null);

    // Fetch MCP actions for these messages (uses indexed column)
    const mcpActions = await AgentMCPActionModel.findAll({
      attributes: ["agentMessageId", "toolConfiguration"],
      where: {
        workspaceId: workspace.id,
        agentMessageId: {
          [Op.in]: agentMessageModelIds,
        },
      },
    });

    // Filter in app code for semantic_search tool.
    // toolConfiguration is typed as LightMCPToolConfigurationType which includes originalName.
    const agentMessageIdsWithSemanticSearch = new Set(
      mcpActions
        .filter(
          (action) =>
            action.toolConfiguration.originalName === "semantic_search"
        )
        .map((action) => action.agentMessageId)
    );

    // Filter batch to only messages with semantic_search actions
    const filteredBatch = agentMessagesBatch.filter(
      (m) =>
        m.agentMessageId &&
        agentMessageIdsWithSemanticSearch.has(m.agentMessageId)
    );

    logger.info(
      {
        workspaceId: workspace.sId,
        batchSize: agentMessagesBatch.length,
        filteredSize: filteredBatch.length,
      },
      "Filtered batch for semantic_search actions"
    );

    if (execute && filteredBatch.length > 0) {
      // Filter out messages without parent IDs and collect parent IDs for batch fetch.
      const messagesWithParents = filteredBatch.filter((m) => m.parentId);
      const parentIds = messagesWithParents.map((m) => m.parentId as number);

      // Batch fetch all parent user messages to avoid N+1 queries.
      const userMessageRows = await MessageModel.findAll({
        where: {
          id: { [Op.in]: parentIds },
          workspaceId: workspace.id,
        },
        include: [
          {
            model: UserMessageModel,
            as: "userMessage",
            required: true,
          },
        ],
      });
      const userMessageById = new Map(userMessageRows.map((m) => [m.id, m]));

      await concurrentExecutor(
        messagesWithParents,
        async (agentMessageRow) => {
          try {
            const userMessageRow = userMessageById.get(
              agentMessageRow.parentId as number
            );
            if (!userMessageRow?.userMessage) {
              return;
            }

            const { agentMessage, conversation } = agentMessageRow;
            if (!agentMessage || !conversation) {
              return;
            }

            const agentLoopArgs: AgentLoopArgs = {
              agentMessageId: agentMessageRow.sId,
              agentMessageVersion: agentMessageRow.version,
              conversationId: conversation.sId,
              conversationTitle: conversation.title,
              userMessageId: userMessageRow.sId,
              userMessageVersion: userMessageRow.version,
              userMessageOrigin: userMessageRow.userMessage.userContextOrigin,
            };

            const result = await launchStoreAgentAnalyticsWorkflow({
              authType,
              agentLoopArgs,
            });

            if (result.isErr()) {
              errorCount++;
              logger.error(
                {
                  messageId: agentMessageRow.sId,
                  workspaceId: workspace.sId,
                  error: result.error,
                },
                "Failed to launch agent analytics workflow"
              );
              return;
            }

            successCount++;
          } catch (err) {
            errorCount++;
            logger.error(
              {
                messageId: agentMessageRow.sId,
                workspaceId: workspace.sId,
                error: err,
              },
              "Failed to launch agent analytics workflow"
            );
          }
        },
        { concurrency: 10 }
      );
    }

    processedCount += agentMessagesBatch.length;

    logger.info(
      {
        workspaceId: workspace.sId,
        processedCount,
        totalCount,
        successCount,
        errorCount,
      },
      "Batch completed"
    );
  }

  if (!execute) {
    logger.info(
      {
        workspaceId: workspace.sId,
        totalProcessed: totalCount,
      },
      "Would process these messages (dry run)"
    );
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      successCount,
      errorCount,
      totalProcessed: processedCount,
    },
    "Completed agent analytics workflow backfill for semantic_search tool"
  );
}

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: false,
      description: "Run on a single workspace (optional)",
    },
  },
  async ({ execute, workspaceId }, logger) => {
    if (workspaceId) {
      // Run on a single workspace
      const workspace = await WorkspaceResource.fetchById(workspaceId);

      if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }

      await backfillAgentAnalyticsWorkflow(
        renderLightWorkspaceType({ workspace }),
        logger,
        execute
      );
    } else {
      // Run on all workspaces
      return runOnAllWorkspaces(
        async (workspace) => {
          await backfillAgentAnalyticsWorkflow(workspace, logger, execute);
        },
        { concurrency: 5 }
      );
    }
  }
);

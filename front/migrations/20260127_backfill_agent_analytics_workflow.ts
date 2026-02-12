import { subDays } from "date-fns";
import type { FindOptions } from "sequelize";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import {
  AgentMessageFeedbackModel,
  AgentMessageModel,
  ConversationModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { launchStoreAgentAnalyticsWorkflow } from "@app/temporal/analytics_queue/client";
import type { LightWorkspaceType } from "@app/types/user";
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

  // Get all agent messages from the last 90 days for this workspace
  const ninetyDaysAgo = subDays(new Date(), 30);

  logger.info(
    {
      workspaceId: workspace.sId,
      since: ninetyDaysAgo.toISOString(),
    },
    "Starting agent analytics workflow backfill"
  );

  const baseWhere: FindOptions<MessageModel>["where"] = {
    workspaceId: workspace.id,
    agentMessageId: {
      [Op.ne]: null,
    },
    createdAt: {
      [Op.gte]: ninetyDaysAgo,
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
          include: [
            {
              model: AgentMessageFeedbackModel,
              as: "feedbacks",
              required: false,
              include: [
                {
                  model: UserModel,
                  as: "user",
                  required: false,
                },
              ],
            },
          ],
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

    if (execute) {
      await concurrentExecutor(
        agentMessagesBatch,
        async (agentMessageRow) => {
          try {
            // Find the parent user message
            if (!agentMessageRow.parentId) {
              logger.warn(
                {
                  messageId: agentMessageRow.sId,
                  workspaceId: workspace.sId,
                },
                "Skipping agent message without parent user message"
              );
              return;
            }

            const userMessageRow = await MessageModel.findOne({
              where: {
                id: agentMessageRow.parentId,
                workspaceId: workspace.id,
              },
              include: [
                {
                  model: UserMessageModel,
                  as: "userMessage",
                  required: true,
                  include: [
                    {
                      model: UserModel,
                      as: "user",
                      required: false,
                    },
                  ],
                },
              ],
            });

            // Find the parent user message
            if (!userMessageRow) {
              logger.warn(
                {
                  messageId: agentMessageRow.sId,
                  workspaceId: workspace.sId,
                },
                "Skipping agent message without parent user message"
              );
              return;
            }

            const {
              agentMessage: agentAgentMessageRow,
              conversation: conversationRow,
            } = agentMessageRow;

            if (!agentAgentMessageRow || !conversationRow) {
              throw new Error("Agent message or conversation not found");
            }

            const { userMessage: userUserMessageRow } = userMessageRow;

            if (!userUserMessageRow) {
              throw new Error("User message not found");
            }

            const agentLoopArgs: AgentLoopArgs = {
              agentMessageId: agentMessageRow.sId,
              agentMessageVersion: agentMessageRow.version,
              conversationId: conversationRow.sId,
              conversationTitle: conversationRow.title,
              userMessageId: userMessageRow.sId,
              userMessageVersion: userMessageRow.version,
              userMessageOrigin: userUserMessageRow.userContextOrigin,
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
    "Completed agent analytics workflow backfill for workspace"
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

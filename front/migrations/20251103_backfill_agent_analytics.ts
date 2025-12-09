import { subDays } from "date-fns";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import {
  AgentMessage,
  AgentMessageFeedbackModel,
  ConversationModel,
  Message,
  UserMessage,
} from "@app/lib/models/agent/conversation";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { storeAgentAnalytics } from "@app/temporal/analytics_queue/activities";
import { LightWorkspaceType } from "@app/types";

async function backfillAgentAnalytics(
  workspace: LightWorkspaceType,
  logger: Logger,
  execute: boolean
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId, {
    dangerouslyRequestAllGroups: true,
  });

  // Get all agent messages from the last 90 days for this workspace
  const ninetyDaysAgo = subDays(new Date(), 90);

  logger.info(
    {
      workspaceId: workspace.sId,
      since: ninetyDaysAgo.toISOString(),
    },
    "Starting agent analytics backfill"
  );

  // First, count total messages to process
  const totalCount = await Message.count({
    where: {
      workspaceId: workspace.id,
      agentMessageId: {
        [Op.ne]: null,
      },
      createdAt: {
        [Op.gte]: ninetyDaysAgo,
      },
    },
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

  let successCount = 0;
  let errorCount = 0;
  let processedCount = 0;

  // Process in batches to avoid OOM
  const BATCH_SIZE = 5000;
  let offset = 0;

  while (offset < totalCount) {
    logger.info(
      {
        workspaceId: workspace.sId,
        offset,
        totalCount,
        progress: `${Math.round((offset / totalCount) * 100)}%`,
      },
      "Processing batch"
    );

    const agentMessagesBatch = await Message.findAll({
      where: {
        workspaceId: workspace.id,
        agentMessageId: {
          [Op.ne]: null,
        },
        createdAt: {
          [Op.gte]: ninetyDaysAgo,
        },
      },
      include: [
        {
          model: AgentMessage,
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
      order: [["createdAt", "ASC"]],
      limit: BATCH_SIZE,
      offset: offset,
    });

    if (agentMessagesBatch.length === 0) {
      break;
    }

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

            const userMessageRow = await Message.findOne({
              where: {
                id: agentMessageRow.parentId,
                workspaceId: workspace.id,
              },
              include: [
                {
                  model: UserMessage,
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

            // Store the analytics
            await storeAgentAnalytics(auth, {
              agentMessageRow,
              agentAgentMessageRow,
              userModel: userUserMessageRow.user ?? null,
              conversationRow,
              contextOrigin: userUserMessageRow.userContextOrigin ?? null,
            });

            successCount++;
          } catch (err) {
            errorCount++;
            logger.error(
              {
                messageId: agentMessageRow.sId,
                workspaceId: workspace.sId,
                error: err,
              },
              "Failed to store agent analytics"
            );
          }
        },
        { concurrency: 10 }
      );
    }

    processedCount += agentMessagesBatch.length;
    offset += BATCH_SIZE;

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
    "Completed agent analytics backfill for workspace"
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
      const workspace = await WorkspaceModel.findOne({
        where: {
          sId: workspaceId,
        },
      });

      if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }

      await backfillAgentAnalytics(
        renderLightWorkspaceType({ workspace }),
        logger,
        execute
      );
    } else {
      // Run on all workspaces
      return runOnAllWorkspaces(
        async (workspace) => {
          await backfillAgentAnalytics(workspace, logger, execute);
        },
        { concurrency: 5 }
      );
    }
  }
);

import { subDays } from "date-fns";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import {
  AgentMessage,
  ConversationModel,
  ConversationParticipantModel,
  Message,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { storeAgentAnalyticsActivity } from "@app/temporal/analytics_queue/activities";
import { LightWorkspaceType } from "@app/types";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

async function backfillAgentAnalytics(
  workspace: LightWorkspaceType,
  logger: Logger,
  execute: boolean
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId, {
    dangerouslyRequestAllGroups: true,
  });

  // Get all agent messages from the last 30 days for this workspace
  const thirtyDaysAgo = subDays(new Date(), 30);

  logger.info(
    {
      workspaceId: workspace.sId,
      since: thirtyDaysAgo.toISOString(),
    },
    "Starting agent analytics backfill"
  );

  // First, get all conversations that were updated in the last 30 days
  // Use ConversationParticipantModel as it gets updated when messages are posted
  // This allows us to iterate per conversation and leverage the full index
  const participants = await ConversationParticipantModel.findAll({
    where: {
      workspaceId: workspace.id,
      updatedAt: {
        [Op.gte]: thirtyDaysAgo,
      },
    },
    attributes: ["conversationId"],
  });

  // Extract unique conversation IDs
  const conversationIds = [
    ...new Set(participants.map((p) => p.conversationId)),
  ];

  logger.info(
    {
      workspaceId: workspace.sId,
      conversationCount: conversationIds.length,
    },
    "Found conversations to process"
  );

  let allAgentMessages: Message[] = [];

  // Query messages per conversation to leverage the (workspaceId, conversationId, createdAt) index
  await concurrentExecutor(
    conversationIds,
    async (conversationId) => {
      const messages = await Message.findAll({
        where: {
          workspaceId: workspace.id,
          conversationId,
          agentMessageId: {
            [Op.ne]: null,
          },
          createdAt: {
            [Op.gte]: thirtyDaysAgo,
          },
        },
        include: [
          {
            model: AgentMessage,
            as: "agentMessage",
            required: true,
          },
          {
            model: ConversationModel,
            as: "conversation",
            required: true,
          },
        ],
        order: [["createdAt", "ASC"]],
      });

      allAgentMessages.push(...messages);
    },
    { concurrency: 5 }
  );

  logger.info(
    {
      workspaceId: workspace.sId,
      count: allAgentMessages.length,
    },
    "Found agent messages to process"
  );

  let successCount = 0;
  let errorCount = 0;

  if (execute) {
    await concurrentExecutor(
      allAgentMessages,
      async (message) => {
        try {
          if (!message.agentMessage || !message.conversation) {
            logger.warn(
              {
                messageId: message.sId,
                workspaceId: workspace.sId,
              },
              "Skipping message without agentMessage or conversation"
            );
            return;
          }

          // Find the parent user message
          if (!message.parentId) {
            logger.warn(
              {
                messageId: message.sId,
                workspaceId: workspace.sId,
              },
              "Skipping agent message without parent user message"
            );
            return;
          }

          const userMessageRow = await Message.findOne({
            where: {
              id: message.parentId,
              workspaceId: workspace.id,
            },
            include: [
              {
                model: UserMessage,
                as: "userMessage",
                required: true,
              },
            ],
          });

          if (!userMessageRow?.userMessage) {
            logger.warn(
              {
                messageId: message.sId,
                parentId: message.parentId,
                workspaceId: workspace.sId,
              },
              "Could not find parent user message"
            );
            return;
          }

          // Construct AgentLoopArgs
          const agentLoopArgs: AgentLoopArgs = {
            agentMessageId: message.sId,
            agentMessageVersion: message.version,
            conversationId: message.conversation.sId,
            conversationTitle: message.conversation.title,
            userMessageId: userMessageRow.sId,
            userMessageVersion: userMessageRow.version,
          };

          // Store the analytics
          await storeAgentAnalyticsActivity(auth.toJSON(), {
            agentLoopArgs,
          });

          successCount++;
          logger.info(
            {
              messageId: message.sId,
              workspaceId: workspace.sId,
            },
            "Successfully stored agent analytics"
          );
        } catch (err) {
          errorCount++;
          logger.error(
            {
              messageId: message.sId,
              workspaceId: workspace.sId,
              error: err,
            },
            "Failed to store agent analytics"
          );
        }
      },
      { concurrency: 10 }
    );
  } else {
    logger.info(
      {
        workspaceId: workspace.sId,
        messages: allAgentMessages.map((m) => ({
          messageId: m.sId,
          conversationId: m.conversation?.sId,
          createdAt: m.createdAt,
        })),
      },
      "Would process these messages (dry run)"
    );
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      successCount,
      errorCount,
      totalProcessed: allAgentMessages.length,
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
      return runOnAllWorkspaces(async (workspace) => {
        await backfillAgentAnalytics(workspace, logger, execute);
      });
    }
  }
);

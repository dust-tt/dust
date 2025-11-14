import { subDays } from "date-fns";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import {
  AgentMessage,
  AgentMessageFeedback,
  ConversationModel,
  Message,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
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

  // Get all agent messages from the last 30 days for this workspace
  const ninetyDaysAgo = subDays(new Date(), 90);

  logger.info(
    {
      workspaceId: workspace.sId,
      since: ninetyDaysAgo.toISOString(),
    },
    "Starting agent analytics backfill"
  );

  const allAgentMessages = await Message.findAll({
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
            model: AgentMessageFeedback,
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
  });

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
            origin: userUserMessageRow.userContextOrigin ?? null,
            conversationRow,
            contextOrigin: userUserMessageRow.userContextOrigin,
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
  } else {
    logger.info(
      {
        workspaceId: workspace.sId,
        totalProcessed: allAgentMessages.length,
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
      return runOnAllWorkspaces(
        async (workspace) => {
          await backfillAgentAnalytics(workspace, logger, execute);
        },
        { concurrency: 5 }
      );
    }
  }
);

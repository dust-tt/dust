import logger, { Logger } from "@app/logger/logger";
import {
  AgentMessageFeedbackModel,
  AgentMessageModel,
  ConversationModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";
import type { ModelId } from "@app/types/shared/model_id";
import { Op } from "sequelize";

const BATCH_SIZE = 512;

async function fetchFeedbacksBatch(
  workspace: LightWorkspaceType,
  lastModelId: ModelId
) {
  return AgentMessageFeedbackModel.findAll({
    where: {
      workspaceId: workspace.id,
      conversationId: null,
      id: { [Op.gt]: lastModelId },
    },
    attributes: ["id", "agentMessageId"],
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        attributes: ["id"],
        required: true,
        include: [
          {
            model: MessageModel,
            as: "message",
            attributes: ["id"],
            required: true,
            include: [
              {
                model: ConversationModel,
                as: "conversation",
                attributes: ["id"],
                required: true,
              },
            ],
          },
        ],
      },
    ],
    order: [["id", "ASC"]],
    limit: BATCH_SIZE,
  });
}

function groupFeedbacksByConversation(
  feedbacks: AgentMessageFeedbackModel[],
  logger: Logger
): Map<ModelId, ModelId[]> {
  const feedbackByConversation = new Map<ModelId, ModelId[]>();

  for (const feedback of feedbacks) {
    const conversationId = feedback.agentMessage?.message?.conversation?.id;

    if (!conversationId) {
      logger.warn(
        { feedbackId: feedback.id },
        "Could not resolve conversationId for feedback, skipping."
      );
      continue;
    }

    const ids = feedbackByConversation.get(conversationId);
    if (ids) {
      ids.push(feedback.id);
    } else {
      feedbackByConversation.set(conversationId, [feedback.id]);
    }
  }

  return feedbackByConversation;
}

async function updateBatch(
  grouped: Map<ModelId, ModelId[]>,
  execute: boolean
): Promise<number> {
  let updatedCount = 0;

  for (const [conversationId, feedbackIds] of grouped) {
    if (execute) {
      await AgentMessageFeedbackModel.update(
        { conversationId },
        { where: { id: { [Op.in]: feedbackIds } } }
      );
    }
    updatedCount += feedbackIds.length;
  }

  return updatedCount;
}

async function backfillWorkspace(
  workspace: LightWorkspaceType,
  {
    execute,
    logger,
  }: {
    execute: boolean;
    logger: Logger;
  }
) {
  const workspaceLogger = logger.child({ workspaceId: workspace.id });

  let lastFeedbackModelId: ModelId = 0;
  let updatedCount = 0;
  let hasMore = false;

  do {
    const feedbacks = await fetchFeedbacksBatch(workspace, lastFeedbackModelId);

    if (feedbacks.length === 0) {
      break;
    }

    const grouped = groupFeedbacksByConversation(feedbacks, workspaceLogger);
    updatedCount += await updateBatch(grouped, execute);

    lastFeedbackModelId = feedbacks[feedbacks.length - 1].id;
    hasMore = feedbacks.length === BATCH_SIZE;

    workspaceLogger.info(
      {
        lastModelId: lastFeedbackModelId,
        updatedCount,
        batchSize: feedbacks.length,
      },
      "Backfill progress."
    );
  } while (hasMore);

  workspaceLogger.info({ updatedCount }, "Backfill complete.");
}

makeScript(
  { workspaceId: { type: "string", required: false } },
  async ({ workspaceId, execute }, logger) => {
    if (workspaceId) {
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }
      await backfillWorkspace(renderLightWorkspaceType({ workspace }), {
        execute,
        logger,
      });
    } else {
      await runOnAllWorkspaces(async (workspace) => {
        await backfillWorkspace(workspace, { execute, logger });
      });
    }
  }
);

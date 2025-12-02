import { Op } from "sequelize";

import { Message, UserMessage } from "@app/lib/models/agent/conversation";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { UserMessageOrigin } from "@app/types";

const BATCH_SIZE = 1000;

export async function getRootContextOrigin(
  userMessage: UserMessage
): Promise<UserMessageOrigin | null> {
  const originAgentMessageId = userMessage.userContextOriginMessageId;
  if (originAgentMessageId) {
    const originAgentMessageRow = await Message.findOne({
      where: {
        sId: originAgentMessageId,
        workspaceId: userMessage.workspaceId,
      },
      attributes: ["parentId"],
    });
    if (originAgentMessageRow?.parentId) {
      const parentMessage = await Message.findOne({
        where: {
          id: originAgentMessageRow.parentId,
          workspaceId: userMessage.workspaceId,
        },
        include: [
          {
            model: UserMessage,
            as: "userMessage",
            required: true,
          },
        ],
      });
      if (parentMessage?.userMessage) {
        return getRootContextOrigin(parentMessage.userMessage);
      }
    }
  }

  return userMessage.userContextOrigin;
}

/**
 * Batched update of userContextOrigin, agenticOriginMessageId and agenticMessageType
 * for messages with origin "run_agent" or "agent_handover"
 */
async function updateAgenticFields(
  logger: Logger,
  execute: boolean,
  startFromId?: number
): Promise<void> {
  logger.info(
    "Starting batched update of userContextOrigin, agenticOriginMessageId and agenticMessageType"
  );

  let lastId = startFromId || 0;
  let totalUpdated = 0;
  let batchNum = 0;
  let hasMore = true;

  // Get total count for progress tracking
  const totalCount = await UserMessage.count({
    where: {
      userContextOrigin: {
        [Op.in]: ["run_agent", "agent_handover"],
      },
      id: {
        [Op.gt]: lastId,
      },
    },
  });
  logger.info(
    { totalCount, startFromId: lastId },
    "Found rows to process for agentic fields"
  );

  while (hasMore) {
    batchNum++;

    try {
      // Get batch of messages to update - need full objects to resolve root origin
      const batchMessages = await UserMessage.findAll({
        where: {
          userContextOrigin: {
            [Op.in]: ["run_agent", "agent_handover"],
          },
          id: {
            [Op.gt]: lastId,
          },
        },
        order: [["id", "ASC"]],
        limit: BATCH_SIZE,
      });

      if (batchMessages.length === 0) {
        hasMore = false;
        break;
      }

      const batchIds = batchMessages.map((msg) => msg.id);
      const maxId = Math.max(...batchIds);

      // Process each message to resolve root context origin
      for (const userMessage of batchMessages) {
        const rootContextOrigin = await getRootContextOrigin(userMessage);

        // Update all three fields: userContextOrigin, agenticOriginMessageId, and agenticMessageType
        // Store the original userContextOrigin before updating it
        const originalUserContextOrigin = userMessage.userContextOrigin;

        if (execute) {
          await userMessage.update(
            {
              userContextOrigin: rootContextOrigin,
              agenticOriginMessageId: userMessage.userContextOriginMessageId,
              agenticMessageType: originalUserContextOrigin as
                | "run_agent"
                | "agent_handover",
            },
            {
              hooks: false,
              silent: true,
            }
          );
        } else {
          logger.info(
            {
              userMessageId: userMessage.id,
              userContextOrigin: rootContextOrigin,
              agenticOriginMessageId: userMessage.userContextOriginMessageId,
              agenticMessageType: originalUserContextOrigin,
            },
            "[DRYRUN] Would update"
          );
        }

        totalUpdated += 1;
      }

      // Log progress every 10 batches
      if (batchNum % 10 === 0 || !hasMore) {
        const progress =
          totalCount > 0 ? Math.round((totalUpdated / totalCount) * 100) : 0;
        logger.info(
          {
            batchNum,
            batchSize: batchMessages.length,
            totalUpdated,
            progress: `${progress}%`,
            lastId: maxId,
          },
          execute
            ? "Batch processed for agentic fields"
            : "[DRYRUN] Would process batch"
        );
      }

      lastId = maxId;
      hasMore = batchMessages.length === BATCH_SIZE;

      // Small delay to avoid locking
      if (execute && hasMore) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } catch (error) {
      logger.error(
        {
          error,
          batchNum,
          lastId,
          totalUpdated,
        },
        "Error processing batch for agentic fields"
      );
      throw error;
    }
  }

  logger.info(
    {
      totalUpdated,
      totalBatches: batchNum,
      lastProcessedId: lastId,
    },
    execute
      ? "Completed: Updated userContextOrigin, agenticOriginMessageId and agenticMessageType"
      : "[DRYRUN] Would complete"
  );
}

makeScript(
  {
    startFromId: {
      type: "number",
      description:
        "Start from this ID (useful for resuming). The migration is batched.",
      required: false,
    },
  },
  async ({ execute, startFromId }, logger) => {
    await updateAgenticFields(logger, execute || false, startFromId);
  }
);

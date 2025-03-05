import type { LightWorkspaceType } from "@dust-tt/types";
import { Sequelize } from "sequelize";

import { Message } from "@app/lib/models/assistant/conversation";
import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

async function backfillConversationHasMessage(
  workspace: LightWorkspaceType,
  logger: Logger,
  execute: boolean
) {
  let offset = 0;
  const batchSize = 1000;
  let messages = [];
  do {
    messages = await Message.findAll({
      attributes: [
        [Sequelize.fn("MAX", Sequelize.col("version")), "maxVersion"],
        [Sequelize.fn("MAX", Sequelize.col("id")), "id"],
      ],
      where: {
        workspaceId: workspace.id,
      },
      group: ["conversationId", "rank"],
      order: [["id", "ASC"]],
      limit: batchSize,
      offset: offset,
    });

    const messageIds = messages.map((m) => m.id);
    if (execute && messageIds.length > 0) {
      await frontSequelize.query(
        `INSERT INTO conversation_has_messages ("conversationId", "messageId", "rank", "thread", "workspaceId", "createdAt", "updatedAt")
                SELECT 
                    "conversationId",
                    "id",
                    "rank",
                    0,
                    "workspaceId",
                    "createdAt",
                    "updatedAt"
                    FROM messages 
                WHERE "id" IN (:messageIds) ON CONFLICT DO NOTHING`,
        {
          replacements: {
            messageIds,
          },
        }
      );
    }

    offset += batchSize;
  } while (messages.length === batchSize);

  logger.info(
    `Done backfilling conversation_has_messages for workspace ${workspace.sId}`
  );
}

makeScript({ wId: { type: "string" } }, async ({ execute, wId }, logger) => {
  if (wId) {
    const workspace = await Workspace.findOne({
      where: {
        sId: wId,
      },
    });
    if (!workspace) {
      throw new Error(`Workspace ${wId} not found`);
    }
    await backfillConversationHasMessage(
      renderLightWorkspaceType({ workspace }),
      logger,
      execute
    );
  } else {
    return runOnAllWorkspaces(async (workspace) => {
      await backfillConversationHasMessage(workspace, logger, execute);
    });
  }
});

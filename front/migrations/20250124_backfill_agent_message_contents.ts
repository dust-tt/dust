import { Op } from "sequelize";

import { AgentMessageContent } from "@app/lib/models/assistant/agent_message_content";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";

async function backfillAgentMessageContent(
  workspace: LightWorkspaceType,
  { execute, logger }: { execute: boolean; logger: Logger }
) {
  let lastSeenId = 0;
  const batchSize = 1000;
  let totalProcessed = 0;

  logger.info({ workspaceId: workspace.sId }, "Starting table backfill");

  for (;;) {
    const records: AgentMessageContent[] = await AgentMessageContent.findAll({
      // @ts-expect-error workspaceId is not nullable in Model definition.
      where: {
        id: { [Op.gt]: lastSeenId },
        workspaceId: { [Op.is]: null },
      },
      order: [["id", "ASC"]],
      limit: batchSize,
      include: [
        {
          as: "agentMessage",
          model: AgentMessage,
          required: true,
          where: { workspaceId: workspace.id },
        },
      ],
    });

    if (records.length === 0) {
      break;
    }

    totalProcessed += records.length;
    logger.info(
      {
        workspaceId: workspace.sId,
        batchSize: records.length,
        totalProcessed,
        lastId: lastSeenId,
      },
      "Processing batch"
    );

    if (execute) {
      const recordIds = records.map((r) => r.id);
      await AgentMessageContent.update(
        { workspaceId: workspace.id },
        {
          where: {
            id: { [Op.in]: recordIds },
          },
          // Required to avoid hitting validation hook, which does not play nice with bulk updates.
          hooks: false,
          // Do not update `updatedAt.
          silent: true,
          fields: ["workspaceId"],
        }
      );
    }

    lastSeenId = records[records.length - 1].id;
  }

  return totalProcessed;
}

async function backfillTablesForWorkspace(
  workspace: LightWorkspaceType,
  { execute, logger }: { execute: boolean; logger: Logger }
) {
  logger.info(
    { workspaceId: workspace.sId, execute },
    "Starting workspace backfill"
  );

  const updated = await backfillAgentMessageContent(workspace, {
    execute,
    logger,
  });

  logger.info(
    { workspaceId: workspace.sId, updated },
    "Completed workspace backfill"
  );
}

makeScript({}, async ({ execute }, logger) => {
  return runOnAllWorkspaces(
    async (workspace) => {
      await backfillTablesForWorkspace(workspace, { execute, logger });
    },
    { concurrency: 10 }
  );
});

import type { Logger } from "pino";
import { Op } from "sequelize";

import { AgentMCPAction } from "@app/lib/models/assistant/actions/mcp";
import { makeScript } from "@app/scripts/helpers";

const BATCH_SIZE = 2048;

async function getNextBatch({
  lastId,
  targetStatus,
}: {
  lastId: number;
  targetStatus: "errored" | "denied";
}) {
  return AgentMCPAction.findAll({
    where:
      targetStatus === "errored"
        ? {
            id: { [Op.gt]: lastId },
            isError: true,
          }
        : {
            id: { [Op.gt]: lastId },
            executionState: "denied",
          },
    order: [["id", "ASC"]],
    limit: BATCH_SIZE,
  });
}

async function backfillActions(
  {
    targetStatus,
    execute,
  }: { targetStatus: "errored" | "denied"; execute: boolean },
  logger: Logger
) {
  let lastId = 0;
  let hasMore = true;
  do {
    const mcpActions = await getNextBatch({ lastId, targetStatus });
    logger.info(
      `Processing ${mcpActions.length} ${targetStatus} actions starting from ${lastId}`
    );

    if (execute) {
      await AgentMCPAction.update(
        { status: targetStatus },
        {
          where: {
            id: {
              [Op.in]: mcpActions.map((a) => a.id),
            },
          },
        }
      );
      logger.info(`Updated ${mcpActions.length} actions`);
    } else {
      logger.info(`Would update ${mcpActions.length} actions`);
    }

    lastId = mcpActions[mcpActions.length - 1].id;
    hasMore = mcpActions.length === BATCH_SIZE;
  } while (hasMore);
}

makeScript({}, async ({ execute }, logger) => {
  logger.info("Starting backfill of errored actions");
  await backfillActions({ targetStatus: "errored", execute }, logger);
  logger.info("Completed backfill of errored actions");

  logger.info("Completed backfill of denied actions");
  await backfillActions({ targetStatus: "denied", execute }, logger);
  logger.info("Completed backfill of denied actions");
});

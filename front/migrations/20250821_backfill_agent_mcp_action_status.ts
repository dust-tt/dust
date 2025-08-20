import type { Logger } from "pino";
import { Op } from "sequelize";

import { AgentMCPAction } from "@app/lib/models/assistant/actions/mcp";
import { makeScript } from "@app/scripts/helpers";

const BATCH_SIZE = 2048;

async function backfillErroredActions(
  { execute }: { execute: boolean },
  logger: Logger
) {
  let lastId = 0;
  let hasMore = true;
  do {
    // Get a batch of actions that are errored.
    const mcpActions = await AgentMCPAction.findAll({
      where: {
        id: {
          [Op.gt]: lastId,
        },
        isError: true,
      },
      order: [["id", "ASC"]],
      limit: BATCH_SIZE,
    });
    logger.info(
      `Processing ${mcpActions.length} errored actions starting from ${lastId}`
    );

    // Update the status accordingly.
    if (execute) {
      await AgentMCPAction.update(
        { status: "errored" },
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

async function backfillDeniedActions(
  { execute }: { execute: boolean },
  logger: Logger
) {
  let lastId = 0;
  let hasMore = true;
  do {
    // Get a batch of actions that are errored.
    const mcpActions = await AgentMCPAction.findAll({
      where: {
        id: {
          [Op.gt]: lastId,
        },
        executionState: "denied",
      },
      order: [["id", "ASC"]],
      limit: BATCH_SIZE,
    });
    logger.info(
      `Processing ${mcpActions.length} denied actions starting from ${lastId}`
    );

    // Update the status accordingly.
    if (execute) {
      await AgentMCPAction.update(
        { status: "denied" },
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
  logger.info("Starting backfill");

  await backfillErroredActions({ execute }, logger);

  await backfillDeniedActions({ execute }, logger);

  logger.info("Completed backfill");
});

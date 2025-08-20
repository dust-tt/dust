import { Op } from "sequelize";

import { AgentMCPAction } from "@app/lib/models/assistant/actions/mcp";
import { makeScript } from "@app/scripts/helpers";

const BATCH_SIZE = 2048;

makeScript({}, async ({ execute }, logger) => {
  logger.info("Starting backfill");

  let lastId = 0;
  let hasMore = true;
  do {
    // Get a batch of actions that are errored.
    const mcpActions = await AgentMCPAction.findAll({
      where: {
        id: {
          [Op.gt]: lastId,
        },
        isError: {
          [Op.is]: true,
        },
      },
      order: [["id", "ASC"]],
      limit: BATCH_SIZE,
    });
    logger.info(
      `Processing ${mcpActions.length} actions starting from ${lastId}`
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

  logger.info("Completed backfill");
});

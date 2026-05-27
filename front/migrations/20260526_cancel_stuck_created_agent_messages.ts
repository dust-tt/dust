import { Op } from "sequelize";

import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { makeScript } from "@app/scripts/helpers";

const BATCH_SIZE = 1000;
const CUTOFF_DAYS = 7;

makeScript({}, async ({ execute }, logger) => {
  const cutoff = new Date(Date.now() - CUTOFF_DAYS * 24 * 60 * 60 * 1000);
  let totalUpdated = 0;
  let lastId = 0;

  logger.info(
    { cutoff: cutoff.toISOString(), execute },
    execute
      ? "Starting cleanup of stuck created agent messages"
      : "Dry run: would clean up stuck created agent messages"
  );

  let batchRows: AgentMessageModel[] = [];

  do {
    batchRows = await AgentMessageModel.findAll({
      where: {
        status: "created",
        createdAt: { [Op.lt]: cutoff },
        id: { [Op.gt]: lastId },
      },
      attributes: ["id"],
      limit: BATCH_SIZE,
      order: [["id", "ASC"]],
    });

    if (batchRows.length === 0) {
      break;
    }

    const ids = batchRows.map((message) => message.id);

    if (execute) {
      const [updatedCount] = await AgentMessageModel.update(
        { status: "cancelled", completedAt: new Date() },
        {
          where: {
            id: { [Op.in]: ids },
            status: "created",
          },
        }
      );
      totalUpdated += updatedCount;

      logger.info(
        { updated: updatedCount, totalUpdated },
        "Cleaned up stuck agent messages"
      );
    } else {
      totalUpdated += batchRows.length;

      logger.info(
        { wouldUpdate: batchRows.length, totalUpdated },
        "Would clean up stuck agent messages"
      );
    }

    lastId = batchRows[batchRows.length - 1].id;
  } while (batchRows.length === BATCH_SIZE);

  logger.info(
    { totalUpdated, execute },
    execute ? "Migration completed." : "Dry run completed."
  );
});

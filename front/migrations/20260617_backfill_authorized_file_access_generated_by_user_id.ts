import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { AuthorizedFileAccessModel } from "@app/lib/resources/storage/models/files";
import { makeScript } from "@app/scripts/helpers";

const BATCH_SIZE = 500;

type BackfillRow = {
  id: number;
  computedByUserId: string;
};

/**
 * Backfills generatedByUserId from legacy computedByUserId user sIds.
 * Run after deploying the FK column migration and double-write code.
 */
makeScript({}, async ({ execute }, logger) => {
  let lastId = 0;
  let backfilledCount = 0;
  let unresolvedCount = 0;

  for (;;) {
    const rows = await frontSequelize.query<BackfillRow>(
      `
        SELECT afa."id", afa."computedByUserId"
        FROM "authorized_file_accesses" afa
        WHERE afa."generatedByUserId" IS NULL
          AND afa."id" > :lastId
        ORDER BY afa."id" ASC
        LIMIT :batchSize
      `,
      {
        replacements: { lastId, batchSize: BATCH_SIZE },
        type: QueryTypes.SELECT,
      }
    );

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      lastId = row.id;

      const [user] = await frontSequelize.query<{ id: number }>(
        `SELECT "id" FROM "users" WHERE "sId" = :sId LIMIT 1`,
        {
          replacements: { sId: row.computedByUserId },
          type: QueryTypes.SELECT,
        }
      );

      if (!user) {
        unresolvedCount += 1;
        logger.warn(
          { rowId: row.id, computedByUserId: row.computedByUserId },
          "Could not resolve user for authorized file access row"
        );
        continue;
      }

      if (execute) {
        await AuthorizedFileAccessModel.update(
          { generatedByUserId: user.id },
          { where: { id: row.id } }
        );
      }

      backfilledCount += 1;
    }

    logger.info(
      { backfilledCount, unresolvedCount, lastId },
      execute ? "Backfill progress" : "Dry run progress"
    );
  }

  logger.info(
    { backfilledCount, unresolvedCount, execute },
    execute
      ? "Completed authorized file access generatedByUserId backfill"
      : "Dry run completed for authorized file access generatedByUserId backfill"
  );
});

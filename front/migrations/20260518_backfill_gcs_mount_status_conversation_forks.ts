import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";
import { QueryTypes } from "sequelize";

makeScript({}, async ({ execute }, logger) => {
  const [{ count: pendingCountStr }] = await frontSequelize.query<{
    count: string;
  }>(
    `SELECT COUNT(*) AS count FROM "conversation_forks" WHERE "gcsMountStatus" = 'pending'`,
    { type: QueryTypes.SELECT }
  );
  const pendingCount = parseInt(pendingCountStr);

  logger.info(
    { pendingCount, execute },
    execute
      ? `Backfilling ${pendingCount} rows to 'copied'`
      : `Would backfill ${pendingCount} rows (dry run)`
  );

  if (!execute) {
    return;
  }

  await frontSequelize.query(
    `UPDATE "conversation_forks" SET "gcsMountStatus" = 'copied' WHERE "gcsMountStatus" = 'pending'`
  );

  logger.info({}, "Done");
});

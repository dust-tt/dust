import readline from "readline";
import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";

const BATCH_SIZE = 1000;

const DISCLAIMER = `
================================================================================
⚠️  WARNING: THIS SCRIPT AFFECTS WORKSPACE BILLING

    Setting 'firstUsedAt' on memberships will change the count of active
    members for workspaces, which directly impacts billing calculations.

    - Members with firstUsedAt set are counted as active seats
    - This backfill uses membership's startAt as the firstUsedAt value
    - All affected workspaces may see changes in their billed seat count

    MAKE SURE YOU UNDERSTAND THE BILLING IMPLICATIONS BEFORE PROCEEDING.
================================================================================
`;

async function confirmExecution(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`\n⚠️  ${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}

makeScript({}, async ({ execute }, logger) => {
  logger.info(DISCLAIMER);

  if (execute) {
    const confirmed = await confirmExecution(
      "This will backfill firstUsedAt for all memberships and may affect billing. Continue?"
    );
    if (!confirmed) {
      logger.info("Aborted by user.");
      return;
    }
  }

  let processedCount = 0;
  let lastId = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = await frontSequelize.query<{
      membershipId: number;
    }>(
      `SELECT m.id as "membershipId"
       FROM memberships m
       JOIN users u ON m."userId" = u.id
       WHERE m.id > :lastId
         AND m."firstUsedAt" IS NULL
         AND m."startAt" IS NOT NULL
         AND u."lastLoginAt" IS NOT NULL
       ORDER BY m.id ASC
       LIMIT :batchSize`,
      {
        replacements: { lastId, batchSize: BATCH_SIZE },
        type: QueryTypes.SELECT,
      }
    );

    if (batch.length === 0) {
      break;
    }

    logger.info(
      { batchSize: batch.length, processedCount },
      "Processing batch"
    );

    if (execute) {
      const membershipIds = batch.map((row) => row.membershipId);

      await frontSequelize.query(
        `UPDATE memberships m
         SET "firstUsedAt" = "startAt"
         FROM (
           SELECT UNNEST(ARRAY[:membershipIds]::bigint[]) AS id
         ) ids
         WHERE m.id = ids.id`,
        {
          replacements: { membershipIds },
          type: QueryTypes.UPDATE,
        }
      );
    }

    processedCount += batch.length;
    lastId = batch[batch.length - 1].membershipId;
  }

  logger.info({ totalProcessed: processedCount }, "Backfill completed");
});

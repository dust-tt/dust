import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";

const BATCH_SIZE = 1000;

makeScript({}, async ({ execute }, logger) => {
  // Count total records
  const [countResult] = await frontSequelize.query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM conversation_participants cp
     JOIN conversations c ON cp."conversationId" = c.id
     WHERE cp.unread = false 
       AND (cp."lastReadAt" IS NULL OR cp."lastReadAt" < c."updatedAt")`,
    { type: QueryTypes.SELECT }
  );

  const totalCount = parseInt(countResult.count);

  logger.info(
    { totalCount, execute },
    execute
      ? `Found ${totalCount} participants to update`
      : `Would update ${totalCount} participants (dry run)`
  );

  if (totalCount === 0) {
    logger.info("No participants to update");
    return;
  }

  let processedCount = 0;
  let batchNumber = 0;
  let lastId = 0;
  let batchIds: number[] = [];

  do {
    batchNumber++;

    // Select IDs for the next batch
    const idResults = await frontSequelize.query<{ id: number }>(
      `SELECT cp.id
       FROM conversation_participants cp
       JOIN conversations c ON cp."conversationId" = c.id
       WHERE cp.id > :lastId
         AND cp.unread = false
         AND (cp."lastReadAt" IS NULL OR cp."lastReadAt" < c."updatedAt")
       ORDER BY cp.id ASC
       LIMIT :batchSize`,
      {
        replacements: { lastId, batchSize: BATCH_SIZE },
        type: QueryTypes.SELECT,
      }
    );

    batchIds = idResults.map((row) => row.id);

    if (batchIds.length === 0) {
      break;
    }

    logger.info(
      {
        batchNumber,
        batchSize: batchIds.length,
        firstId: batchIds[0],
        lastId: batchIds[batchIds.length - 1],
        processedCount,
        totalCount,
        progress: `${Math.round((processedCount / totalCount) * 100)}%`,
      },
      execute
        ? `Processing batch ${batchNumber}`
        : `Would process batch ${batchNumber} (dry run)`
    );

    if (execute) {
      // Update the batch
      await frontSequelize.query(
        `UPDATE conversation_participants
         SET "lastReadAt" = NOW()
         WHERE id IN (:ids)`,
        {
          replacements: { ids: batchIds },
          type: QueryTypes.UPDATE,
        }
      );

      logger.info(
        { batchNumber, updated: batchIds.length },
        `Updated batch ${batchNumber}`
      );
    }

    processedCount += batchIds.length;
    lastId = batchIds[batchIds.length - 1];
  } while (batchIds.length === BATCH_SIZE);

  logger.info(
    { totalProcessed: processedCount, totalCount, execute },
    execute
      ? `Migration completed: updated ${processedCount} participants`
      : `Dry run completed: would have updated ${totalCount} participants`
  );
});

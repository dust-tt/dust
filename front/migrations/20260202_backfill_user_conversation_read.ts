import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";

const BATCH_SIZE = 1000;

makeScript({}, async ({ execute }, logger) => {
  // Count total records: participants with lastReadAt NOT NULL and no entry in reads table
  const [countResult] = await frontSequelize.query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM conversation_participants cp
     WHERE cp."lastReadAt" IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM user_conversation_reads ucr
         WHERE ucr."workspaceId" = cp."workspaceId"
           AND ucr."userId" = cp."userId"
           AND ucr."conversationId" = cp."conversationId"
       )`,
    { type: QueryTypes.SELECT }
  );

  const totalCount = parseInt(countResult.count);

  logger.info(
    { totalCount, execute },
    execute
      ? `Found ${totalCount} participants to backfill`
      : `Would backfill ${totalCount} participants (dry run)`
  );

  if (totalCount === 0) {
    logger.info("No participants to backfill");
    return;
  }

  let processedCount = 0;
  let batchNumber = 0;
  let lastId = 0;
  let batchRows: Array<{
    workspaceId: number;
    userId: number;
    conversationId: number;
    lastReadAt: Date;
  }> = [];

  do {
    batchNumber++;

    // Select participants for the next batch
    const rowResults = await frontSequelize.query<{
      id: number;
      workspaceId: number;
      userId: number;
      conversationId: number;
      lastReadAt: Date;
    }>(
      `SELECT cp.id, cp."workspaceId", cp."userId", cp."conversationId", cp."lastReadAt"
       FROM conversation_participants cp
       WHERE cp.id > :lastId
         AND cp."lastReadAt" IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM user_conversation_reads ucr
           WHERE ucr."workspaceId" = cp."workspaceId"
             AND ucr."userId" = cp."userId"
             AND ucr."conversationId" = cp."conversationId"
         )
       ORDER BY cp.id ASC
       LIMIT :batchSize`,
      {
        replacements: { lastId, batchSize: BATCH_SIZE },
        type: QueryTypes.SELECT,
      }
    );

    batchRows = rowResults.map((row) => ({
      workspaceId: row.workspaceId,
      userId: row.userId,
      conversationId: row.conversationId,
      lastReadAt: row.lastReadAt,
    }));

    if (batchRows.length === 0) {
      break;
    }

    logger.info(
      {
        batchNumber,
        batchSize: batchRows.length,
        firstId: rowResults[0].id,
        lastId: rowResults[rowResults.length - 1].id,
        processedCount,
        totalCount,
        progress: `${Math.round((processedCount / totalCount) * 100)}%`,
      },
      execute
        ? `Processing batch ${batchNumber}`
        : `Would process batch ${batchNumber} (dry run)`
    );

    if (execute) {
      // Batch insert with ON CONFLICT DO NOTHING to handle concurrency
      const values = batchRows
        .map(
          (row) =>
            `(${row.workspaceId}, ${row.userId}, ${row.conversationId}, '${row.lastReadAt.toISOString()}', NOW(), NOW())`
        )
        .join(", ");

      await frontSequelize.query(
        `INSERT INTO user_conversation_reads 
         ("workspaceId", "userId", "conversationId", "lastReadAt", "createdAt", "updatedAt")
         VALUES ${values}
         ON CONFLICT ("workspaceId", "userId", "conversationId") DO NOTHING`,
        {
          type: QueryTypes.INSERT,
        }
      );

      logger.info(
        { batchNumber, inserted: batchRows.length },
        `Backfilled batch ${batchNumber}`
      );
    }

    processedCount += batchRows.length;
    lastId = rowResults[rowResults.length - 1].id;
  } while (batchRows.length === BATCH_SIZE);

  logger.info(
    { totalProcessed: processedCount, totalCount, execute },
    execute
      ? `Migration completed: backfilled ${processedCount} read records`
      : `Dry run completed: would have backfilled ${totalCount} read records`
  );
});

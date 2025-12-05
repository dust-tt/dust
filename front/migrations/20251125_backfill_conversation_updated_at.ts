import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";
import type { Logger } from "@app/logger/logger";

interface ConversationWithBogusUpdatedAt {
  id: number;
  sId: string;
  workspaceId: number;
  conversation_updated_at: Date;
  max_message_created_at: Date;
  time_difference: number;
}

const BATCH_SIZE = 128;

makeScript({}, async ({ execute }, logger) => {
  // Fetch all conversations with bogus updatedAt field
  // eslint-disable-next-line dust/no-raw-sql
  const conversations =
    await frontSequelize.query<ConversationWithBogusUpdatedAt>(
      `
    SELECT 
      c.id,
      c."sId",
      c."workspaceId",
      c."updatedAt" as conversation_updated_at,
      max_message_created_at,
      (max_message_created_at - c."updatedAt") as time_difference
    FROM conversations c
    INNER JOIN (
      SELECT 
        m."conversationId",
        MAX(m."createdAt") as max_message_created_at
      FROM messages m
      GROUP BY m."conversationId"
    ) message_max ON c.id = message_max."conversationId"
    WHERE c."updatedAt" < message_max.max_message_created_at
    ORDER BY time_difference DESC
    `,
      { type: QueryTypes.SELECT }
    );

  logger.info(
    { count: conversations.length, execute },
    execute
      ? `Found ${conversations.length} conversations with bogus updatedAt field`
      : `Found ${conversations.length} conversations with bogus updatedAt field (dry run)`
  );

  if (conversations.length === 0) {
    logger.info("No conversations with bogus updatedAt found. Nothing to do.");
    return;
  }

  // Process conversations in batches of 128, updating each batch with a single SQL query
  let totalUpdated = 0;
  for (let i = 0; i < conversations.length; i += BATCH_SIZE) {
    const batch = conversations.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(conversations.length / BATCH_SIZE);

    logger.info(
      {
        batchNumber,
        totalBatches,
        batchSize: batch.length,
        totalProcessed: i,
        totalRemaining: conversations.length - i,
      },
      `Processing batch ${batchNumber}/${totalBatches}`
    );

    if (execute) {
      // Build arrays for batch update using unnest
      const conversationIds = batch.map((conv) => conv.id);
      const updatedAtTimestamps = batch.map((conv) =>
        conv.max_message_created_at.toISOString()
      );

      // eslint-disable-next-line dust/no-raw-sql
      await frontSequelize.query(
        `
        UPDATE conversations c
        SET "updatedAt" = updates.new_updated_at::timestamp
        FROM (
          SELECT 
            unnest(ARRAY[:conversationIds]::bigint[]) as id,
            unnest(ARRAY[:updatedAtTimestamps]::text[]) as new_updated_at
        ) AS updates
        WHERE c.id = updates.id
        `,
        {
          replacements: {
            conversationIds,
            updatedAtTimestamps,
          },
          type: QueryTypes.UPDATE,
        }
      );

      totalUpdated += batch.length;

      logger.info(
        {
          batchNumber,
          batchSize: batch.length,
          totalUpdated,
        },
        `Updated batch ${batchNumber}/${totalBatches}`
      );
    } else {
      logger.info(
        {
          batchNumber,
          batchSize: batch.length,
          conversationIds: batch.map((c) => c.sId),
        },
        `Would update batch ${batchNumber}/${totalBatches} (dry run)`
      );
      totalUpdated += batch.length;
    }
  }

  logger.info(
    { totalProcessed: conversations.length, totalUpdated, execute },
    execute
      ? `Migration completed: updated ${totalUpdated} conversations`
      : `Dry run completed: would have updated ${totalUpdated} conversations`
  );
});

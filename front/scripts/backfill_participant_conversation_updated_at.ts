import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";
import { QueryTypes } from "sequelize";

// Backfill conversation_participants.conversationUpdatedAt from conversations.updatedAt.
//
// Rows written after the mirror-stamp code is deployed already carry the value; the IS NULL
// guard makes the script idempotent and guarantees we never overwrite a fresher live stamp.
// Must complete before the read path switches to ordering on conversationUpdatedAt.
makeScript(
  {
    batchSize: {
      type: "number",
      default: 10000,
      describe: "Id range scanned per batch on conversation_participants",
    },
  },
  async ({ execute, batchSize }, logger) => {
    // biome-ignore lint/plugin/noRawSql: batched set-based backfill joining conversations
    const [row] = await frontSequelize.query<{ maxId: string | null }>(
      'SELECT MAX(id)::bigint AS "maxId" FROM conversation_participants',
      { type: QueryTypes.SELECT }
    );
    const maxId = row?.maxId ? Number(row.maxId) : 0;

    let total = 0;
    for (let cursor = 0; cursor < maxId; cursor += batchSize) {
      const upper = cursor + batchSize;

      if (execute) {
        // biome-ignore lint/plugin/noRawSql: batched set-based backfill joining conversations
        const updated = await frontSequelize.query(
          `UPDATE conversation_participants p
           SET "conversationUpdatedAt" = c."updatedAt"
           FROM conversations c
           WHERE c.id = p."conversationId"
             AND p.id > :cursor AND p.id <= :upper
             AND p."conversationUpdatedAt" IS NULL`,
          {
            replacements: { cursor, upper },
            type: QueryTypes.BULKUPDATE,
          }
        );
        total += updated;
      } else {
        // biome-ignore lint/plugin/noRawSql: batched set-based backfill joining conversations
        const [count] = await frontSequelize.query<{ count: string }>(
          `SELECT COUNT(*) AS count
           FROM conversation_participants p
           WHERE p.id > :cursor AND p.id <= :upper
             AND p."conversationUpdatedAt" IS NULL`,
          { replacements: { cursor, upper }, type: QueryTypes.SELECT }
        );
        total += Number(count?.count ?? 0);
      }

      logger.info(
        { cursor: upper, maxId, total },
        execute ? "Backfilled batch." : "Would backfill batch (dry run)."
      );
    }

    logger.info({ total, maxId }, "Backfill complete.");
  }
);

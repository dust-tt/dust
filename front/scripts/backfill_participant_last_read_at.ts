import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";
import { QueryTypes } from "sequelize";

// Backfill conversation_participants.lastReadAt from user_conversation_reads.
//
// Phase 1 copies lastReadAt onto existing participant rows (IS NULL guard: rows already
// dual-written since deploy are skipped, so the script is idempotent and never overwrites a
// fresher live value).
// Phase 2 inserts "viewed" participant rows for read rows that have no participation (users who
// only opened shared/space conversations). ON CONFLICT DO NOTHING covers rows created by the
// live dual-write while the script runs.
// Must complete before the read path switches to conversation_participants.lastReadAt.
async function maxIdOf(table: string): Promise<number> {
  // biome-ignore lint/plugin/noRawSql: batched set-based backfill
  const [row] = await frontSequelize.query<{ maxId: string | null }>(
    `SELECT MAX(id)::bigint AS "maxId" FROM ${table}`,
    { type: QueryTypes.SELECT }
  );
  return row?.maxId ? Number(row.maxId) : 0;
}

makeScript(
  {
    batchSize: {
      type: "number",
      default: 10000,
      describe: "Id range scanned per batch",
    },
  },
  async ({ execute, batchSize }, logger) => {
    // Phase 1: copy read state onto existing participant rows.
    const maxParticipantId = await maxIdOf("conversation_participants");

    let updatedTotal = 0;
    for (let cursor = 0; cursor < maxParticipantId; cursor += batchSize) {
      const upper = cursor + batchSize;

      if (execute) {
        // biome-ignore lint/plugin/noRawSql: batched set-based backfill joining user_conversation_reads
        const updated = await frontSequelize.query(
          `UPDATE conversation_participants p
           SET "lastReadAt" = r."lastReadAt"
           FROM user_conversation_reads r
           WHERE r."workspaceId" = p."workspaceId"
             AND r."userId" = p."userId"
             AND r."conversationId" = p."conversationId"
             AND p.id > :cursor AND p.id <= :upper
             AND p."lastReadAt" IS NULL`,
          {
            replacements: { cursor, upper },
            type: QueryTypes.BULKUPDATE,
          }
        );
        updatedTotal += updated;
      } else {
        // biome-ignore lint/plugin/noRawSql: batched set-based backfill joining user_conversation_reads
        const [count] = await frontSequelize.query<{ count: string }>(
          `SELECT COUNT(*) AS count
           FROM conversation_participants p
           JOIN user_conversation_reads r
             ON r."workspaceId" = p."workspaceId"
            AND r."userId" = p."userId"
            AND r."conversationId" = p."conversationId"
           WHERE p.id > :cursor AND p.id <= :upper
             AND p."lastReadAt" IS NULL`,
          { replacements: { cursor, upper }, type: QueryTypes.SELECT }
        );
        updatedTotal += Number(count?.count ?? 0);
      }

      logger.info(
        { phase: 1, cursor: upper, maxId: maxParticipantId, updatedTotal },
        execute ? "Backfilled batch." : "Would backfill batch (dry run)."
      );
    }

    // Phase 2: create "viewed" participant rows for read rows without a participation.
    const maxReadId = await maxIdOf("user_conversation_reads");

    let insertedTotal = 0;
    for (let cursor = 0; cursor < maxReadId; cursor += batchSize) {
      const upper = cursor + batchSize;

      if (execute) {
        // biome-ignore lint/plugin/noRawSql: batched set-based backfill inserting viewed rows
        const [, inserted] = await frontSequelize.query(
          `INSERT INTO conversation_participants
             ("createdAt", "updatedAt", "workspaceId", "conversationId", "userId",
              "action", "actionRequired", "lastReadAt")
           SELECT r."createdAt", r."updatedAt", r."workspaceId", r."conversationId", r."userId",
                  'viewed', false, r."lastReadAt"
           FROM user_conversation_reads r
           LEFT JOIN conversation_participants p
             ON p."workspaceId" = r."workspaceId"
            AND p."userId" = r."userId"
            AND p."conversationId" = r."conversationId"
           WHERE r.id > :cursor AND r.id <= :upper
             AND p.id IS NULL
           ON CONFLICT ("workspaceId", "userId", "conversationId") DO NOTHING`,
          {
            replacements: { cursor, upper },
            type: QueryTypes.INSERT,
          }
        );
        insertedTotal += typeof inserted === "number" ? inserted : 0;
      } else {
        // biome-ignore lint/plugin/noRawSql: batched set-based backfill inserting viewed rows
        const [count] = await frontSequelize.query<{ count: string }>(
          `SELECT COUNT(*) AS count
           FROM user_conversation_reads r
           LEFT JOIN conversation_participants p
             ON p."workspaceId" = r."workspaceId"
            AND p."userId" = r."userId"
            AND p."conversationId" = r."conversationId"
           WHERE r.id > :cursor AND r.id <= :upper
             AND p.id IS NULL`,
          { replacements: { cursor, upper }, type: QueryTypes.SELECT }
        );
        insertedTotal += Number(count?.count ?? 0);
      }

      logger.info(
        { phase: 2, cursor: upper, maxId: maxReadId, insertedTotal },
        execute ? "Inserted batch." : "Would insert batch (dry run)."
      );
    }

    logger.info({ updatedTotal, insertedTotal }, "Backfill complete.");
  }
);

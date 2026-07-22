import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const DEFAULT_BATCH_SIZE = 1_000;
const DEFAULT_BATCH_DELAY_MS = 100;

// Each side table is joined back to messages through its dedicated FK column. Rows not referenced
// by any message (orphans, project-context content fragments) are left NULL on purpose.
const SIDE_TABLES = [
  { table: "user_messages", messageFkColumn: "userMessageId" },
  { table: "agent_messages", messageFkColumn: "agentMessageId" },
  { table: "content_fragments", messageFkColumn: "contentFragmentId" },
  { table: "compaction_messages", messageFkColumn: "compactionMessageId" },
] as const;

type SideTable = (typeof SIDE_TABLES)[number];

function makeUpdateBatchSql({ table, messageFkColumn }: SideTable): string {
  return `
    UPDATE ${table} AS side_row
    SET "conversationId" = message."conversationId"
    FROM messages AS message
    WHERE side_row.id IN (:ids)
      AND message."${messageFkColumn}" = side_row.id
      AND message."workspaceId" = side_row."workspaceId"
      AND side_row."conversationId" IS NULL
  `;
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function backfillTable(
  sideTable: SideTable,
  {
    batchSize,
    batchDelayMs,
    logger,
  }: {
    batchSize: number;
    batchDelayMs: number;
    logger: Logger;
  }
): Promise<void> {
  const { table } = sideTable;
  const updateBatchSql = makeUpdateBatchSql(sideTable);

  let batch = 0;
  let lastId = 0;
  let totalUpdated = 0;

  for (;;) {
    // Keyset pagination prevents each batch from rescanning rows already processed.
    const rows = await frontSequelize.query<{ id: number }>(
      `
        SELECT side_row.id
        FROM ${table} AS side_row
        WHERE side_row.id > :lastId
          AND side_row."conversationId" IS NULL
        ORDER BY side_row.id ASC
        LIMIT :batchSize
      `,
      {
        replacements: { lastId, batchSize },
        type: QueryTypes.SELECT,
      }
    );

    if (rows.length === 0) {
      break;
    }

    lastId = rows[rows.length - 1].id;
    // Keep each batch in its own autocommit transaction so row locks are released
    // before the pause. Raw SQL also leaves the row's updatedAt untouched.
    const [, updated] = await frontSequelize.query(updateBatchSql, {
      replacements: { ids: rows.map(({ id }) => id) },
      type: QueryTypes.UPDATE,
    });

    batch += 1;
    totalUpdated += updated;
    logger.info(
      { table, batch, batchSize: rows.length, lastId, updated, totalUpdated },
      "Backfilled side table conversationId batch"
    );

    if (batchDelayMs > 0) {
      await wait(batchDelayMs);
    }
  }

  // The backfill churns most of the table; refresh stats right away instead of waiting for
  // autovacuum so the read path plans against accurate (workspaceId, conversationId) estimates.
  await frontSequelize.query(`ANALYZE ${table}`);

  logger.info(
    { table, batches: batch, lastId, totalUpdated },
    "Completed side table conversationId backfill"
  );
}

makeScript(
  {
    batchSize: {
      type: "number",
      default: DEFAULT_BATCH_SIZE,
      describe: "Maximum number of side table rows updated per transaction",
    },
    batchDelayMs: {
      type: "number",
      default: DEFAULT_BATCH_DELAY_MS,
      describe: "Delay between update batches in milliseconds",
    },
    table: {
      type: "string",
      describe: "Restrict the backfill to a single side table",
      choices: SIDE_TABLES.map(({ table }) => table),
    },
  },
  async ({ execute, batchSize, batchDelayMs, table }, logger) => {
    if (!Number.isInteger(batchSize) || batchSize <= 0) {
      throw new Error("batchSize must be a positive integer");
    }
    if (!Number.isInteger(batchDelayMs) || batchDelayMs < 0) {
      throw new Error("batchDelayMs must be a non-negative integer");
    }

    const sideTables = SIDE_TABLES.filter(
      (sideTable) => !table || sideTable.table === table
    );

    if (!execute) {
      for (const { table: sideTableName, messageFkColumn } of sideTables) {
        const [{ count }] = await frontSequelize.query<{ count: string }>(
          `
            SELECT COUNT(*) AS count
            FROM ${sideTableName} AS side_row
            INNER JOIN messages AS message
              ON message."${messageFkColumn}" = side_row.id
             AND message."workspaceId" = side_row."workspaceId"
            WHERE side_row."conversationId" IS NULL
          `,
          { type: QueryTypes.SELECT }
        );

        logger.info(
          {
            table: sideTableName,
            wouldUpdateCount: Number(count),
            batchSize,
            batchDelayMs,
          },
          "Dry run: would backfill side table conversationId"
        );
      }
      return;
    }

    for (const sideTable of sideTables) {
      await backfillTable(sideTable, { batchSize, batchDelayMs, logger });
    }
  }
);

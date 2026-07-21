import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";

const DEFAULT_BATCH_SIZE = 1_000;
const DEFAULT_BATCH_DELAY_MS = 100;

const UPDATE_BATCH_SQL = `
  UPDATE group_vaults AS group_vault
  SET "groupKind" = group_row.kind
  FROM groups AS group_row
  WHERE group_vault.id IN (:ids)
    AND group_vault."groupId" = group_row.id
    AND group_vault."workspaceId" = group_row."workspaceId"
    AND group_vault."groupKind" IS NULL
`;

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

makeScript(
  {
    batchSize: {
      type: "number",
      default: DEFAULT_BATCH_SIZE,
      describe: "Maximum number of group vaults updated per transaction",
    },
    batchDelayMs: {
      type: "number",
      default: DEFAULT_BATCH_DELAY_MS,
      describe: "Delay between update batches in milliseconds",
    },
  },
  async ({ execute, batchSize, batchDelayMs }, logger) => {
    if (!Number.isInteger(batchSize) || batchSize <= 0) {
      throw new Error("batchSize must be a positive integer");
    }
    if (!Number.isInteger(batchDelayMs) || batchDelayMs < 0) {
      throw new Error("batchDelayMs must be a non-negative integer");
    }

    if (!execute) {
      const [{ count }] = await frontSequelize.query<{ count: string }>(
        `
          SELECT COUNT(*) AS count
          FROM group_vaults AS group_vault
          INNER JOIN groups AS group_row
            ON group_vault."groupId" = group_row.id
           AND group_vault."workspaceId" = group_row."workspaceId"
          WHERE group_vault."groupKind" IS NULL
        `,
        { type: QueryTypes.SELECT }
      );

      logger.info(
        { wouldUpdateCount: Number(count), batchSize, batchDelayMs },
        "Dry run: would backfill group_vaults.groupKind"
      );
      return;
    }

    let batch = 0;
    let lastId = 0;
    let totalUpdated = 0;

    for (;;) {
      // Keyset pagination prevents each batch from rescanning rows already processed.
      const rows = await frontSequelize.query<{ id: number }>(
        `
          SELECT group_vault.id
          FROM group_vaults AS group_vault
          INNER JOIN groups AS group_row
            ON group_vault."groupId" = group_row.id
           AND group_vault."workspaceId" = group_row."workspaceId"
          WHERE group_vault.id > :lastId
            AND group_vault."groupKind" IS NULL
          ORDER BY group_vault.id ASC
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
      // before the pause. Raw SQL also leaves the relationship's updatedAt untouched.
      const [, updated] = await frontSequelize.query(UPDATE_BATCH_SQL, {
        replacements: { ids: rows.map(({ id }) => id) },
        type: QueryTypes.UPDATE,
      });

      batch += 1;
      totalUpdated += updated;
      logger.info(
        { batch, batchSize: rows.length, lastId, updated, totalUpdated },
        "Backfilled group vault group-kind batch"
      );

      if (batchDelayMs > 0) {
        await wait(batchDelayMs);
      }
    }

    logger.info(
      { batches: batch, lastId, totalUpdated },
      "Completed group_vaults.groupKind backfill"
    );
  }
);

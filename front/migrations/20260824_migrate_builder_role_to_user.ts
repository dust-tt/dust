import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";

const DEFAULT_BATCH_SIZE = 1_000;
const DEFAULT_BATCH_DELAY_MS = 100;

const SELECT_SQL = `
  SELECT id
  FROM memberships
  WHERE id > :lastId
    AND role = 'builder'
  ORDER BY id ASC
  LIMIT :batchSize
`;

const UPDATE_SQL = `
  UPDATE memberships
  SET role = 'user'
  WHERE id IN (:ids)
    AND role = 'builder'
`;

const COUNT_SQL = `SELECT COUNT(*) AS count FROM memberships WHERE role = 'builder'`;

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

makeScript(
  {
    batchSize: {
      type: "number",
      default: DEFAULT_BATCH_SIZE,
      describe: "Maximum number of rows updated per transaction",
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
        COUNT_SQL,
        { type: QueryTypes.SELECT }
      );
      logger.info(
        { wouldUpdate: Number(count), batchSize, batchDelayMs },
        "Dry run: would migrate membership role builder -> user"
      );
      return;
    }

    let batch = 0;
    let lastId = 0;
    let totalUpdated = 0;

    for (;;) {
      // Keyset pagination prevents each batch from rescanning rows already processed.
      const rows = await frontSequelize.query<{ id: number }>(SELECT_SQL, {
        replacements: { lastId, batchSize },
        type: QueryTypes.SELECT,
      });

      if (rows.length === 0) {
        break;
      }

      lastId = rows[rows.length - 1].id;
      // Keep each batch in its own autocommit transaction so row locks are released before the
      // pause. Raw SQL also leaves the row's updatedAt untouched.
      const [, updated] = await frontSequelize.query(UPDATE_SQL, {
        replacements: { ids: rows.map(({ id }) => id) },
        type: QueryTypes.UPDATE,
      });

      batch += 1;
      totalUpdated += updated;
      logger.info(
        { batch, batchSize: rows.length, lastId, updated, totalUpdated },
        "Migrated membership role builder -> user batch"
      );

      if (batchDelayMs > 0) {
        await wait(batchDelayMs);
      }
    }

    logger.info(
      { batches: batch, lastId, totalUpdated },
      "Completed membership role builder -> user migration"
    );
  }
);

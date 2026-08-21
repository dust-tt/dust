import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const DEFAULT_BATCH_SIZE = 1_000;
const DEFAULT_BATCH_DELAY_MS = 100;

// Flip space editor groups from the deprecated "space_editors" kind to "regular_auto". The code
// already treats both kinds as editor groups (see MIGRATING_SPACE_EDITOR_GROUP_KINDS), so this
// backfill only re-labels rows; editor identity is derived from group_permissions, not the kind.
// Two tables carry the kind: `groups.kind` and the denormalized `group_vaults."groupKind"`. Both
// are updated. Idempotent — only rows still set to "space_editors" are touched, so it is safe to
// re-run. Runs post-deploy, before the PR that removes the "space_editors" kind.
const SELECT_GROUPS_SQL = `
  SELECT id
  FROM groups
  WHERE id > :lastId
    AND kind = 'space_editors'
  ORDER BY id ASC
  LIMIT :batchSize
`;

const UPDATE_GROUPS_SQL = `
  UPDATE groups
  SET kind = 'regular_auto'
  WHERE id IN (:ids)
    AND kind = 'space_editors'
`;

const SELECT_GROUP_VAULTS_SQL = `
  SELECT id
  FROM group_vaults
  WHERE id > :lastId
    AND "groupKind" = 'space_editors'
  ORDER BY id ASC
  LIMIT :batchSize
`;

const UPDATE_GROUP_VAULTS_SQL = `
  UPDATE group_vaults
  SET "groupKind" = 'regular_auto'
  WHERE id IN (:ids)
    AND "groupKind" = 'space_editors'
`;

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function backfillTable(
  {
    table,
    selectSql,
    updateSql,
    batchSize,
    batchDelayMs,
  }: {
    table: string;
    selectSql: string;
    updateSql: string;
    batchSize: number;
    batchDelayMs: number;
  },
  logger: Logger
): Promise<void> {
  let batch = 0;
  let lastId = 0;
  let totalUpdated = 0;

  for (;;) {
    // Keyset pagination prevents each batch from rescanning rows already processed.
    const rows = await frontSequelize.query<{ id: number }>(selectSql, {
      replacements: { lastId, batchSize },
      type: QueryTypes.SELECT,
    });

    if (rows.length === 0) {
      break;
    }

    lastId = rows[rows.length - 1].id;
    // Keep each batch in its own autocommit transaction so row locks are released before the
    // pause. Raw SQL also leaves the row's updatedAt untouched.
    const [, updated] = await frontSequelize.query(updateSql, {
      replacements: { ids: rows.map(({ id }) => id) },
      type: QueryTypes.UPDATE,
    });

    batch += 1;
    totalUpdated += updated;
    logger.info(
      { table, batch, batchSize: rows.length, lastId, updated, totalUpdated },
      "Backfilled space_editors -> regular_auto batch"
    );

    if (batchDelayMs > 0) {
      await wait(batchDelayMs);
    }
  }

  logger.info(
    { table, batches: batch, lastId, totalUpdated },
    "Completed space_editors -> regular_auto backfill for table"
  );
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
      const [{ count: groupsCount }] = await frontSequelize.query<{
        count: string;
      }>(`SELECT COUNT(*) AS count FROM groups WHERE kind = 'space_editors'`, {
        type: QueryTypes.SELECT,
      });
      const [{ count: groupVaultsCount }] = await frontSequelize.query<{
        count: string;
      }>(
        `SELECT COUNT(*) AS count FROM group_vaults WHERE "groupKind" = 'space_editors'`,
        { type: QueryTypes.SELECT }
      );

      logger.info(
        {
          wouldUpdateGroups: Number(groupsCount),
          wouldUpdateGroupVaults: Number(groupVaultsCount),
          batchSize,
          batchDelayMs,
        },
        "Dry run: would backfill space_editors -> regular_auto"
      );
      return;
    }

    await backfillTable(
      {
        table: "groups",
        selectSql: SELECT_GROUPS_SQL,
        updateSql: UPDATE_GROUPS_SQL,
        batchSize,
        batchDelayMs,
      },
      logger
    );
    await backfillTable(
      {
        table: "group_vaults",
        selectSql: SELECT_GROUP_VAULTS_SQL,
        updateSql: UPDATE_GROUP_VAULTS_SQL,
        batchSize,
        batchDelayMs,
      },
      logger
    );
  }
);

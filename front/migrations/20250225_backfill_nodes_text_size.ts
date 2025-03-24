import { QueryTypes } from "sequelize";

import { getCorePrimaryDbConnection } from "@app/lib/production_checks/utils";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const BATCH_SIZE = 1024;

const coreSequelize = getCorePrimaryDbConnection();

async function migrateDataSource(
  {
    dataSourceId,
    execute,
  }: {
    dataSourceId: number;
    execute: boolean;
  },
  parentLogger: typeof Logger
) {
  const logger = parentLogger.child({
    dataSourceId,
  });
  logger.info("MIGRATE");

  // We don't really have a dry run for this script besides logging the data source IDs.
  if (!execute) {
    return;
  }

  // We scroll on the timestamps to leverage the index (data_source, status, timestamp).
  // If we get a whole batch of documents with the same timestamp, we scroll on the ids to avoid infinite loops.
  let nextTimestamp = 0;
  let nextId = null;

  for (;;) {
    if (nextId === null) {
      logger.info(`Fetching documents with timestamp >= ${nextTimestamp}`);
    } else {
      logger.info(
        `Fetching documents with timestamp >= ${nextTimestamp} and id > ${nextId}`
      );
    }
    const [updatedRows] = (await (async () => {
      // If nextId is null, we only filter by timestamp.
      if (nextId === null) {
        return coreSequelize.query(
          `WITH to_update AS (
                SELECT id, timestamp, text_size
                FROM data_sources_documents
                WHERE data_source = :dataSourceId
                  AND status = :status
                  AND timestamp >= :nextTimestamp -- index on (data_source, status, timestamp)
                ORDER BY timestamp, id
                LIMIT :batchSize
            )
             UPDATE data_sources_nodes
             SET text_size = tu.text_size
             FROM to_update tu
             WHERE document = tu.id
             RETURNING tu.timestamp, tu.id;`,
          {
            replacements: {
              dataSourceId,
              status: "latest",
              nextTimestamp,
              batchSize: BATCH_SIZE,
            },
          }
        );
      } else {
        // Otherwise, we filter by timestamp and id
        return coreSequelize.query(
          `WITH to_update AS (
                SELECT id, timestamp, text_size
                FROM data_sources_documents dsd
                WHERE data_source = :dataSourceId
                  AND status = :status
                  AND timestamp >= :nextTimestamp
                  AND id > :nextId -- does not leverage an index but only used to unlock possible infinite loops on batches of equal timestamps
                ORDER BY timestamp, id
                LIMIT :batchSize
            )
             UPDATE data_sources_nodes
             SET text_size = tu.text_size
             FROM to_update tu
             WHERE document = tu.id
             RETURNING tu.timestamp, tu.id;`,
          {
            replacements: {
              dataSourceId,
              status: "latest",
              nextTimestamp,
              batchSize: BATCH_SIZE,
              nextId,
            },
          }
        );
      }
    })()) as { id: number; timestamp: number }[][];

    if (updatedRows.length === 0) {
      logger.info("DONE");
      break;
    }

    logger.info(
      {
        firstRow: updatedRows[0],
        lastRow: updatedRows.length > 1 && updatedRows[updatedRows.length - 1],
      },
      `Update ${updatedRows.length} nodes.`
    );

    // If we are just getting out of a pagination on ids,
    // we have to set a conservative value for the timestamp
    // as we may have reached a timestamp too high due to having filtered on the ids.
    if (
      nextId !== null &&
      updatedRows[0].timestamp !== updatedRows[updatedRows.length - 1].timestamp
    ) {
      // There is no way to set the timestamp based on updatedRows, setting the most conservative value possible here.
      nextTimestamp += 1;
    } else {
      // If we are scrolling through the timestamps, we can set the nextTimestamp to the last timestamp (same if all documents have the same timestamp, which is a no-op).
      nextTimestamp = updatedRows[updatedRows.length - 1].timestamp;
    }
    // If all documents have the same timestamp, we set nextId to the last id.
    nextId =
      updatedRows[0].timestamp === updatedRows[updatedRows.length - 1].timestamp
        ? updatedRows[updatedRows.length - 1].id
        : null;
  }
}

async function migrateAll({
  nextDataSourceId,
  execute,
  logger,
}: {
  nextDataSourceId: number;
  execute: boolean;
  logger: typeof Logger;
}) {
  const dataSources = (await coreSequelize.query(
    `SELECT id
     FROM data_sources
     WHERE id > :nextDataSourceId;`,
    { replacements: { nextDataSourceId }, type: QueryTypes.SELECT }
  )) as { id: number }[];

  for (const dataSource of dataSources) {
    await migrateDataSource(
      {
        dataSourceId: dataSource.id,
        execute,
      },
      logger
    );
  }
}

makeScript(
  { nextDataSourceId: { type: "number", default: 0 } },
  async ({ nextDataSourceId, execute }, logger) => {
    await migrateAll({ nextDataSourceId, execute, logger });
  }
);

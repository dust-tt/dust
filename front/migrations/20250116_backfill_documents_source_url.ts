import assert from "assert";
import { Op } from "sequelize";

import { getCorePrimaryDbConnection } from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const QUERY_BATCH_SIZE = 1024; // here it does a lot

async function migrateDataSource({
  frontDataSource,
  execute,
  logger,
}: {
  frontDataSource: DataSourceModel;
  execute: boolean;
  logger: typeof Logger;
}) {
  logger.info("MIGRATE");

  const corePrimary = getCorePrimaryDbConnection();

  // Retrieve the core data source.
  const [coreDataSourceRows] = (await corePrimary.query(
    `SELECT id, data_source_id
     FROM data_sources
     WHERE project = :project
       AND data_source_id = :dataSourceId;`,
    {
      replacements: {
        project: frontDataSource.dustAPIProjectId,
        dataSourceId: frontDataSource.dustAPIDataSourceId,
      },
    }
  )) as { id: number; data_source_id: string }[][];

  assert(
    coreDataSourceRows.length === 1 &&
      coreDataSourceRows[0].data_source_id ===
        frontDataSource.dustAPIDataSourceId,
    "Core data source mismatch"
  );
  const coreDataSourceId = coreDataSourceRows[0].id;

  // Loop over all the documents in the data source (can be a big loop).
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
        if (execute) {
          return corePrimary.query(
            `WITH to_update AS (
                SELECT id, source_url, timestamp
                FROM data_sources_documents
                WHERE data_source = :coreDataSourceId
                  AND status = :status
                  AND timestamp >= :nextTimestamp -- index on (data_source, status, timestamp)
                ORDER BY timestamp, id
                LIMIT :batchSize
            )
             UPDATE data_sources_nodes
             SET source_url = tu.source_url
             FROM to_update tu
             WHERE document = tu.id
             RETURNING tu.timestamp, tu.id;`,
            {
              replacements: {
                coreDataSourceId,
                status: "latest",
                nextTimestamp,
                batchSize: QUERY_BATCH_SIZE,
              },
            }
          );
        } else {
          return corePrimary.query(
            `SELECT id, source_url, timestamp
             FROM data_sources_documents
             WHERE data_source = :coreDataSourceId
               AND status = :status
               AND timestamp >= :nextTimestamp -- index on (data_source, status, timestamp)
             ORDER BY timestamp, id
             LIMIT :batchSize;`,
            {
              replacements: {
                coreDataSourceId,
                status: "latest",
                nextTimestamp,
                batchSize: QUERY_BATCH_SIZE,
              },
            }
          );
        }
      } else {
        // Otherwise, we filter by timestamp and id
        if (execute) {
          return corePrimary.query(
            `WITH to_update AS (
                SELECT id, source_url, timestamp
                FROM data_sources_documents dsd
                WHERE data_source = :coreDataSourceId
                  AND status = :status
                  AND timestamp >= :nextTimestamp
                  AND id > :nextId -- does not leverage an index but only used to unlock possible infinite loops on batches of equal timestamps
                ORDER BY timestamp, id
                LIMIT :batchSize
            )
             UPDATE data_sources_nodes
             SET source_url = tu.source_url
             FROM to_update tu
             WHERE document = tu.id
             RETURNING tu.timestamp, tu.id;`,
            {
              replacements: {
                coreDataSourceId,
                status: "latest",
                nextTimestamp,
                batchSize: QUERY_BATCH_SIZE,
                nextId,
              },
            }
          );
        } else {
          return corePrimary.query(
            `SELECT id, source_url, timestamp
             FROM data_sources_documents dsd
             WHERE data_source = :coreDataSourceId
               AND status = :status
               AND timestamp >= :nextTimestamp
               AND id > :nextId -- does not leverage an index but only used to unlock possible infinite loops on batches of equal timestamps
             ORDER BY timestamp, id
             LIMIT :batchSize;`,
            {
              replacements: {
                coreDataSourceId,
                status: "latest",
                nextTimestamp,
                batchSize: QUERY_BATCH_SIZE,
                nextId,
              },
            }
          );
        }
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
  const frontDataSources = await DataSourceModel.findAll({
    where: { id: { [Op.gt]: nextDataSourceId } },
    order: [["id", "ASC"]],
  });

  for (const frontDataSource of frontDataSources) {
    await migrateDataSource({
      frontDataSource,
      execute,
      logger: logger.child({
        dataSourceId: frontDataSource.id,
        connectorProvider: frontDataSource.connectorProvider,
      }),
    });
  }
}

makeScript(
  { nextDataSourceId: { type: "number", default: 0 } },
  async ({ nextDataSourceId, execute }, logger) => {
    await migrateAll({ nextDataSourceId, execute, logger });
  }
);

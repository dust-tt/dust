import type { Sequelize } from "sequelize";
import { QueryTypes } from "sequelize";

import {
  getConnectorsReplicaDbConnection,
  getCorePrimaryDbConnection,
} from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const BATCH_SIZE = 128;

async function backfillDataSource(
  frontDataSource: DataSourceModel,
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing data source");

  // get datasource id from core
  const rows: { id: number }[] = await coreSequelize.query(
    `SELECT id FROM data_sources WHERE data_source_id = :dataSourceId;`,
    {
      replacements: { dataSourceId: frontDataSource.dustAPIDataSourceId },
      type: QueryTypes.SELECT,
    }
  );

  if (rows.length === 0) {
    logger.error(`Data source ${frontDataSource.id} not found in core`);
    return;
  }

  const dataSourceId = rows[0].id;

  await backfillNodes(
    frontDataSource,
    dataSourceId,
    coreSequelize,
    connectorsSequelize,
    execute,
    logger
  );
}

async function backfillNodes(
  frontDataSource: DataSourceModel,
  dataSourceId: number,
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing nodes");

  // processing the spreadsheets chunk by chunk
  let lastId = 0;
  let rows: { id: number; internalId: string; webUrl: string }[] = [];

  do {
    // querying connectors for the next batch of spreadsheets

    rows = await connectorsSequelize.query(
      `SELECT id, "internalId", "webUrl"
       FROM microsoft_nodes
       WHERE id > :lastId
         AND "connectorId" = :connectorId
       ORDER BY id
       LIMIT :batchSize;`,
      {
        replacements: {
          batchSize: BATCH_SIZE,
          lastId,
          connectorId: frontDataSource.connectorId,
        },
        type: QueryTypes.SELECT,
      }
    );

    if (rows.length === 0) {
      break;
    }
    // reconstructing the URLs and node IDs
    const urls = rows.map((row) => row.webUrl);
    const nodeIds = rows.map((row) => row.internalId);

    if (execute) {
      // updating on core on the nodeIds
      await coreSequelize.query(
        `UPDATE data_sources_nodes
         SET source_url = urls.url
         FROM (SELECT unnest(ARRAY [:nodeIds]::text[]) as node_id,
                      unnest(ARRAY [:urls]::text[])    as url) urls
         WHERE data_sources_nodes.data_source = :dataSourceId AND data_sources_nodes.node_id = urls.node_id;`,
        { replacements: { urls, nodeIds, dataSourceId } }
      );
      logger.info(
        `Updated ${rows.length} spreadsheets from id ${rows[0].id} to id ${rows[rows.length - 1].id}.`
      );
    } else {
      logger.info(
        `Would update ${rows.length} spreadsheets from id ${rows[0].id} to id ${rows[rows.length - 1].id}.`
      );
    }

    lastId = rows[rows.length - 1].id;
  } while (rows.length === BATCH_SIZE);
}

makeScript({}, async ({ execute }, logger) => {
  const coreSequelize = getCorePrimaryDbConnection();
  const connectorsSequelize = getConnectorsReplicaDbConnection();
  const frontDataSources = await DataSourceModel.findAll({
    where: { connectorProvider: "microsoft" },
  });
  logger.info(`Found ${frontDataSources.length} Microsoft data sources`);

  for (const frontDataSource of frontDataSources) {
    await backfillDataSource(
      frontDataSource,
      coreSequelize,
      connectorsSequelize,
      execute,
      logger.child({
        dataSourceId: frontDataSource.id,
        connectorId: frontDataSource.connectorId,
        name: frontDataSource.name,
      })
    );
  }
});

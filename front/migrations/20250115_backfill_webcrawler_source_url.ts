import type { Sequelize } from "sequelize";
import { QueryTypes } from "sequelize";

import {
  getConnectorsReplicaDbConnection,
  getCorePrimaryDbConnection,
} from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const BATCH_SIZE = 1024;

// see the call to upsertDataSourceFolder in webcrawler/temporal/activities.ts
async function backfillFolders(
  frontDataSource: DataSourceModel,
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing folders");

  const coreDataSourceIds: { id: number }[] = await coreSequelize.query(
    `SELECT id
     FROM data_sources
     WHERE project = :projectId
       AND data_source_id = :dataSourceId;`,
    {
      replacements: {
        dataSourceId: frontDataSource.dustAPIDataSourceId,
        projectId: frontDataSource.dustAPIProjectId,
      },
      type: QueryTypes.SELECT,
    }
  );
  const coreDataSourceId = coreDataSourceIds[0].id;
  if (!coreDataSourceId) {
    logger.error("No core data source found for the given front data source.");
    return;
  }

  let lastId = 0;
  let rows: { id: number; internalId: string; url: string }[] = [];

  do {
    rows = await connectorsSequelize.query(
      `SELECT id, "internalId", "url"
       FROM webcrawler_folders
       WHERE id > :lastId
         AND "connectorId" = :connectorId -- does not leverage any index, we'll see if too slow or not
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

    logger.info({ row: rows[0] }, "Sample row.");
    const urls = rows.map((row) => row.url);
    const nodeIds = rows.map((row) => row.internalId);

    if (execute) {
      await coreSequelize.query(
        // No possible mismatch even though some pages are upserted in connectors' db but not as document
        // - unnest preserves array order and creates parallel tuples,
        `UPDATE data_sources_nodes
         SET source_url = urls.url
         FROM (SELECT unnest(ARRAY [:nodeIds]::text[]) as node_id,
                      unnest(ARRAY [:urls]::text[])    as url) urls
         WHERE data_sources_nodes.node_id = urls.node_id
           AND data_sources_nodes.data_source = :dataSourceId;`,
        { replacements: { urls, nodeIds, dataSourceId: coreDataSourceId } }
      );
      logger.info(
        `Updated ${rows.length} folders from id ${rows[0].id} to id ${rows[rows.length - 1].id}.`
      );
    } else {
      logger.info(
        `Would update ${rows.length} folders from id ${rows[0].id} to id ${rows[rows.length - 1].id}.`
      );
    }

    lastId = rows[rows.length - 1].id;
  } while (rows.length === BATCH_SIZE);
}

async function backfillDataSource(
  frontDataSource: DataSourceModel,
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing data source");

  await backfillFolders(
    frontDataSource,
    coreSequelize,
    connectorsSequelize,
    execute,
    logger
  );
}

makeScript({}, async ({ execute }, logger) => {
  const coreSequelize = getCorePrimaryDbConnection();
  const connectorsSequelize = getConnectorsReplicaDbConnection();
  const frontDataSources = await DataSourceModel.findAll({
    where: { connectorProvider: "webcrawler" },
  });
  logger.info(`Found ${frontDataSources.length} Webcrawler data sources`);
  for (const frontDataSource of frontDataSources) {
    await backfillDataSource(
      frontDataSource,
      coreSequelize,
      connectorsSequelize,
      execute,
      logger.child({
        dataSourceId: frontDataSource.id,
        connectorId: frontDataSource.connectorId,
      })
    );
  }
});

import type { Sequelize } from "sequelize";
import { QueryTypes } from "sequelize";

import {
  getConnectorsReplicaDbConnection,
  getCorePrimaryDbConnection,
} from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types";

const BATCH_SIZE = 256;

// Copy-pasted from connectors
function getHelpCenterCollectionInternalId(
  connectorId: ModelId,
  collectionId: string
): string {
  return `intercom-collection-${connectorId}-${collectionId}`;
}

async function updateNodes(
  coreSequelize: Sequelize,
  dataSourceId: number,
  nodeIds: string[],
  urls: string[]
) {
  await coreSequelize.query(
    `UPDATE data_sources_nodes
     SET source_url = urls.url
     FROM (SELECT unnest(ARRAY [:nodeIds]::text[]) as node_id,
                  unnest(ARRAY [:urls]::text[])    as url) urls
     WHERE data_sources_nodes.data_source = :dataSourceId AND data_sources_nodes.node_id = urls.node_id;`,
    { replacements: { urls, nodeIds, dataSourceId } }
  );
}

async function backfillCollections(
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  frontDataSource: DataSourceModel,
  coreDataSourceId: number,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing collections");

  let nextId = 0;
  let updatedRowsCount;
  do {
    const rows: {
      collectionId: string;
      id: number;
      url: string;
      connectorId: number;
    }[] = await connectorsSequelize.query(
      `
          SELECT ic.id, ic."collectionId", ic."url", ic."connectorId"
          FROM intercom_collections ic
          WHERE ic.id > :nextId AND ic."connectorId" = :connectorId
          ORDER BY ic.id
          LIMIT :batchSize;`,
      {
        replacements: {
          batchSize: BATCH_SIZE,
          nextId,
          connectorId: frontDataSource.connectorId,
        },
        type: QueryTypes.SELECT,
      }
    );

    if (rows.length == 0) {
      logger.info({ nextId }, `Finished processing collections.`);
      break;
    }
    nextId = rows[rows.length - 1].id;
    updatedRowsCount = rows.length;

    const urls = rows.map((row) => row.url);
    const nodeIds = rows.map((row) => {
      return getHelpCenterCollectionInternalId(
        row.connectorId,
        row.collectionId
      );
    });
    if (execute) {
      await updateNodes(coreSequelize, coreDataSourceId, nodeIds, urls);
      logger.info(`Updated ${rows.length} collections.`);
    } else {
      logger.info(
        `Would update ${rows.length} collections, sample: ${nodeIds.slice(0, 5).join(", ")}, ${urls.slice(0, 5).join(", ")}`
      );
    }
  } while (updatedRowsCount === BATCH_SIZE);
}

async function getCoreDataSourceId(
  frontDataSource: DataSourceModel,
  coreSequelize: Sequelize,
  logger: typeof Logger
) {
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
    return null;
  }

  return rows[0].id;
}

makeScript({}, async ({ execute }, logger) => {
  const coreSequelize = getCorePrimaryDbConnection();
  const connectorsSequelize = getConnectorsReplicaDbConnection();

  // No need for pagination, only 33 of them
  const frontDataSources = await DataSourceModel.findAll({
    where: { connectorProvider: "intercom" },
  });

  logger.info(`Found ${frontDataSources.length} Intercom data sources`);
  for (const frontDataSource of frontDataSources) {
    const coreDataSourceId = await getCoreDataSourceId(
      frontDataSource,
      coreSequelize,
      logger
    );

    if (coreDataSourceId === null) {
      throw new Error(
        `Data source ${frontDataSource.id} not found in core, skipping`
      );
    }

    await backfillCollections(
      coreSequelize,
      connectorsSequelize,
      frontDataSource,
      coreDataSourceId,
      execute,
      logger
    );
  }
});

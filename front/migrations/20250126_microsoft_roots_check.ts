import type { Sequelize } from "sequelize";
import { QueryTypes } from "sequelize";

import {
  getConnectorsReplicaDbConnection,
  getCorePrimaryDbConnection,
} from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

async function checkDataSource(
  frontDataSource: DataSourceModel,
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  parentLogger: typeof Logger
) {
  const logger = parentLogger.child({
    dataSourceId: frontDataSource.id,
    connectorId: frontDataSource.connectorId,
    name: frontDataSource.name,
  });

  logger.info("Checking data source");

  // get datasource id from core
  const rows: { id: number }[] = await coreSequelize.query(
    `SELECT id FROM data_sources WHERE project = :projectId AND data_source_id = :dataSourceId;`,
    {
      replacements: {
        projectId: frontDataSource.dustAPIProjectId,
        dataSourceId: frontDataSource.dustAPIDataSourceId,
      },
      type: QueryTypes.SELECT,
    }
  );

  if (rows.length === 0) {
    logger.error(`Data source ${frontDataSource.id} not found in core`);
    return;
  }

  const dataSourceId = rows[0].id;

  await checkNodes(
    frontDataSource,
    dataSourceId,
    coreSequelize,
    connectorsSequelize,
    logger
  );
}

async function checkNodes(
  frontDataSource: DataSourceModel,
  dataSourceId: number,
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  logger: typeof Logger
) {
  logger.info("Processing nodes");

  const rows: { id: number; internalId: string }[] =
    await connectorsSequelize.query(
      `SELECT id, "internalId"
       FROM microsoft_roots
       WHERE "connectorId" = :connectorId
       ORDER BY id`,
      {
        replacements: {
          connectorId: frontDataSource.connectorId,
        },
        type: QueryTypes.SELECT,
      }
    );

  if (rows.length === 0) {
    logger.warn("No root nodes found");
    return;
  }

  const rootIds = rows.map((row) => row.internalId);
  let count = 0;
  for (const rootId of rootIds) {
    if (
      !(await checkRootIsFine(rootId, rootIds, coreSequelize, dataSourceId))
    ) {
      logger.error(`Root ${rootId} has parents that aren't roots`);
      count++;
    }
  }
  logger.info(`Found ${count} roots with parents that aren't roots`);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
makeScript({}, async ({ execute }, logger) => {
  const coreSequelize = getCorePrimaryDbConnection();
  const connectorsSequelize = getConnectorsReplicaDbConnection();
  const frontDataSources = await DataSourceModel.findAll({
    where: { connectorProvider: "microsoft" },
  });
  logger.info(`Found ${frontDataSources.length} Microsoft data sources`);

  for (const frontDataSource of frontDataSources) {
    await checkDataSource(
      frontDataSource,
      coreSequelize,
      connectorsSequelize,
      logger
    );
  }
});

async function checkRootIsFine(
  internalId: string,
  rootInternalIds: string[],
  coreSequelize: Sequelize,
  dataSourceModelId: number
) {
  const rows: { node_id: string; parents: string[] }[] =
    await coreSequelize.query(
      `SELECT node_id, parents FROM data_sources_nodes WHERE data_source = :dataSourceModelId AND node_id = :internalId;`,
      {
        replacements: { dataSourceModelId, internalId },
        type: QueryTypes.SELECT,
      }
    );

  if (rows.length === 0) {
    // some root nodes are not in the core nodes table, that's fine
    return true;
  }
  const rootNode = rows[0];

  if (rootNode.parents.length === 1) {
    // if the root is in nodes, and has only itself as parent, that's fine
    return rootNode.parents[0] === rootNode.node_id;
  }

  // otherwise, one of the parents should be in the roots
  return rootInternalIds.some((rootInternalId) =>
    rootNode.parents.includes(rootInternalId)
  );
}

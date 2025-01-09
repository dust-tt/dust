import { concurrentExecutor, CoreAPI } from "@dust-tt/types";
import { Op, QueryTypes } from "sequelize";

import config from "@app/lib/api/config";
import { getCoreReplicaDbConnection } from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const coreSequelize = getCoreReplicaDbConnection();
const DATASOURCE_BATCH_SIZE = 25;
const NODE_CONCURRENCY = 10;

async function migrateNode(
  node: any,
  coreAPI: CoreAPI,
  projectId: string,
  dataSourceId: string,
  execute: boolean,
  logger: typeof Logger
) {
  if (node.parents.length === 0) {
    logger.info("Node has no parents.");
    if (execute) {
      if (node.document !== null) {
        await coreAPI.updateDataSourceDocumentParents({
          projectId,
          dataSourceId,
          documentId: node.node_id,
          parentId: null,
          parents: [node.node_id],
        });
      } else if (node.table !== null) {
        await coreAPI.updateTableParents({
          projectId,
          dataSourceId,
          tableId: node.node_id,
          parentId: null,
          parents: [node.node_id],
        });
      } else {
        logger.warn("Node is neither a document nor a table.");
      }
    }
  } else if (node.parents.length >= 2) {
    logger.warn("Node has 2 parents or more.");
  } else if (node.parents[0] !== node.node_id) {
    logger.warn("Node has incorrect parents: parents[0] !== document_id.");
  }
}

async function migrateFolderDataSourceParents(
  frontDataSource: DataSourceModel,
  coreAPI: CoreAPI,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("MIGRATE");

  const { dustAPIProjectId, dustAPIDataSourceId } = frontDataSource;
  const coreDataSource: any = (
    await coreSequelize.query(
      `SELECT id FROM data_sources WHERE project=:p AND data_source_id=:d LIMIT 1`,
      {
        replacements: { p: dustAPIProjectId, d: dustAPIDataSourceId },
        type: QueryTypes.SELECT,
      }
    )
  )[0];
  if (!coreDataSource) {
    logger.warn("No core data source found for static data source.");
    return;
  }

  const nodes: any[] = await coreSequelize.query(
    `SELECT node_id, parents, timestamp FROM data_sources_nodes WHERE data_source=:c`,
    { replacements: { c: coreDataSource.id }, type: QueryTypes.SELECT }
  );
  await concurrentExecutor(
    nodes,
    async (node) =>
      migrateNode(
        node,
        coreAPI,
        dustAPIProjectId,
        dustAPIDataSourceId,
        execute,
        logger.child({
          nodeId: node.node_id,
          parents: node.parents,
          timestamp: new Date(node.timestamp),
        })
      ),
    { concurrency: NODE_CONCURRENCY }
  );
}

async function migrateFolderDataSourcesParents(
  nextDataSourceId: number,
  coreAPI: CoreAPI,
  execute: boolean,
  logger: typeof Logger
) {
  const startId = nextDataSourceId;

  let staticDataSources;
  do {
    staticDataSources = await DataSourceModel.findAll({
      where: { connectorProvider: null, id: { [Op.gte]: startId } },
      limit: DATASOURCE_BATCH_SIZE,
      order: [["id", "ASC"]],
    });

    for (const dataSource of staticDataSources) {
      await migrateFolderDataSourceParents(
        dataSource,
        coreAPI,
        execute,
        logger.child({
          project: dataSource.dustAPIProjectId,
          dataSourceId: dataSource.dustAPIDataSourceId,
        })
      );
    }
  } while (staticDataSources.length === DATASOURCE_BATCH_SIZE);
}

makeScript(
  { nextDataSourceId: { type: "number", default: 0 } },
  async ({ nextDataSourceId, execute }, logger) => {
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    await migrateFolderDataSourcesParents(
      nextDataSourceId,
      coreAPI,
      execute,
      logger
    );
  }
);

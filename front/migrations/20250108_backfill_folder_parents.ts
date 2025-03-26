import { Op, QueryTypes } from "sequelize";

import config from "@app/lib/api/config";
import { getCoreReplicaDbConnection } from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { concurrentExecutor, CoreAPI } from "@app/types";

const coreSequelize = getCoreReplicaDbConnection();
const DATASOURCE_BATCH_SIZE = 256;
const SELECT_BATCH_SIZE = 256;
const NODE_CONCURRENCY = 16;

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
    logger.error("Node has 2 parents or more.");
  } else if (node.parents[0] !== node.node_id) {
    logger.error("Node has incorrect parents: parents[0] !== document_id.");
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

  let nextId = 0;
  let nodes: any[];

  do {
    nodes = await coreSequelize.query(
      `SELECT id, node_id, parents, timestamp FROM data_sources_nodes WHERE data_source=:c AND parents != ARRAY[node_id] AND id > :nextId LIMIT :batchSize`,
      {
        replacements: {
          c: coreDataSource.id,
          batchSize: SELECT_BATCH_SIZE,
          nextId,
        },
        type: QueryTypes.SELECT,
      }
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
            created: new Date(node.created),
          })
        ),
      { concurrency: NODE_CONCURRENCY }
    );
    if (nodes.length > 0) {
      nextId = nodes[nodes.length - 1].id;
    }
  } while (nodes.length === SELECT_BATCH_SIZE);
}

async function migrateFolderDataSourcesParents(
  nextDataSourceId: number,
  coreAPI: CoreAPI,
  execute: boolean,
  logger: typeof Logger
) {
  let startId = nextDataSourceId;
  let staticDataSources;
  do {
    staticDataSources = await DataSourceModel.findAll({
      where: { connectorProvider: null, id: { [Op.gt]: startId } },
      limit: DATASOURCE_BATCH_SIZE,
      order: [["id", "ASC"]],
    });

    await concurrentExecutor(
      staticDataSources,
      async (dataSource) => {
        await migrateFolderDataSourceParents(
          dataSource,
          coreAPI,
          execute,
          logger.child({
            project: dataSource.dustAPIProjectId,
            dataSourceId: dataSource.dustAPIDataSourceId,
          })
        );
      },
      { concurrency: 10 }
    );
    if (staticDataSources.length > 0) {
      startId = staticDataSources[staticDataSources.length - 1].id;
    }
  } while (staticDataSources.length === DATASOURCE_BATCH_SIZE);
}

makeScript(
  { nextDataSourceId: { type: "number", default: -1 } },
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

import { Op, QueryTypes } from "sequelize";

import config from "@app/lib/api/config";
import { getCoreReplicaDbConnection } from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { CoreAPI } from "@app/types";

const coreSequelize = getCoreReplicaDbConnection();
const DATASOURCE_BATCH_SIZE = 256;
const SELECT_BATCH_SIZE = 256;

const DATASOURCE_CONCURRENCY = 4;
const NODE_CONCURRENCY = 8;

type Node = {
  id: number;
  node_id: string;
  parents: string[];
  timestamp: number;
  document: number | null;
  table: number | null;
};

async function migrateNode(
  node: Node,
  coreAPI: CoreAPI,
  projectId: string,
  dataSourceId: string,
  parentLogger: typeof Logger
) {
  const logger = parentLogger.child({
    rowId: node.id,
    nodeId: node.node_id,
    parents: node.parents,
    timestamp: new Date(node.timestamp),
  });
  logger.info("NODE");

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

async function migrateFolderDataSourceParents(
  frontDataSource: DataSourceModel,
  coreAPI: CoreAPI,
  execute: boolean,
  parentLogger: typeof Logger
) {
  const logger = parentLogger.child({
    project: frontDataSource.dustAPIProjectId,
    dataSourceId: frontDataSource.dustAPIDataSourceId,
  });
  logger.info("MIGRATE");

  const { dustAPIProjectId, dustAPIDataSourceId } = frontDataSource;
  const coreDataSource: any = (
    await coreSequelize.query(
      `SELECT id
       FROM data_sources
       WHERE project = :p
         AND data_source_id = :d
       LIMIT 1`,
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
  let nodes: Node[];

  do {
    nodes = (await coreSequelize.query(
      `SELECT "id", "node_id", "parents", "timestamp", "document", "table"
       FROM data_sources_nodes
       WHERE data_source = :c
         AND parents[2] IS NOT NULL -- leverages the index on (data_source, (parents[2]))
         AND id > :nextId
       LIMIT :batchSize`,
      {
        replacements: {
          c: coreDataSource.id,
          batchSize: SELECT_BATCH_SIZE,
          nextId,
        },
        type: QueryTypes.SELECT,
      }
    )) as Node[];

    logger.info(`Found ${nodes.length} nodes to process.`);

    if (execute) {
      await concurrentExecutor(
        nodes,
        async (node) =>
          migrateNode(
            node,
            coreAPI,
            dustAPIProjectId,
            dustAPIDataSourceId,
            logger
          ),
        { concurrency: NODE_CONCURRENCY }
      );
    }
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
          logger
        );
      },
      { concurrency: DATASOURCE_CONCURRENCY }
    );
    if (staticDataSources.length > 0) {
      startId = staticDataSources[staticDataSources.length - 1].id;
    }
  } while (staticDataSources.length === DATASOURCE_BATCH_SIZE); // early exit on the first incomplete batch
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

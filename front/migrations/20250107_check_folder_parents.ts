import { Op, QueryTypes } from "sequelize";

import { getCoreReplicaDbConnection } from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const coreSequelize = getCoreReplicaDbConnection();
const DATASOURCE_BATCH_SIZE = 25;
const SELECT_BATCH_SIZE = 256;

function checkNode(node: any, logger: typeof Logger) {
  if (node.parents.length === 0) {
    logger.warn("Node has no parents.");
  } else if (node.parents.length >= 2) {
    logger.warn("Node has 2 parents or more.");
  } else if (node.parents[0] !== node.node_id) {
    logger.warn("Node has incorrect parents: parents[0] !== document_id.");
  }
}

async function checkStaticDataSourceParents(
  frontDataSource: DataSourceModel,
  logger: typeof Logger
) {
  if (frontDataSource.id % 100 === 0) {
    logger.info("CHECK");
  }
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
          nextId,
          batchSize: SELECT_BATCH_SIZE,
        },
        type: QueryTypes.SELECT,
      }
    );
    nodes.forEach((doc) => {
      checkNode(
        doc,
        logger.child({
          nodeId: doc.node_id,
          parents: doc.parents,
          timestamp: new Date(doc.timestamp),
        })
      );
    });
    if (nodes.length > 0) {
      nextId = nodes[nodes.length - 1].id;
    }
  } while (nodes.length === SELECT_BATCH_SIZE);
}

async function checkStaticDataSourcesParents(
  nextDataSourceId: number,
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
        await checkStaticDataSourceParents(
          dataSource,
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
  async ({ nextDataSourceId }, logger) => {
    await checkStaticDataSourcesParents(nextDataSourceId, logger);
  }
);

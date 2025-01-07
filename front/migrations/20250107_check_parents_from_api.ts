import { Op, QueryTypes } from "sequelize";

import { getCoreReplicaDbConnection } from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const coreSequelize = getCoreReplicaDbConnection();
const DATASOURCE_BATCH_SIZE = 25;

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
  logger.info("CHECK");
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
}

async function checkStaticDataSourcesParents(
  nextDataSourceId: number,
  logger: typeof Logger
) {
  const startId = nextDataSourceId;

  let staticDataSources;
  do {
    staticDataSources = await DataSourceModel.findAll({
      where: { connectorProvider: null, id: { [Op.gte]: startId } },
      limit: DATASOURCE_BATCH_SIZE,
    });

    for (const dataSource of staticDataSources) {
      await checkStaticDataSourceParents(
        dataSource,
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
  async ({ nextDataSourceId }, logger) => {
    await checkStaticDataSourcesParents(nextDataSourceId, logger);
  }
);

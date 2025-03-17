import type { Sequelize } from "sequelize";
import { Op, QueryTypes } from "sequelize";

import { getCorePrimaryDbConnection } from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { isConnectorProvider } from "@app/types";

const SELECT_BATCH_SIZE = 512;

type Node = {
  node_id: string;
  tags_array: string[];
  timestamp: number;
  title: string;
};

function getTitleFromTags(node: Node): string | null {
  return (
    node.tags_array
      .filter((tag) => tag.startsWith("title:"))
      .map((n) => n.split("title:").slice(1).join(""))[0] || null
  );
}

async function getCoreDataSourceId(
  frontDataSource: DataSourceModel,
  coreSequelize: Sequelize
): Promise<number | null> {
  const { dustAPIProjectId, dustAPIDataSourceId } = frontDataSource;
  const coreDataSource: any = (
    await coreSequelize.query(
      `SELECT id
       FROM data_sources
       WHERE project = :dustAPIProjectId
         AND data_source_id = :dustAPIDataSourceId
       LIMIT 1`,
      {
        replacements: { dustAPIProjectId, dustAPIDataSourceId },
        type: QueryTypes.SELECT,
      }
    )
  )[0];
  return coreDataSource?.id || null;
}

function logInconsistencies(nodes: Node[], logger: typeof Logger) {
  const diff = Object.fromEntries(
    nodes
      .filter((n) => {
        const titleFromTag = getTitleFromTags(n);
        /// Log only the diff that is not what was identified where the title in data_sources_nodes is the cropped version of titleFromTag.
        return (
          titleFromTag &&
          n.title !== titleFromTag &&
          n.title !== titleFromTag.split(":")[0]
        );
      })
      .map((n) => [
        n.node_id,
        { tagTitle: getTitleFromTags(n), nodeTitle: n.title },
      ])
  );
  if (Object.keys(diff).length > 0) {
    logger.info({ diff }, "Title inconsistencies.");
  } else {
    logger.info("No title inconsistency.");
  }
}

async function processNodes({
  allNodes,
  coreDataSourceId,
  coreSequelize,
  execute,
  logger,
}: {
  allNodes: Node[];
  coreDataSourceId: number;
  coreSequelize: Sequelize;
  execute: boolean;
  logger: typeof Logger;
}) {
  const nodes = allNodes.filter((n) => {
    const titleFromTag = getTitleFromTags(n);
    /// Keep only the diff that was identified where the title in data_sources_nodes is the cropped version of titleFromTag.
    return (
      titleFromTag &&
      n.title !== titleFromTag &&
      n.title === titleFromTag.split(":")[0]
    );
  });
  if (nodes.length === 0) {
    return;
  }
  logger.info(`Found ${nodes.length} nodes to process.`);
  // Replacing the titles with the ones in the tags.
  const titles = nodes.map(getTitleFromTags);

  if (execute) {
    await coreSequelize.query(
      `UPDATE data_sources_nodes dsn
     SET title = unnested.title
     FROM (
              SELECT UNNEST(ARRAY [:nodeIds]::text[]) AS node_id,
                     UNNEST(ARRAY [:titles]::text[])  AS title
          ) unnested
     WHERE dsn.data_source = :coreDataSourceId
       AND dsn.node_id = unnested.node_id;`,
      {
        replacements: {
          nodeIds: nodes.map((n) => n.node_id),
          titles,
          coreDataSourceId,
        },
      }
    );
  }
}

async function migrateDocuments({
  coreDataSourceId,
  coreSequelize,
  execute,
  logger,
}: {
  coreDataSourceId: number;
  coreSequelize: Sequelize;
  execute: boolean;
  logger: typeof Logger;
}) {
  let nextId = "";
  let nodes: Node[];

  do {
    nodes = (await coreSequelize.query(
      `SELECT dsn.node_id, dsn.timestamp, dsn.title, dsd.tags_array
       FROM data_sources_nodes dsn
            JOIN data_sources_documents dsd ON dsd.id = dsn.document
       WHERE dsn.data_source = :coreDataSourceId
         AND dsn.node_id > :nextId
       LIMIT :batchSize`,
      {
        replacements: {
          coreDataSourceId,
          batchSize: SELECT_BATCH_SIZE,
          nextId,
        },
        type: QueryTypes.SELECT,
      }
    )) as Node[];

    logInconsistencies(nodes, logger);

    await processNodes({
      allNodes: nodes,
      coreSequelize,
      coreDataSourceId,
      execute,
      logger,
    });
    nextId = nodes[nodes.length - 1]?.node_id;
  } while (nodes.length === SELECT_BATCH_SIZE);
}

async function migrateTables({
  coreDataSourceId,
  coreSequelize,
  execute,
  logger,
}: {
  coreDataSourceId: number;
  coreSequelize: Sequelize;
  execute: boolean;
  logger: typeof Logger;
}) {
  let nextId = "";
  let nodes: Node[];

  do {
    nodes = (await coreSequelize.query(
      `SELECT dsn.node_id, dsn.timestamp, dsn.title, t.tags_array
       FROM data_sources_nodes dsn
            JOIN tables t ON t.id = dsn.table
       WHERE dsn.data_source = :coreDataSourceId
         AND dsn.node_id > :nextId
       LIMIT :batchSize`,
      {
        replacements: {
          coreDataSourceId,
          batchSize: SELECT_BATCH_SIZE,
          nextId,
        },
        type: QueryTypes.SELECT,
      }
    )) as Node[];

    logInconsistencies(nodes, logger);

    await processNodes({
      allNodes: nodes,
      coreSequelize,
      coreDataSourceId,
      execute,
      logger,
    });
    nextId = nodes[nodes.length - 1]?.node_id;
  } while (nodes.length === SELECT_BATCH_SIZE);
}

async function migrateDataSource(
  frontDataSource: DataSourceModel,
  coreSequelize: Sequelize,
  execute: boolean,
  parentLogger: typeof Logger
) {
  const logger = parentLogger.child({
    project: frontDataSource.dustAPIProjectId,
    dataSourceId: frontDataSource.dustAPIDataSourceId,
  });
  logger.info("MIGRATE");

  const coreDataSourceId = await getCoreDataSourceId(
    frontDataSource,
    coreSequelize
  );
  if (!coreDataSourceId) {
    logger.error("No core datasource found.");
    return;
  }

  await migrateDocuments({ coreDataSourceId, coreSequelize, execute, logger });
  await migrateTables({ coreDataSourceId, coreSequelize, execute, logger });
}

makeScript(
  {
    nextDataSourceId: { type: "number", default: 0 },
    provider: { type: "string" },
  },
  async ({ nextDataSourceId, provider, execute }, logger) => {
    if (!isConnectorProvider(provider)) {
      logger.error(`Invalid provider ${provider}`);
      return;
    }
    const coreSequelize = getCorePrimaryDbConnection();
    const dataSources = await DataSourceModel.findAll({
      where: {
        connectorProvider: provider,
        id: { [Op.gt]: nextDataSourceId },
      },
      order: [["id", "ASC"]],
    });

    for (const dataSource of dataSources) {
      await migrateDataSource(dataSource, coreSequelize, execute, logger);
    }
  }
);

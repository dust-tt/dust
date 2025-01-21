import type { Sequelize } from "sequelize";

import { getCorePrimaryDbConnection } from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const QUERY_BATCH_SIZE = 1024;

async function migrateDataSource({
  frontDataSource,
  coreSequelize,
  pattern,
  parentsLength,
  execute,
  logger,
}: {
  frontDataSource: DataSourceModel;
  coreSequelize: Sequelize;
  parentsLength: number;
  pattern: string;
  execute: boolean;
  logger: typeof Logger;
}) {
  const localLogger = logger.child({
    dataSourceId: frontDataSource.id,
    connectorProvider: frontDataSource.connectorProvider,
    pattern,
  });

  localLogger.info("MIGRATE");

  // Retrieve the core data source.
  const [coreDataSourceRows] = (await coreSequelize.query(
    `SELECT id, data_source_id
     FROM data_sources
     WHERE project = :project
       AND data_source_id = :dataSourceId;`,
    {
      replacements: {
        project: frontDataSource.dustAPIProjectId,
        dataSourceId: frontDataSource.dustAPIDataSourceId,
      },
    }
  )) as { id: number; data_source_id: string }[][];

  if (
    coreDataSourceRows.length !== 1 ||
    coreDataSourceRows[0].data_source_id !== frontDataSource.dustAPIDataSourceId
  ) {
    logger.error("Core data source mismatch");
    return;
  }

  const coreDataSourceId = coreDataSourceRows[0].id;

  // Loop over all the documents in the data source (can be a big loop).
  let nextId = 0;

  for (;;) {
    const [updatedRows] = (await (async () => {
      if (execute) {
        return coreSequelize.query(
          `UPDATE data_sources_nodes
             SET parents = parents[1: :parentsLength]
             WHERE id IN (
                 SELECT id
                 FROM data_sources_nodes
                 WHERE data_source = :coreDataSourceId
                   AND node_id LIKE :pattern
                   AND id > :nextId
                 ORDER BY id
                 LIMIT :batchSize
             )
             RETURNING id;`,
          {
            replacements: {
              nextId,
              coreDataSourceId,
              parentsLength,
              batchSize: QUERY_BATCH_SIZE,
              pattern,
            },
          }
        );
      }
    })()) as { id: number }[][];

    if (updatedRows.length === 0) {
      localLogger.info("DONE");
      break;
    }

    localLogger.info(
      {
        firstRow: updatedRows[0],
        lastRow: updatedRows.length > 1 && updatedRows[updatedRows.length - 1],
      },
      `Update ${updatedRows.length} nodes.`
    );

    nextId = updatedRows[updatedRows.length - 1].id;
  }
}

makeScript({}, async ({ execute }, logger) => {
  const coreSequelize = getCorePrimaryDbConnection();

  const frontDataSources = await DataSourceModel.findAll({
    where: { connectorProvider: "zendesk" },
  });
  logger.info(`Found ${frontDataSources.length} Zendesk data sources`);

  for (const frontDataSource of frontDataSources) {
    await migrateDataSource({
      frontDataSource,
      coreSequelize,
      pattern: "zendesk-ticket-%",
      parentsLength: 2,
      execute,
      logger,
    });
    await migrateDataSource({
      frontDataSource,
      coreSequelize,
      pattern: "zendesk-article-%",
      parentsLength: 3,
      execute,
      logger,
    });
  }
});

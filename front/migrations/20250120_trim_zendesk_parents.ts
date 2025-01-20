import assert from "assert";
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
  execute,
  logger,
}: {
  frontDataSource: DataSourceModel;
  coreSequelize: Sequelize;
  pattern: string;
  execute: boolean;
  logger: typeof Logger;
}) {
  logger.info("MIGRATE");

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

  assert(
    coreDataSourceRows.length === 1 &&
      coreDataSourceRows[0].data_source_id ===
        frontDataSource.dustAPIDataSourceId,
    "Core data source mismatch"
  );
  const coreDataSourceId = coreDataSourceRows[0].id;

  // Loop over all the documents in the data source (can be a big loop).
  let nextId = 0;

  for (;;) {
    const [updatedRows] = (await (async () => {
      if (execute) {
        return coreSequelize.query(
          `UPDATE data_sources_nodes
             SET parents = parents[1:ARRAY_LENGTH(parents, 1) - 1]
             WHERE id IN (
                 SELECT id
                 FROM data_sources_nodes
                 WHERE data_source = :coreDataSourceId
                   AND node_id LIKE :pattern
                   AND id > :nextId
                 ORDER BY timestamp, id
                 LIMIT :batchSize
             )
             RETURNING id;`,
          {
            replacements: {
              nextId,
              coreDataSourceId,
              batchSize: QUERY_BATCH_SIZE,
              pattern,
            },
          }
        );
      }
    })()) as { id: number }[][];

    if (updatedRows.length === 0) {
      logger.info("DONE");
      break;
    }

    logger.info(
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
      execute,
      logger: logger.child({
        dataSourceId: frontDataSource.id,
        connectorProvider: frontDataSource.connectorProvider,
        pattern: "zendesk-ticket-%",
      }),
    });
    await migrateDataSource({
      frontDataSource,
      coreSequelize,
      pattern: "zendesk-article-%",
      execute,
      logger: logger.child({
        dataSourceId: frontDataSource.id,
        connectorProvider: frontDataSource.connectorProvider,
        pattern: "zendesk-article-%",
      }),
    });
  }
});

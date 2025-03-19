import { MIME_TYPES } from "@dust-tt/client";
import assert from "assert";
import type { Sequelize } from "sequelize";
import { QueryTypes } from "sequelize";

import { getCorePrimaryDbConnection } from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const { CORE_DATABASE_URI } = process.env;
const BATCH_SIZE = 16;

async function backfillDataSource(
  frontDataSource: DataSourceModel,
  coreSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing data source");

  let nextId = 0;
  let updatedRowsCount;
  do {
    const rows: { id: number }[] = await coreSequelize.query(
      `
          SELECT dsn.id
          FROM data_sources_nodes dsn
                   JOIN data_sources ds ON ds.id = dsn.data_source
          WHERE dsn.id > :nextId
            AND ds.data_source_id = :dataSourceId
            AND ds.project = :projectId
            AND dsn.node_id LIKE 'zendesk-help-center-%'
          ORDER BY dsn.id
          LIMIT :batchSize;`,
      {
        replacements: {
          dataSourceId: frontDataSource.dustAPIDataSourceId,
          projectId: frontDataSource.dustAPIProjectId,
          batchSize: BATCH_SIZE,
          nextId,
        },
        type: QueryTypes.SELECT,
      }
    );

    if (rows.length == 0) {
      logger.info({ nextId }, `Finished processing data source.`);
      break;
    }
    nextId = rows[rows.length - 1].id;
    updatedRowsCount = rows.length;

    if (execute) {
      await coreSequelize.query(
        `UPDATE data_sources_nodes SET mime_type = :mimeType WHERE id IN (:ids)`,
        {
          replacements: {
            mimeType: MIME_TYPES.ZENDESK.HELP_CENTER,
            ids: rows.map((row) => row.id),
          },
        }
      );
      logger.info(
        `Updated chunk from ${rows[0].id} to ${rows[rows.length - 1].id}`
      );
    } else {
      logger.info(
        `Would update chunk from ${rows[0].id} to ${rows[rows.length - 1].id}`
      );
    }
  } while (updatedRowsCount === BATCH_SIZE);
}

makeScript({}, async ({ execute }, logger) => {
  assert(CORE_DATABASE_URI, "CORE_DATABASE_URI is required");

  const coreSequelize = getCorePrimaryDbConnection();

  const frontDataSources = await DataSourceModel.findAll({
    where: { connectorProvider: "zendesk" },
  });
  logger.info(`Found ${frontDataSources.length} Zendesk data sources`);

  for (const frontDataSource of frontDataSources) {
    await backfillDataSource(
      frontDataSource,
      coreSequelize,
      execute,
      logger.child({
        dataSourceId: frontDataSource.id,
        connectorId: frontDataSource.connectorId,
      })
    );
  }
});

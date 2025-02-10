import { removeNulls } from "@dust-tt/types";
import type { Sequelize } from "sequelize";
import { QueryTypes } from "sequelize";

import { getCorePrimaryDbConnection } from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const BATCH_SIZE = 128;

const encodeTags = (tags: string[]) =>
  `{${tags.map((tag) => `"${tag.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;

async function backfillDataSource(
  frontDataSource: DataSourceModel,
  coreSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing data source");

  // get datasource id from core
  const rows: { id: number }[] = await coreSequelize.query(
    `SELECT id FROM data_sources WHERE data_source_id = :dataSourceId;`,
    {
      replacements: { dataSourceId: frontDataSource.dustAPIDataSourceId },
      type: QueryTypes.SELECT,
    }
  );

  if (rows.length === 0) {
    logger.error(`Data source ${frontDataSource.id} not found in core`);
    return;
  }

  const dataSourceId = rows[0].id;

  await backfillDocuments(
    dataSourceId,
    coreSequelize,
    execute,
    logger.child({ type: "folders" })
  );

  await backfillSpreadsheets(
    dataSourceId,
    coreSequelize,
    execute,
    logger.child({ type: "spreadsheets" })
  );
}

async function backfillSpreadsheets(
  dataSourceId: number,
  coreSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing spreadsheets");

  // processing the spreadsheets chunk by chunk
  let lastId = 0;
  let rows: { id: number; tags_array: string[] }[] = [];

  do {
    // querying connectors for the next batch of spreadsheets

    rows = await coreSequelize.query(
      `SELECT id, "tags_array"
       FROM "tables"
       WHERE id > :lastId
         AND "data_source" = :data_source
         AND "tags_array" IS NOT NULL
         ORDER BY id
       LIMIT :batchSize;`,
      {
        replacements: {
          batchSize: BATCH_SIZE,
          lastId,
          data_source: dataSourceId,
        },
        type: QueryTypes.SELECT,
      }
    );

    if (rows.length === 0) {
      break;
    }
    // reconstructing the URLs and node IDs
    const tableIds = rows.map((row) => row.id);
    const tags = rows.map((row) => encodeTags(row.tags_array));

    if (execute) {
      // updating on core on the nodeIds
      await coreSequelize.query(
        `UPDATE data_sources_nodes
         SET tags_array = CAST(unnest_tags.tags_array AS text[])
         FROM (SELECT unnest(ARRAY [:tableIds]::bigint[]) as table_id,
                      unnest(ARRAY [:tags]::text[][])    as tags_array) unnest_tags
         WHERE data_sources_nodes.data_source = :dataSourceId AND data_sources_nodes.table = unnest_tags.table_id;`,
        { replacements: { tags, tableIds, dataSourceId } }
      );
      logger.info(
        `Updated ${rows.length} spreadsheets from id ${rows[0].id} to id ${rows[rows.length - 1].id}.`
      );
    } else {
      logger.info(
        `Would update ${rows.length} spreadsheets from id ${rows[0].id} to id ${rows[rows.length - 1].id}.`
      );
    }

    lastId = rows[rows.length - 1].id;
  } while (rows.length === BATCH_SIZE);
}

async function backfillDocuments(
  dataSourceId: number,
  coreSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing folders");

  // processing the folders chunk by chunk
  let lastId = 0;
  let rows: {
    id: number;
    tags_array: string[];
  }[] = [];

  do {
    rows = await coreSequelize.query(
      `SELECT id, "tags_array"
       FROM data_sources_documents
       WHERE id > :lastId
         AND "data_source" = :data_source
         AND "tags_array" IS NOT NULL
         AND "status" = 'latest'
       ORDER BY id
       LIMIT :batchSize;`,
      {
        replacements: {
          batchSize: BATCH_SIZE,
          lastId,
          data_source: dataSourceId,
        },
        type: QueryTypes.SELECT,
      }
    );

    if (rows.length === 0) {
      break;
    }

    // reconstructing the URLs and node IDs
    const documentIds = rows.map((row) => row.id);
    const tags = rows.map((row) => encodeTags(row.tags_array));

    if (execute) {
      // updating on core on the nodeIds
      await coreSequelize.query(
        `UPDATE data_sources_nodes
         SET tags_array = CAST(unnest_tags.tags_array AS text[])
         FROM (SELECT unnest(ARRAY[:documentIds]::bigint[]) as document_id,
                      unnest(ARRAY[:tags]::text[]) as tags_array) unnest_tags
         WHERE data_sources_nodes.data_source = :dataSourceId AND data_sources_nodes.document = unnest_tags.document_id;`,
        { replacements: { tags, documentIds, dataSourceId } }
      );
      logger.info(
        `Updated ${rows.length} documents from id ${rows[0].id} to id ${rows[rows.length - 1].id}.`
      );
    } else {
      logger.info(
        `Would update ${rows.length} documents from id ${rows[0].id} to id ${rows[rows.length - 1].id}.`
      );
    }

    lastId = rows[rows.length - 1].id;
  } while (rows.length === BATCH_SIZE);
}

makeScript({}, async ({ execute }, logger) => {
  const coreSequelize = getCorePrimaryDbConnection();
  const frontDataSources = await DataSourceModel.findAll();
  logger.info(`Found ${frontDataSources.length} Google Drive data sources`);

  for (const frontDataSource of frontDataSources) {
    await backfillDataSource(
      frontDataSource,
      coreSequelize,
      execute,
      logger.child({
        dataSourceId: frontDataSource.id,
        connectorId: frontDataSource.connectorId,
        name: frontDataSource.name,
      })
    );
  }
});

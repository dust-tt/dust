import type { Sequelize } from "sequelize";
import { QueryTypes } from "sequelize";

import {
  getConnectorsReplicaDbConnection,
  getCorePrimaryDbConnection,
} from "@app/lib/production_checks/utils";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const BATCH_SIZE = 1024;

async function updateNodes(
  coreSequelize: Sequelize,
  nodeIds: string[],
  urls: string[]
) {
  await coreSequelize.query(
    // No possible mismatch even though some pages are upserted in connectors' db but not as document
    // - unnest preserves array order and creates parallel tuples,
    `UPDATE data_sources_nodes
     SET source_url = urls.url
     FROM (SELECT unnest(ARRAY [:nodeIds]::text[]) as node_id,
                  unnest(ARRAY [:urls]::text[])    as url) urls
     WHERE data_sources_nodes.node_id = urls.node_id;`,
    { replacements: { urls, nodeIds } }
  );
}

// see the call to upsertDataSourceFolder in webcrawler/temporal/activities.ts
async function backfillFolders(
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing folders");

  let lastId = 0;
  let rows: { id: number; internalId: string; url: string }[] = [];

  do {
    rows = await connectorsSequelize.query(
      `SELECT id, "internalId", "url"
       FROM webcrawler_folders
       WHERE id > :lastId
       ORDER BY id
       LIMIT :batchSize;`,
      {
        replacements: { batchSize: BATCH_SIZE, lastId },
        type: QueryTypes.SELECT,
      }
    );

    if (rows.length === 0) {
      break;
    }

    logger.info({ row: rows[0] }, "Sample row.");
    if (execute) {
      await updateNodes(
        coreSequelize,
        rows.map((row) => row.internalId),
        rows.map((row) => row.url)
      );
      logger.info(
        `Updated ${rows.length} folders from id ${rows[0].id} to id ${rows[rows.length - 1].id}.`
      );
    } else {
      logger.info(
        `Would update ${rows.length} folders from id ${rows[0].id} to id ${rows[rows.length - 1].id}.`
      );
    }

    lastId = rows[rows.length - 1].id;
  } while (rows.length === BATCH_SIZE);
}

// see the call to upsertDataSourceDocument in webcrawler/temporal/activities.ts
async function backfillPages(
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing pages");

  let lastId = 0;
  let rows: { id: number; documentId: string; url: string }[] = [];

  do {
    rows = await connectorsSequelize.query(
      `SELECT id, "documentId", "url"
       FROM webcrawler_pages
       WHERE id > :lastId
       ORDER BY id
       LIMIT :batchSize;`,
      {
        replacements: { batchSize: BATCH_SIZE, lastId },
        type: QueryTypes.SELECT,
      }
    );

    if (rows.length === 0) {
      break;
    }

    logger.info({ row: rows[0] }, "Sample row.");
    if (execute) {
      await updateNodes(
        coreSequelize,
        rows.map((row) => row.documentId),
        rows.map((row) => row.url)
      );
      logger.info(
        `Updated ${rows.length} pages from id ${rows[0].id} to id ${rows[rows.length - 1].id}.`
      );
    } else {
      logger.info(
        `Would update ${rows.length} pages from id ${rows[0].id} to id ${rows[rows.length - 1].id}.`
      );
    }

    lastId = rows[rows.length - 1].id;
  } while (rows.length === BATCH_SIZE);
}

makeScript({}, async ({ execute }, logger) => {
  const coreSequelize = getCorePrimaryDbConnection();
  const connectorsSequelize = getConnectorsReplicaDbConnection();

  await backfillFolders(coreSequelize, connectorsSequelize, execute, logger);
  await backfillPages(coreSequelize, connectorsSequelize, execute, logger);
});

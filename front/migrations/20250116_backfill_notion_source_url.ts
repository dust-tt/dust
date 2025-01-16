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
    `UPDATE data_sources_nodes
     SET source_url = urls.url
     FROM (SELECT unnest(ARRAY [:nodeIds]::text[]) as node_id,
                  unnest(ARRAY [:urls]::text[])    as url) urls
     WHERE data_sources_nodes.node_id = urls.node_id;`,
    { replacements: { urls, nodeIds } }
  );
}

async function backfillDatabases(
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing databases");

  let lastId = 0;
  let rows: {
    id: number;
    notionDatabaseId: string;
    notionUrl: string;
    structuredDataUpsertedTs: Date | null;
  }[] = [];

  do {
    rows = await connectorsSequelize.query(
      `SELECT id, "notionDatabaseId", "notionUrl", "structuredDataUpsertedTs"
       FROM notion_databases
       WHERE id > :lastId
       ORDER BY id
       LIMIT :batchSize;`,
      {
        replacements: { batchSize: BATCH_SIZE, lastId },
        type: QueryTypes.SELECT,
      }
    );

    // taken from connectors/migrations/20241030_fix_notion_parents.ts
    // for each database, we upsert documents (not backfilled here) with an id starting in `notion-database-` +
    // if structuredDataEnabled we also upsert a table with an id starting in `notion-`
    const tableRows = rows.filter(
      (row) => row.structuredDataUpsertedTs !== null
    );
    const tableUrls = tableRows.map((row) => row.notionUrl);
    const tableNodeIds = tableRows.map(
      (row) => `notion-${row.notionDatabaseId}`
    );

    if (rows.length === 0) {
      break;
    }

    if (tableRows.length > 0) {
      if (execute) {
        await updateNodes(coreSequelize, tableNodeIds, tableUrls);
        logger.info(
          `Updated ${tableRows.length} databases (tables) from id ${tableRows[0].id} to id ${tableRows[tableRows.length - 1].id}.`
        );
      } else {
        logger.info(
          `Would update ${tableRows.length} databases (tables) from id ${tableRows[0].id} to id ${tableRows[tableRows.length - 1].id}.`
        );
      }
    }

    lastId = rows[rows.length - 1].id;
  } while (rows.length === BATCH_SIZE);
}

makeScript({}, async ({ execute }, logger) => {
  const coreSequelize = getCorePrimaryDbConnection();
  const connectorsSequelize = getConnectorsReplicaDbConnection();

  await backfillDatabases(coreSequelize, connectorsSequelize, execute, logger);
});

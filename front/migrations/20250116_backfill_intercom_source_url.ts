import type { ModelId } from "@dust-tt/types";
import type { Sequelize } from "sequelize";
import { QueryTypes } from "sequelize";

import {
  getConnectorsReplicaDbConnection,
  getCorePrimaryDbConnection,
} from "@app/lib/production_checks/utils";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const BATCH_SIZE = 256;

// Copy-pasted from connectors
function getHelpCenterCollectionInternalId(
  connectorId: ModelId,
  collectionId: string
): string {
  return `intercom-collection-${connectorId}-${collectionId}`;
}

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

async function backfillCollections(
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing collections");

  let nextId = 0;
  let updatedRowsCount;
  do {
    const rows: {
      collectionId: string;
      id: number;
      url: string;
      connectorId: number;
    }[] = await connectorsSequelize.query(
      `
          SELECT ic.id, ic."collectionId", ic."url", ic."connectorId"
          FROM intercom_collections ic
          WHERE ic.id > :nextId
          ORDER BY ic.id
          LIMIT :batchSize;`,
      {
        replacements: {
          batchSize: BATCH_SIZE,
          nextId,
        },
        type: QueryTypes.SELECT,
      }
    );

    if (rows.length == 0) {
      logger.info({ nextId }, `Finished processing collections.`);
      break;
    }
    nextId = rows[rows.length - 1].id;
    updatedRowsCount = rows.length;

    const urls = rows.map((row) => row.url);
    const nodeIds = rows.map((row) => {
      return getHelpCenterCollectionInternalId(
        row.connectorId,
        row.collectionId
      );
    });
    if (execute) {
      await updateNodes(coreSequelize, nodeIds, urls);
      logger.info(`Updated ${rows.length} collections.`);
    } else {
      logger.info(
        `Would update ${rows.length} collections, sample: ${nodeIds.slice(0, 5).join(", ")}, ${urls.slice(0, 5).join(", ")}`
      );
    }
  } while (updatedRowsCount === BATCH_SIZE);
}

makeScript({}, async ({ execute }, logger) => {
  const coreSequelize = getCorePrimaryDbConnection();
  const connectorsSequelize = getConnectorsReplicaDbConnection();

  await backfillCollections(
    coreSequelize,
    connectorsSequelize,
    execute,
    logger
  );
});

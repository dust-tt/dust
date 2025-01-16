import type { Sequelize } from "sequelize";
import { QueryTypes } from "sequelize";

import {
  getConnectorsReplicaDbConnection,
  getCorePrimaryDbConnection,
} from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const BATCH_SIZE = 1024;

// Copy-pasted from connectors/confluence/lib/internal_ids.ts
enum ConfluenceInternalIdPrefix {
  Space = "confluence-space-",
  Page = "confluence-page-",
}

// Copy-pasted from connectors/confluence/lib/internal_ids.ts
export function makeSpaceInternalId(confluenceSpaceId: string) {
  return `${ConfluenceInternalIdPrefix.Space}${confluenceSpaceId}`;
}

// Copy-pasted from connectors/confluence/lib/internal_ids.ts
export function makePageInternalId(confluencePageId: string) {
  return `${ConfluenceInternalIdPrefix.Page}${confluencePageId}`;
}

async function backfillDataSource(
  frontDataSource: DataSourceModel,
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing data source");

  const configurations: { url: string }[] = await connectorsSequelize.query(
    `SELECT "url"
       FROM confluence_configurations
       WHERE "connectorId" = :connectorId
       LIMIT 1;`,
    {
      replacements: { connectorId: frontDataSource.connectorId },
      type: QueryTypes.SELECT,
    }
  );
  const configuration = configurations[0];
  if (!configuration) {
    logger.error("No Confluence configuration found for data source");
    return;
  }

  await backfillSpaces(
    configuration,
    frontDataSource,
    coreSequelize,
    connectorsSequelize,
    execute,
    logger.child({
      configuration,
      projectId: frontDataSource.dustAPIProjectId,
      dataSourceId: frontDataSource.dustAPIDataSourceId,
    })
  );
}

async function backfillSpaces(
  configuration: { url: string },
  frontDataSource: DataSourceModel,
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing spaces");

  // processing the spaces chunk by chunk
  let lastId = 0;
  let rows: { id: number; urlSuffix: string; spaceId: string }[] = [];

  do {
    // querying connectors for the next batch of spaces
    rows = await connectorsSequelize.query(
      `SELECT id, "urlSuffix", "spaceId"
       FROM confluence_spaces
       WHERE id > :lastId
         AND "connectorId" = :connectorId
       ORDER BY id
       LIMIT :batchSize;`,
      {
        replacements: {
          batchSize: BATCH_SIZE,
          lastId,
          connectorId: frontDataSource.connectorId,
        },
        type: QueryTypes.SELECT,
      }
    );

    if (rows.length === 0) {
      break;
    }

    // reconstructing the URLs and node IDs
    const urls = rows.map(
      (row) => `${configuration.url}/wiki${row.urlSuffix}` // taken from getConfluenceSpaceUrl in connectors/confluence/lib/permissions.ts
    );
    const nodeIds = rows.map((row) => makeSpaceInternalId(row.spaceId));

    if (execute) {
      // updating on core on the nodeIds
      await coreSequelize.query(
        `UPDATE data_sources_nodes
         SET source_url = urls.url
         FROM (SELECT unnest(ARRAY [:nodeIds]::text[]) as node_id,
                      unnest(ARRAY [:urls]::text[])    as url) urls
         WHERE data_sources_nodes.node_id = urls.node_id;`,
        { replacements: { urls, nodeIds } }
      );
      logger.info(
        `Updated ${rows.length} spaces from id ${rows[0].id} to id ${rows[rows.length - 1].id}.`
      );
    } else {
      logger.info(
        `Would update ${rows.length} spaces from id ${rows[0].id} to id ${rows[rows.length - 1].id}.`
      );
    }

    lastId = rows[rows.length - 1].id;
  } while (rows.length === BATCH_SIZE);
}

makeScript({}, async ({ execute }, logger) => {
  const coreSequelize = getCorePrimaryDbConnection();
  const connectorsSequelize = getConnectorsReplicaDbConnection();

  const frontDataSources = await DataSourceModel.findAll({
    where: { connectorProvider: "confluence" },
  });
  logger.info(`Found ${frontDataSources.length} Confluence data sources`);

  for (const frontDataSource of frontDataSources) {
    await backfillDataSource(
      frontDataSource,
      coreSequelize,
      connectorsSequelize,
      execute,
      logger.child({
        dataSourceId: frontDataSource.id,
        connectorId: frontDataSource.connectorId,
      })
    );
  }
});

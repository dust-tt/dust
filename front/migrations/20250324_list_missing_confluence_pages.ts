import type { Sequelize } from "sequelize";
import { QueryTypes } from "sequelize";

import config from "@app/lib/api/config";
import { getConnectorsReplicaDbConnection } from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { CoreAPI } from "@app/types";

const BATCH_SIZE = 256;

// Copy-pasted from connectors/confluence/lib/internal_ids.ts
export function makePageInternalId(confluencePageId: string) {
  return `confluence-page-${confluencePageId}`;
}

async function backfillDataSource({
  coreAPI,
  connectorsSequelize,
  frontDataSource,
  execute,
  parentLogger,
}: {
  coreAPI: CoreAPI;
  connectorsSequelize: Sequelize;
  frontDataSource: DataSourceModel;
  execute: boolean;
  parentLogger: typeof Logger;
}) {
  const logger = parentLogger.child({
    connectorId: frontDataSource.connectorId,
  });
  logger.info("Processing data source.");

  let nextId = 0;
  let rowsCount;
  do {
    const confluencePages = (await connectorsSequelize.query(
      `SELECT id, "pageId"
       FROM confluence_pages
       WHERE "connectorId" = :connectorId
         AND id > :nextId
       ORDER BY id LIMIT :batchSize;`,
      {
        replacements: {
          connectorId: frontDataSource.connectorId,
          nextId,
          batchSize: BATCH_SIZE,
        },
        type: QueryTypes.SELECT,
      }
    )) as { id: number; pageId: string }[];
    rowsCount = confluencePages.length;

    if (rowsCount === 0) {
      break;
    }
    logger.info(`Found ${rowsCount} Confluence pages.`);

    const connectorsNodeIds = confluencePages.map((page) =>
      makePageInternalId(page.pageId)
    );
    if (execute) {
      const searchRes = await coreAPI.searchNodes({
        filter: {
          data_source_views: [
            {
              data_source_id: frontDataSource.dustAPIDataSourceId,
              view_filter: [],
            },
          ],
          node_ids: connectorsNodeIds,
        },
      });
      if (searchRes.isErr()) {
        throw searchRes.error;
      }

      const coreNodeIds = searchRes.value.nodes.map((node) => node.node_id);
      for (const nodeId of coreNodeIds) {
        if (coreNodeIds.includes(nodeId)) {
          logger.info({ nodeId }, "Missing");
        }
      }
    }

    nextId = confluencePages[confluencePages.length - 1].id;
  } while (rowsCount === BATCH_SIZE);
}

makeScript({}, async ({ execute }, logger) => {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const connectorsSequelize = getConnectorsReplicaDbConnection();

  const frontDataSources = await DataSourceModel.findAll({
    where: { connectorProvider: "confluence" },
  });
  for (const frontDataSource of frontDataSources) {
    await backfillDataSource({
      coreAPI,
      connectorsSequelize,
      frontDataSource,
      execute,
      parentLogger: logger,
    });
  }
});

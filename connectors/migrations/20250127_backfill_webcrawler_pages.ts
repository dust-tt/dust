import { concurrentExecutor } from "@dust-tt/types";
import { makeScript } from "scripts/helpers";

import { getParentsForPage } from "@connectors/connectors/webcrawler/lib/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  deleteDataSourceFolder,
  updateDataSourceDocumentParents,
} from "@connectors/lib/data_sources";
import {
  WebCrawlerFolder,
  WebCrawlerPage,
} from "@connectors/lib/models/webcrawler";
import type Logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

const CONCURRENCY = 8;

async function deleteFolders(
  connector: ConnectorResource,
  execute: boolean,
  logger: typeof Logger
) {
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const folders = await WebCrawlerFolder.findAll({
    where: { connectorId: connector.id },
  });

  await concurrentExecutor(
    folders,
    async (folder) => {
      logger.info(
        {
          folderId: folder.internalId,
          folderUrl: folder.url,
          connectorId: connector.id,
        },
        "DELETE"
      );
      if (execute) {
        await deleteDataSourceFolder({
          dataSourceConfig,
          folderId: folder.internalId,
        });
      }
    },
    { concurrency: CONCURRENCY }
  );
}

async function updatePageParents(
  connector: ConnectorResource,
  execute: boolean,
  logger: typeof Logger
) {
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const pages = await WebCrawlerPage.findAll({
    where: { connectorId: connector.id },
  });

  await concurrentExecutor(
    pages,
    async (page) => {
      const parents = getParentsForPage(page.url, false);
      logger.info(
        {
          connectorId: connector.id,
          documentId: page.documentId,
          pageUrl: page.url,
          parents,
        },
        "UPDATE PARENTS"
      );
      if (execute) {
        await updateDataSourceDocumentParents({
          dataSourceConfig,
          documentId: page.documentId,
          parents,
          parentId: parents[1] || null,
        });
      }
    },
    { concurrency: CONCURRENCY }
  );
}

async function migrateConnector(
  connector: ConnectorResource,
  execute: boolean,
  logger: typeof Logger
) {
  await deleteFolders(connector, execute, logger);
  await updatePageParents(connector, execute, logger);
}

makeScript(
  {
    nextConnectorId: { type: "number", default: 0 },
    connectorId: { type: "number", default: 0 },
  },
  async ({ execute, nextConnectorId }, logger) => {
    logger.info({ nextConnectorId }, "Starting backfill");

    const connectors = await ConnectorResource.listByType("webcrawler", {});

    // sort connectors by id and start from nextConnectorId
    const sortedConnectors = connectors
      .sort((a, b) => a.id - b.id)
      .filter((_, idx) => idx >= nextConnectorId);

    for (const connector of sortedConnectors) {
      await migrateConnector(connector, execute, logger);
    }
  }
);

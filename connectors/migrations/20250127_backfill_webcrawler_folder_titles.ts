import assert from "node:assert";

import _ from "lodash";
import { makeScript } from "scripts/helpers";

import { getDisplayNameForFolder } from "@connectors/connectors/webcrawler/lib/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { WebCrawlerFolder } from "@connectors/lib/models/webcrawler";
import type Logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { concurrentExecutor, MIME_TYPES } from "@connectors/types";

async function migrateConnector(
  connector: ConnectorResource,
  execute: boolean,
  parentLogger: typeof Logger
) {
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const connectorId = connector.id;
  const logger = parentLogger.child({ connectorId });

  logger.info("MIGRATE");

  const folders = await WebCrawlerFolder.findAll({
    where: { connectorId },
  });

  const foldersByUrl = _.keyBy(folders, "url");

  const getParents = (folder: WebCrawlerFolder): string[] => {
    assert(
      folder.parentUrl === null || foldersByUrl[folder.parentUrl],
      "Parent folder not found"
    );
    const parentFolder = folder.parentUrl
      ? foldersByUrl[folder.parentUrl]
      : null;
    return [
      folder.internalId,
      ...(parentFolder ? getParents(parentFolder) : []),
    ];
  };
  await concurrentExecutor(
    folders,
    async (folder) => {
      logger.info({
        folderId: folder.internalId,
        folderUrl: folder.url,
      });
      if (execute) {
        const parents = getParents(folder);
        await upsertDataSourceFolder({
          dataSourceConfig,
          folderId: folder.internalId,
          timestampMs: folder.updatedAt.getTime(),
          parents,
          parentId: parents[1] || null,
          title: getDisplayNameForFolder(folder),
          mimeType: MIME_TYPES.WEBCRAWLER.FOLDER,
        });
      }
    },
    { concurrency: 8 }
  );
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

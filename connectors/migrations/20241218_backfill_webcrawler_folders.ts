import assert from "node:assert";

import _ from "lodash";
import { makeScript } from "scripts/helpers";

import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { WebCrawlerFolder } from "@connectors/lib/models/webcrawler";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { concurrentExecutor } from "@connectors/types";

makeScript(
  {
    nextConnectorId: {
      type: "number",
      required: false,
      default: 0,
    },
    connectorId: {
      type: "number",
      required: false,
      default: 0,
    },
  },
  async ({ execute, nextConnectorId }, logger) => {
    logger.info(
      {
        nextConnectorId,
      },
      "Starting backfill"
    );

    const connectors = await ConnectorResource.listByType("webcrawler", {});

    // sort connectors by id and start from nextConnectorId
    const sortedConnectors = connectors
      .sort((a, b) => a.id - b.id)
      .filter((_, idx) => idx >= nextConnectorId);

    for (const connector of sortedConnectors) {
      const dataSourceConfig = dataSourceConfigFromConnector(connector);
      const connectorId = connector.id;
      logger.info(
        {
          connectorId,
        },
        "Starting connector backfill"
      );
      const folders = await WebCrawlerFolder.findAll({
        where: {
          connectorId,
        },
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
            execute,
          });
          if (execute) {
            const parents = getParents(folder);
            const result = await upsertDataSourceFolder({
              dataSourceConfig,
              folderId: folder.internalId,
              timestampMs: folder.updatedAt.getTime(),
              parents,
              parentId: parents[1] || null,
              title: folder.url,
              mimeType: "application/vnd.dust.webcrawler.folder",
            });
            logger.info({
              result,
              folderId: folder.internalId,
              folderUrl: folder.url,
            });
          }
        },
        { concurrency: 8 }
      );
    }
  }
);

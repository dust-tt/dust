import { makeScript } from "scripts/helpers";

import { getParents } from "@connectors/connectors/microsoft/temporal/file";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { MicrosoftNodeModel } from "@connectors/lib/models/microsoft";
import type { Logger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { MicrosoftNodeResource } from "@connectors/resources/microsoft_resource";
import { concurrentExecutor, INTERNAL_MIME_TYPES } from "@connectors/types";

async function backfillConnector(
  connector: ConnectorResource,
  execute: boolean,
  parentLogger: Logger
) {
  const startSyncTs = Date.now();
  const logger = parentLogger.child({
    connectorId: connector.id,
    execute,
  });
  logger.info("Starting backfill");

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const folders = await MicrosoftNodeModel.findAll({
    where: {
      connectorId: connector.id,
      nodeType: "folder",
    },
    attributes: ["internalId"],
  });

  const result = await concurrentExecutor(
    folders,
    async (folder): Promise<number> => {
      const folderResource = await MicrosoftNodeResource.fetchByInternalId(
        connector.id,
        folder.internalId
      );
      if (!folderResource) {
        throw new Error(
          "Unexpected error fetching folder resource from folder model"
        );
      }
      const parents = await getParents({
        connectorId: connector.id,
        internalId: folderResource.internalId,
        startSyncTs,
      });
      if (execute) {
        await upsertDataSourceFolder({
          dataSourceConfig,
          folderId: folderResource.internalId,
          title: folderResource.name ?? "Untitled folder",
          parents,
          parentId: parents[1] ?? null,
          mimeType: INTERNAL_MIME_TYPES.MICROSOFT.FOLDER,
          sourceUrl: folderResource.webUrl ?? undefined,
        });
      }
      return 1;
    },
    { concurrency: 4 }
  );
  return {
    upserted: result.reduce((acc, curr) => acc + curr, 0),
    notFound: result.filter((r) => r === 0).length,
    total: folders.length,
  };
}

makeScript(
  {
    startId: { type: "number", demandOption: false },
  },
  async ({ execute, startId }, logger) => {
    logger.info("Starting backfill");
    const connectors = await ConnectorResource.listByType("microsoft", {});
    // sort connectors by id
    connectors.sort((a, b) => a.id - b.id);
    // start from startId if provided
    const startIndex = startId
      ? connectors.findIndex((c) => c.id === startId)
      : 0;
    if (startIndex === -1) {
      throw new Error(`Connector with id ${startId} not found`);
    }
    const slicedConnectors = connectors.slice(startIndex);
    for (const connector of slicedConnectors) {
      const result = await backfillConnector(connector, execute, logger);
      logger.info(
        { connectorId: connector.id, result, execute },
        "Backfilled connector"
      );
    }
  }
);

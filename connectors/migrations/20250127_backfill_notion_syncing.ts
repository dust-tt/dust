import { makeScript } from "scripts/helpers";

import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

makeScript({}, async ({ execute }, logger) => {
  const connectors = await ConnectorResource.listByType("notion", {});
  logger.info(`Found ${connectors.length} connectors`);

  await concurrentExecutor(
    connectors,
    async (connector) => {
      const folderId = `notion-syncing`;
      if (execute) {
        await upsertDataSourceFolder({
          dataSourceConfig: dataSourceConfigFromConnector(connector),
          folderId,
          parents: [folderId],
          parentId: null,
          title: "Syncing",
          mimeType: INTERNAL_MIME_TYPES.NOTION.SYNCING_FOLDER,
        });
        logger.info(
          `Upserted folder ${folderId} for connector ${connector.id}`
        );
      } else {
        logger.info(
          `Would upsert folder ${folderId} for connector ${connector.id}`
        );
      }
    },
    { concurrency: 10 }
  );
});

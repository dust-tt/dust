import { makeScript } from "scripts/helpers";

import { getSharedWithMeFolderId } from "@connectors/connectors/google_drive/lib/hierarchy";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { ConnectorResource } from "@connectors/resources/connector_resource";

makeScript({}, async ({ execute }, logger) => {
  const connectors = await ConnectorResource.listByType("google_drive", {});

  await concurrentExecutor(
    connectors,
    async (connector) => {
      // this is a strict copy-paste of upsertSharedWithMeFolder, I don't want to export it for a migration script and want the folderId for logging purposes
      const dataSourceConfig = dataSourceConfigFromConnector(connector);
      const folderId = getSharedWithMeFolderId(dataSourceConfig);

      if (execute) {
        await upsertDataSourceFolder({
          dataSourceConfig,
          folderId,
          parents: [folderId],
          parentId: null,
          title: "Shared with me",
          mimeType: "application/vnd.dust.googledrive.folder",
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

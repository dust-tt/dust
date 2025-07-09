import { makeScript } from "scripts/helpers";

import {
  GOOGLE_DRIVE_SHARED_WITH_ME_VIRTUAL_ID,
  GOOGLE_DRIVE_SHARED_WITH_ME_WEB_URL,
} from "@connectors/connectors/google_drive/lib/consts";
import { getInternalId } from "@connectors/connectors/google_drive/temporal/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

makeScript({}, async ({ execute }, logger) => {
  const connectors = await ConnectorResource.listByType("google_drive", {});

  await concurrentExecutor(
    connectors,
    async (connector) => {
      const folderId = getInternalId(GOOGLE_DRIVE_SHARED_WITH_ME_VIRTUAL_ID);
      if (execute) {
        await upsertDataSourceFolder({
          dataSourceConfig: dataSourceConfigFromConnector(connector),
          folderId,
          parents: [folderId],
          parentId: null,
          title: "Shared with me",
          mimeType: INTERNAL_MIME_TYPES.GOOGLE_DRIVE.SHARED_WITH_ME,
          sourceUrl: GOOGLE_DRIVE_SHARED_WITH_ME_WEB_URL,
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

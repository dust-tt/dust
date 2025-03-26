// Copied from migrations/20241218_backfill_notion_unkown.ts with != mimetype
import { makeScript } from "scripts/helpers";

import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

makeScript({}, async ({ execute }, logger) => {
  const connectors = await ConnectorResource.listByType("notion", {});

  await concurrentExecutor(
    connectors,
    async (connector) => {
      const folderId = `notion-unknown`;
      if (execute) {
        await upsertDataSourceFolder({
          dataSourceConfig: dataSourceConfigFromConnector(connector),
          folderId,
          parents: [folderId],
          parentId: null,
          title: "Orphaned Resources",
          mimeType: INTERNAL_MIME_TYPES.NOTION.UNKNOWN_FOLDER,
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

import { makeScript } from "scripts/helpers";

import { getSourceUrlForGoogleDriveFiles } from "@connectors/connectors/google_drive";
import { getGoogleDriveObject } from "@connectors/connectors/google_drive/lib/google_drive_api";
import { getFileParentsMemoized } from "@connectors/connectors/google_drive/lib/hierarchy";
import {
  getAuthObject,
  getInternalId,
} from "@connectors/connectors/google_drive/temporal/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { GoogleDriveFiles } from "@connectors/lib/models/google_drive";
import type { Logger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

const DRIVE_CONCURRENCY = 10;

async function upsertFoldersForConnector(
  connector: ConnectorResource,
  execute: boolean,
  logger: Logger
) {
  logger.info(`Processing Spreadsheets for connector ${connector.id}`);

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const spreadsheetMimeType = "application/vnd.google-apps.spreadsheet";
  const spreadsheets = await GoogleDriveFiles.findAll({
    where: {
      connectorId: connector.id,
      mimeType: spreadsheetMimeType,
    },
  });

  if (!spreadsheets || spreadsheets.length === 0) {
    logger.info(`No spreadsheets found for connector ${connector.id}`);
    return;
  }

  // Upsert spreadsheets as folders
  const startSyncTs = new Date().getTime();
  await concurrentExecutor(
    spreadsheets,
    async (spreadsheet) => {
      const { connectorId, driveFileId } = spreadsheet;
      const authCredentials = await getAuthObject(connector.connectionId);
      const driveSpreadsheet = await getGoogleDriveObject(
        authCredentials,
        driveFileId
      );
      if (!driveSpreadsheet) {
        logger.error(`Spreadsheet ${driveFileId} not found`);
        return;
      }
      const parentGoogleIds = await getFileParentsMemoized(
        connectorId,
        authCredentials,
        driveSpreadsheet,
        startSyncTs
      );
      const parents = parentGoogleIds.map((parent) => getInternalId(parent));
      if (execute) {
        await upsertDataSourceFolder({
          dataSourceConfig,
          folderId: getInternalId(driveSpreadsheet.id),
          parents,
          parentId: parents[1] || null,
          title: spreadsheet.name,
          mimeType: "application/vnd.google-apps.spreadsheet",
          sourceUrl: getSourceUrlForGoogleDriveFiles(driveSpreadsheet),
        });
        logger.info(
          `Upserted spreadsheet folder ${getInternalId(driveSpreadsheet.id)} for ${spreadsheet.name}`
        );
      } else {
        logger.info(
          `Would upsert spreadsheet folder ${getInternalId(driveSpreadsheet.id)} for ${spreadsheet.name}`
        );
      }
    },
    { concurrency: DRIVE_CONCURRENCY }
  );
}

makeScript({}, async ({ execute }, logger) => {
  // We only have 469 of them, so we can just do them all
  const connectors = await ConnectorResource.listByType("google_drive", {});
  for (const connector of connectors) {
    await upsertFoldersForConnector(connector, execute, logger);
  }
});

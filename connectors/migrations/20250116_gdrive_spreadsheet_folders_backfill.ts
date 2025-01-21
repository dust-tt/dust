import { MIME_TYPES } from "@dust-tt/types";
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
  const loggerForConnector = logger.child({ connectorId: connector.id });
  loggerForConnector.info("Processing Spreadsheets");

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const spreadsheetMimeType = "application/vnd.google-apps.spreadsheet";
  // The 5 connectors with the most spreadsheets: 35k, 20k, 13k, 8k, 7k -> No need fo batching
  const spreadsheets = await GoogleDriveFiles.findAll({
    where: {
      connectorId: connector.id,
      mimeType: spreadsheetMimeType,
    },
  });

  if (!spreadsheets || spreadsheets.length === 0) {
    loggerForConnector.info("No spreadsheets found");
    return;
  }

  // Upsert spreadsheets as folders
  const startSyncTs = new Date().getTime();
  const authCredentials = await getAuthObject(connector.connectionId);

  await concurrentExecutor(
    spreadsheets,
    async (spreadsheet) => {
      const { connectorId, driveFileId } = spreadsheet;
      const driveSpreadsheet = await getGoogleDriveObject(
        authCredentials,
        driveFileId
      );
      if (!driveSpreadsheet) {
        loggerForConnector.error("Spreadsheet not found");
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
          mimeType: MIME_TYPES.GOOGLE_DRIVE.SPREADSHEET,
          sourceUrl: getSourceUrlForGoogleDriveFiles(driveSpreadsheet),
        });
        loggerForConnector.info(
          `Upserted spreadsheet folder ${getInternalId(driveSpreadsheet.id)} for ${spreadsheet.name}`
        );
      } else {
        loggerForConnector.info(
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

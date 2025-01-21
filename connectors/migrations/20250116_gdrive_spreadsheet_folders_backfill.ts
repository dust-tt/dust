import { MIME_TYPES } from "@dust-tt/types";
import { makeScript } from "scripts/helpers";
import { v4 as uuidv4 } from "uuid";

import { getLocalParents } from "@connectors/connectors/google_drive/lib";
import { getInternalId } from "@connectors/connectors/google_drive/temporal/utils";
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
  const localLogger = logger.child({ connectorId: connector.id });
  localLogger.info("Processing Spreadsheets");

  // generating a memoization key for the duration of the backfill
  const memo = uuidv4();

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const spreadsheetMimeType = "application/vnd.google-apps.spreadsheet";
  // The 5 connectors with the most spreadsheets: 35k, 20k, 13k, 8k, 7k -> no need for batching
  const spreadsheets = await GoogleDriveFiles.findAll({
    where: {
      connectorId: connector.id,
      mimeType: spreadsheetMimeType,
    },
  });

  if (spreadsheets.length === 0) {
    localLogger.info("No spreadsheet found");
    return;
  }

  // Upsert spreadsheets as folders
  await concurrentExecutor(
    spreadsheets,
    async (spreadsheet) => {
      const { connectorId, driveFileId, name: spreadsheetName } = spreadsheet;
      // getLocalParents returns internal IDs
      const parents = await getLocalParents(connectorId, driveFileId, memo);
      if (execute) {
        await upsertDataSourceFolder({
          dataSourceConfig,
          folderId: getInternalId(driveFileId),
          parents,
          parentId: parents[1] || null,
          title: spreadsheetName,
          mimeType: MIME_TYPES.GOOGLE_DRIVE.SPREADSHEET,
          sourceUrl: getSourceUrlForGoogleDriveSheet(driveFileId),
        });
        localLogger.info(
          `Upserted spreadsheet folder ${getInternalId(driveFileId)} for ${spreadsheetName}`
        );
      } else {
        localLogger.info(
          `Would upsert spreadsheet folder ${getInternalId(driveFileId)} for ${spreadsheetName}`
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

// Copy-pasted from the migration script for source URLs
function getSourceUrlForGoogleDriveSheet(driveFileId: string): string {
  return `https://docs.google.com/spreadsheets/d/${driveFileId}/edit`;
}

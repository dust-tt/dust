import {
  concurrentExecutor,
  getGoogleSheetTableId,
  MIME_TYPES,
} from "@dust-tt/types";
import type { LoggerOptions } from "pino";
import type pino from "pino";
import { makeScript } from "scripts/helpers";

import { getSourceUrlForGoogleDriveFiles } from "@connectors/connectors/google_drive";
import { getLocalParents } from "@connectors/connectors/google_drive/lib";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  updateDataSourceDocumentParents,
  updateDataSourceTableParents,
  upsertDataSourceFolder,
} from "@connectors/lib/data_sources";
import {
  GoogleDriveFiles,
  GoogleDriveSheet,
} from "@connectors/lib/models/google_drive";
import { ConnectorResource } from "@connectors/resources/connector_resource";

async function migrateConnector(
  connector: ConnectorResource,
  execute: boolean,
  parentLogger: pino.Logger<LoggerOptions & pino.ChildLoggerOptions>
) {
  const logger = parentLogger.child({ connectorId: connector.id });
  logger.info("Starting migration");

  const files = await GoogleDriveFiles.findAll({
    where: {
      connectorId: connector.id,
    },
  });

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const startTimeTs = new Date().getTime();

  // update using front API to update both elasticsearch and postgres
  await concurrentExecutor(
    files,
    async (file) => {
      const parents = await getLocalParents(
        connector.id,
        file.dustFileId,
        `${connector.id}:${startTimeTs}:migrate_parents`
      );
      if (execute) {
        // check if file is a folder
        if (
          file.mimeType === "application/vnd.google-apps.folder" ||
          file.mimeType === "application/vnd.google-apps.spreadsheet"
        ) {
          await upsertDataSourceFolder({
            dataSourceConfig,
            folderId: file.dustFileId,
            parents,
            parentId: parents[1] || null,
            title: file.name,
            mimeType:
              file.mimeType === "application/vnd.google-apps.folder"
                ? MIME_TYPES.GOOGLE_DRIVE.FOLDER
                : MIME_TYPES.GOOGLE_DRIVE.SPREADSHEET,
            sourceUrl: getSourceUrlForGoogleDriveFiles(file),
          });
        } else {
          await updateDataSourceDocumentParents({
            dataSourceConfig,
            documentId: file.dustFileId,
            parents,
            parentId: parents[1] || null,
          });
        }
      }
    },
    { concurrency: 32 }
  );

  if (execute) {
    logger.info({ numberOfFiles: files.length }, "Migrated files");
  } else {
    logger.info({ numberOfFiles: files.length }, "Migrated files (dry run)");
  }

  const sheets = await GoogleDriveSheet.findAll({
    where: {
      connectorId: connector.id,
    },
  });

  await concurrentExecutor(
    sheets,
    async (sheet) => {
      const parents = await getLocalParents(
        connector.id,
        getGoogleSheetTableId(sheet.driveFileId, sheet.driveSheetId),
        `${connector.id}:${startTimeTs}:migrate_parents`
      );
      if (execute) {
        await updateDataSourceTableParents({
          dataSourceConfig,
          tableId: getGoogleSheetTableId(sheet.driveFileId, sheet.driveSheetId),
          parents,
          parentId: parents[1] || null,
        });
      }
    },
    { concurrency: 32 }
  );

  if (execute) {
    logger.info({ numberOfSheets: sheets.length }, "Migrated sheets");
  } else {
    logger.info({ numberOfSheets: sheets.length }, "Migrated sheets (dry run)");
  }
}

makeScript({}, async ({ execute }, logger) => {
  const connectors = await ConnectorResource.listByType("google_drive", {});

  for (const connector of connectors) {
    await migrateConnector(connector, execute, logger);
  }
});

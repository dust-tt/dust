import _ from "lodash";
import { makeScript } from "scripts/helpers";

import { getSourceUrlForGoogleDriveFiles } from "@connectors/connectors/google_drive";
import { getLocalParents } from "@connectors/connectors/google_drive/lib";
import { getInternalId } from "@connectors/connectors/google_drive/temporal/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  updateDataSourceDocumentParents,
  updateDataSourceTableParents,
  upsertDataSourceFolder,
} from "@connectors/lib/data_sources";
import {
  GoogleDriveFiles,
  GoogleDriveFolders,
  GoogleDriveSheet,
} from "@connectors/lib/models/google_drive";
import type { Logger } from "@connectors/logger/logger";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types";
import {
  concurrentExecutor,
  getGoogleSheetTableId,
  INTERNAL_MIME_TYPES,
} from "@connectors/types";

async function migrateConnector(
  connector: ConnectorResource,
  execute: boolean,
  parentLogger: Logger
) {
  const logger = parentLogger.child({ connectorId: connector.id });
  logger.info("Starting migration");

  const files = await GoogleDriveFiles.findAll({
    where: {
      connectorId: connector.id,
    },
  });

  const roots = await GoogleDriveFolders.findAll({
    where: {
      connectorId: connector.id,
    },
  });

  // isolate roots that are drives
  // no need to update parents for anything whose parent is a drive
  const driveRoots = roots
    .filter(
      (root) => root.folderId.startsWith("0A") && root.folderId.length < 27
    )
    .map((root) => getInternalId(root.folderId));

  logger.info({ driveRoots }, "Excluded drive roots");
  logger.info({ numberOfFiles: files.length }, "Found files");

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const startTimeTs = new Date().getTime();

  const chunks = _.chunk(files, 1024);

  let totalProcessed = 0;
  for (const chunk of chunks) {
    const result = await processFilesBatch({
      connector,
      dataSourceConfig,
      files: chunk,
      execute,
      startTimeTs,
      driveRoots,
    });
    totalProcessed += result;
    logger.info(
      { numberOfFiles: result, execute, batchSize: chunk.length },
      "Processed files batch"
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  logger.info({ totalProcessed }, "Files: total processed");
  const sheets = await GoogleDriveSheet.findAll({
    where: {
      connectorId: connector.id,
    },
  });

  const sheetsChunks = _.chunk(sheets, 1024);
  totalProcessed = 0;
  for (const chunk of sheetsChunks) {
    const result = await processSheetsBatch({
      connector,
      dataSourceConfig,
      sheets: chunk,
      execute,
      startTimeTs,
      driveRoots,
    });
    totalProcessed += result;
    logger.info(
      { numberOfSheets: result, execute, batchSize: chunk.length },
      "Processed sheets batch"
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  logger.info({ totalProcessed }, "Sheets: total processed");
}

async function processFilesBatch({
  connector,
  dataSourceConfig,
  files,
  execute,
  startTimeTs,
  driveRoots,
}: {
  connector: ConnectorResource;
  dataSourceConfig: DataSourceConfig;
  files: GoogleDriveFiles[];
  execute: boolean;
  startTimeTs: number;
  driveRoots: string[];
}) {
  // update using front API to update both elasticsearch and postgres
  const result: number[] = await concurrentExecutor(
    files,
    async (file): Promise<number> => {
      const parents = await getLocalParents(
        connector.id,
        file.dustFileId,
        `${connector.id}:${startTimeTs}:migrate_parents`
      );
      if (!parents[0]) {
        logger.error(
          { fileId: file.dustFileId },
          "Unexpected error: no parent found"
        );
        throw new Error("Unexpected error: no parent found");
      }
      const topParent = parents[parents.length - 1];
      if (topParent && driveRoots.includes(topParent)) {
        return 0;
      }
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
                ? INTERNAL_MIME_TYPES.GOOGLE_DRIVE.FOLDER
                : INTERNAL_MIME_TYPES.GOOGLE_DRIVE.SPREADSHEET,
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
      return 1;
    },
    { concurrency: 4 }
  );
  return result.reduce((acc, curr) => acc + curr, 0);
}

async function processSheetsBatch({
  connector,
  dataSourceConfig,
  sheets,
  execute,
  startTimeTs,
  driveRoots,
}: {
  connector: ConnectorResource;
  dataSourceConfig: DataSourceConfig;
  sheets: GoogleDriveSheet[];
  execute: boolean;
  startTimeTs: number;
  driveRoots: string[];
}) {
  const result: number[] = await concurrentExecutor(
    sheets,
    async (sheet): Promise<number> => {
      const parents = await getLocalParents(
        connector.id,
        getGoogleSheetTableId(sheet.driveFileId, sheet.driveSheetId),
        `${connector.id}:${startTimeTs}:migrate_parents`
      );
      if (!parents[0]) {
        throw new Error("Unexpected error: no parent found");
      }
      const topParent = parents[parents.length - 1];
      if (topParent && driveRoots.includes(topParent)) {
        return 0;
      }
      if (execute) {
        try {
          await updateDataSourceTableParents({
            dataSourceConfig,
            tableId: getGoogleSheetTableId(
              sheet.driveFileId,
              sheet.driveSheetId
            ),
            parents,
            parentId: parents[1] || null,
          });
        } catch (e) {
          logger.error({ error: e }, "Sheet backfill issue");
        }
      }
      return 1;
    },
    { concurrency: 4 }
  );
  return result.reduce((acc, curr) => acc + curr, 0);
}

makeScript(
  {
    startId: { type: "number", demandOption: false },
  },
  async ({ execute, startId }, logger) => {
    logger.info("Starting backfill");
    const connectors = await ConnectorResource.listByType("google_drive", {});
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
      await migrateConnector(connector, execute, logger);
      logger.info({ connectorId: connector.id }, "Backfilled connector");
    }
  }
);

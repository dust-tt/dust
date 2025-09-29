import tracer from "dd-trace";
import type { OAuth2Client } from "googleapis-common";

import { syncOneFileTable } from "@connectors/connectors/google_drive/temporal/file/sync_one_file_table";
import { syncOneFileTextDocument } from "@connectors/connectors/google_drive/temporal/file/sync_one_file_text_document";
import { isTableFile } from "@connectors/connectors/google_drive/temporal/mime_types";
import { getInternalId } from "@connectors/connectors/google_drive/temporal/utils";
import {
  MAX_DOCUMENT_TXT_LEN,
  MAX_FILE_SIZE_TO_DOWNLOAD,
  MAX_LARGE_DOCUMENT_TXT_LEN,
} from "@connectors/lib/data_sources";
import {
  GoogleDriveConfig,
  GoogleDriveFiles,
} from "@connectors/lib/models/google_drive";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type {
  DataSourceConfig,
  GoogleDriveObjectType,
  ModelId,
} from "@connectors/types";

export async function syncOneFile(
  connectorId: ModelId,
  oauth2client: OAuth2Client,
  dataSourceConfig: DataSourceConfig,
  file: GoogleDriveObjectType,
  startSyncTs: number,
  isBatchSync = false
): Promise<boolean> {
  return tracer.trace(
    "gdrive",
    {
      resource: "syncOneFile",
    },
    async (span) => {
      span?.setTag("connectorId", connectorId);
      span?.setTag("fileId", file.id);
      span?.setTag("workspaceId", dataSourceConfig.workspaceId);

      const connector = await ConnectorResource.fetchById(connectorId);
      if (!connector) {
        throw new Error(`Connector ${connectorId} not found`);
      }
      const config = await GoogleDriveConfig.findOne({
        where: {
          connectorId,
        },
      });

      const documentId = getInternalId(file.id);
      const fileInDb = await GoogleDriveFiles.findOne({
        where: { connectorId, driveFileId: file.id },
      });

      const localLogger = logger.child({
        provider: "google_drive",
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
        connectorId,
        documentId,
        fileId: file.id,
        mimeType: file.mimeType,
        fileSize: file.size,
      });

      // Early return if lastSeenTs is greater than workflow start.
      // This allows avoiding resyncing already-synced documents in case of activity failure
      if (fileInDb?.lastSeenTs && fileInDb.lastSeenTs > new Date(startSyncTs)) {
        return true;
      }

      if (fileInDb?.skipReason) {
        localLogger.info(
          {},
          `Google Drive document skipped with skip reason ${fileInDb.skipReason}`
        );
        return false;
      }
      if (!file.capabilities.canDownload) {
        localLogger.info(
          {},
          "Google Drive document skipped because it cannot be downloaded"
        );
        return false;
      }

      // If the file is too big to be downloaded, we skip it.
      if (file.size && file.size > MAX_FILE_SIZE_TO_DOWNLOAD) {
        localLogger.info(
          "[Google Drive document] file size exceeded, skipping further processing."
        );
        return false;
      }

      const maxDocumentLen = config?.largeFilesEnabled
        ? MAX_LARGE_DOCUMENT_TXT_LEN
        : MAX_DOCUMENT_TXT_LEN;

      if (isTableFile(file)) {
        return syncOneFileTable(
          connectorId,
          oauth2client,
          file,
          localLogger,
          dataSourceConfig,
          maxDocumentLen,
          startSyncTs
        );
      } else {
        return syncOneFileTextDocument(
          connectorId,
          oauth2client,
          file,
          localLogger,
          config,
          dataSourceConfig,
          startSyncTs,
          isBatchSync,
          maxDocumentLen
        );
      }
    }
  );
}

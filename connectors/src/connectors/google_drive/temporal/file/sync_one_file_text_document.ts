import { handleFileExport } from "@connectors/connectors/google_drive/temporal/file/handle_file_export";
import { handleGoogleDriveExport } from "@connectors/connectors/google_drive/temporal/file/handle_google_drive_export";
import { updateGoogleDriveFiles } from "@connectors/connectors/google_drive/temporal/file/update_google_drive_files";
import { upsertGdriveDocument } from "@connectors/connectors/google_drive/temporal/file/upsert_gdrive_document";
import {
  getMimeTypesToDownload,
  MIME_TYPES_TO_EXPORT,
} from "@connectors/connectors/google_drive/temporal/mime_types";
import { getInternalId } from "@connectors/connectors/google_drive/temporal/utils";
import type { CoreAPIDataSourceDocumentSection } from "@connectors/lib/data_sources";
import { DataSourceQuotaExceededError } from "@connectors/lib/error";
import type { GoogleDriveConfigModel } from "@connectors/lib/models/google_drive";
import type { Logger } from "@connectors/logger/logger";
import type {
  DataSourceConfig,
  GoogleDriveObjectType,
  ModelId,
} from "@connectors/types";
import { WithRetriesError } from "@connectors/types";
import type { OAuth2Client } from "googleapis-common";

export async function syncOneFileTextDocument(
  connectorId: ModelId,
  oauth2client: OAuth2Client,
  file: GoogleDriveObjectType,
  localLogger: Logger,
  config: GoogleDriveConfigModel | null,
  dataSourceConfig: DataSourceConfig,
  startSyncTs: number,
  isBatchSync: boolean,
  maxDocumentLen: number
) {
  let documentContent: CoreAPIDataSourceDocumentSection | null = null;
  let skipReason: string | undefined;

  const mimeTypesToDownload = getMimeTypesToDownload({
    pdfEnabled: config?.pdfEnabled || false,
    csvEnabled: config?.csvEnabled || false,
  });

  const documentId = getInternalId(file.id);

  if (MIME_TYPES_TO_EXPORT[file.mimeType]) {
    const res = await handleGoogleDriveExport(oauth2client, file, localLogger);
    documentContent = res.content;
    if (res.skipReason) {
      localLogger.info(
        {},
        `Google Drive document skipped with skip reason ${res.skipReason}`
      );
      skipReason = res.skipReason;
    }
  } else if (mimeTypesToDownload.includes(file.mimeType)) {
    try {
      documentContent = await handleFileExport(
        oauth2client,
        documentId,
        file,
        maxDocumentLen,
        localLogger,
        dataSourceConfig,
        connectorId,
        startSyncTs
      );
    } catch (e) {
      if (e instanceof WithRetriesError) {
        localLogger.warn(
          { error: e },
          "Couldn't export the file after multiple retries. Skipping."
        );
        return false;
      }
    }
  }

  if (documentContent) {
    let upsertTimestampMs: number | undefined;
    try {
      upsertTimestampMs = await upsertGdriveDocument(
        dataSourceConfig,
        file,
        documentContent,
        documentId,
        maxDocumentLen,
        localLogger,
        oauth2client,
        connectorId,
        startSyncTs,
        isBatchSync
      );
    } catch (error) {
      if (error instanceof DataSourceQuotaExceededError) {
        localLogger.warn(
          { documentId, fileId: file.id },
          "File exceeds plan document size limit, marking as skipped"
        );
        skipReason = "payload_too_large";
        await updateGoogleDriveFiles(
          connectorId,
          documentId,
          file,
          skipReason,
          undefined
        );
        return false;
      }
      throw error;
    }

    await updateGoogleDriveFiles(
      connectorId,
      documentId,
      file,
      skipReason,
      upsertTimestampMs
    );
    return true;
  }

  if (skipReason) {
    await updateGoogleDriveFiles(
      connectorId,
      documentId,
      file,
      skipReason,
      undefined
    );
  }

  return !skipReason;
}

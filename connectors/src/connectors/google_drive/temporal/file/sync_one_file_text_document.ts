import type { OAuth2Client } from "googleapis-common";

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
import type { GoogleDriveConfig } from "@connectors/lib/models/google_drive";
import type { Logger } from "@connectors/logger/logger";
import type {
  DataSourceConfig,
  GoogleDriveObjectType,
  ModelId,
} from "@connectors/types";
import { WithRetriesError } from "@connectors/types";

export async function syncOneFileTextDocument(
  connectorId: ModelId,
  oauth2client: OAuth2Client,
  file: GoogleDriveObjectType,
  localLogger: Logger,
  config: GoogleDriveConfig | null,
  dataSourceConfig: DataSourceConfig,
  startSyncTs: number,
  isBatchSync: boolean,
  maxDocumentLen: number
) {
  let documentContent: CoreAPIDataSourceDocumentSection | null = null;

  const mimeTypesToDownload = getMimeTypesToDownload({
    pdfEnabled: config?.pdfEnabled || false,
    csvEnabled: config?.csvEnabled || false,
  });

  const documentId = getInternalId(file.id);

  if (MIME_TYPES_TO_EXPORT[file.mimeType]) {
    documentContent = await handleGoogleDriveExport(
      oauth2client,
      file,
      localLogger
    );
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
    const upsertTimestampMs = await upsertGdriveDocument(
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

    await updateGoogleDriveFiles(
      connectorId,
      documentId,
      file,
      undefined,
      upsertTimestampMs
    );
    return true;
  }
  return false;
}

import type { OAuth2Client } from "googleapis-common";

import { handleFileExport } from "@connectors/connectors/google_drive/temporal/file/handle_file_export";
import { updateGoogleDriveFiles } from "@connectors/connectors/google_drive/temporal/file/update_google_drive_files";
import { isGoogleDriveSpreadSheetFile } from "@connectors/connectors/google_drive/temporal/mime_types";
import { syncSpreadSheet } from "@connectors/connectors/google_drive/temporal/spreadsheets";
import { getInternalId } from "@connectors/connectors/google_drive/temporal/utils";
import type { Logger } from "@connectors/logger/logger";
import type {
  DataSourceConfig,
  GoogleDriveObjectType,
  ModelId,
} from "@connectors/types";

export async function syncOneFileTable(
  connectorId: ModelId,
  oauth2client: OAuth2Client,
  file: GoogleDriveObjectType,
  localLogger: Logger,
  dataSourceConfig: DataSourceConfig,
  maxDocumentLen: number,
  startSyncTs: number
) {
  let skipReason: string | undefined;
  const upsertTimestampMs = undefined;

  const documentId = getInternalId(file.id);

  if (isGoogleDriveSpreadSheetFile(file)) {
    const res = await syncSpreadSheet(
      oauth2client,
      connectorId,
      file,
      startSyncTs,
      localLogger
    );
    if (!res.isSupported) {
      return false;
    }
    if (res.skipReason) {
      localLogger.info(
        {},
        `Google Spreadsheet document skipped with skip reason ${res.skipReason}`
      );
      skipReason = res.skipReason;
    }
  } else {
    await handleFileExport(
      oauth2client,
      documentId,
      file,
      maxDocumentLen,
      localLogger,
      dataSourceConfig,
      connectorId,
      startSyncTs
    );
  }
  await updateGoogleDriveFiles(
    connectorId,
    documentId,
    file,
    skipReason,
    upsertTimestampMs
  );

  return !skipReason;
}

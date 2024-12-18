import {
  isGoogleDriveFolder,
  isGoogleDriveSpreadSheetFile,
} from "@connectors/connectors/google_drive/temporal/mime_types";
import { getInternalId } from "@connectors/connectors/google_drive/temporal/utils";
import type { GoogleDriveFiles } from "@connectors/lib/models/google_drive";

export function getPermissionViewType(file: GoogleDriveFiles) {
  if (isGoogleDriveFolder(file)) {
    return "folder";
  }

  return "file";
}

export function getGoogleDriveEntityDocumentId(file: GoogleDriveFiles) {
  if (isGoogleDriveSpreadSheetFile(file) || isGoogleDriveFolder(file)) {
    return null;
  }

  return getInternalId(file.driveFileId);
}

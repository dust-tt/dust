import type { ContentNodesViewType } from "@dust-tt/types";

import {
  isGoogleDriveFolder,
  isGoogleDriveSpreadSheetFile,
} from "@connectors/connectors/google_drive/temporal/mime_types";
import { getDocumentId } from "@connectors/connectors/google_drive/temporal/utils";
import type { GoogleDriveFiles } from "@connectors/lib/models/google_drive";

export function getPermissionViewType(
  file: GoogleDriveFiles,
  viewType: ContentNodesViewType
) {
  if (isGoogleDriveFolder(file)) {
    return "folder";
  }
  if (isGoogleDriveSpreadSheetFile(file) && viewType === "tables") {
    return "folder";
  }

  return "file";
}

export function getGoogleDriveEntityDocumentId(file: GoogleDriveFiles) {
  if (isGoogleDriveSpreadSheetFile(file) || isGoogleDriveFolder(file)) {
    return null;
  }

  return getDocumentId(file.driveFileId);
}

import { isGoogleDriveFolder } from "@connectors/connectors/google_drive/temporal/mime_types";
import type { GoogleDriveFilesModel } from "@connectors/lib/models/google_drive";

export function getPermissionViewType(file: GoogleDriveFilesModel) {
  if (isGoogleDriveFolder(file)) {
    return "folder";
  }

  return "document";
}

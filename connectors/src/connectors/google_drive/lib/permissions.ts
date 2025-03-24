import { isGoogleDriveFolder } from "@connectors/connectors/google_drive/temporal/mime_types";
import type { GoogleDriveFiles } from "@connectors/lib/models/google_drive";

export function getPermissionViewType(file: GoogleDriveFiles) {
  if (isGoogleDriveFolder(file)) {
    return "folder";
  }

  return "document";
}

import { google } from "googleapis";

import {
  MAX_CONTENT_SIZE as METADATA_MAX_CONTENT_SIZE,
  SUPPORTED_MIMETYPES as METADATA_SUPPORTED_MIMETYPES,
} from "@app/lib/actions/mcp_internal_actions/servers/google_drive/metadata";

// Re-export from metadata to maintain backward compatibility
export const SUPPORTED_MIMETYPES = METADATA_SUPPORTED_MIMETYPES;
export const MAX_CONTENT_SIZE = METADATA_MAX_CONTENT_SIZE;
export const MAX_FILE_SIZE = 64 * 1024 * 1024; // 10 MB max original file size

export function getGoogleDriveClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth: oauth2Client });
}

export function getGoogleSheetsClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.sheets({
    version: "v4",
    auth: oauth2Client,
  });
}

import { google } from "googleapis";

export const SUPPORTED_MIMETYPES = [
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.presentation",
  "application/vnd.google-apps.spreadsheet",
  "text/plain",
  "text/markdown",
  "text/csv",
];

export const MAX_CONTENT_SIZE = 32000; // Max characters to return for file content
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

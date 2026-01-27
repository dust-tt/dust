import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

import {
  getGoogleDriveClient,
  getGoogleSheetsClient,
} from "@app/lib/providers/google_drive/utils";

export async function getDriveClient(authInfo?: AuthInfo) {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return null;
  }
  return getGoogleDriveClient(accessToken);
}

export async function getSheetsClient(authInfo?: AuthInfo) {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return null;
  }
  return getGoogleSheetsClient(accessToken);
}

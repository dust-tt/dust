import {
  getGoogleDocsClient,
  getGoogleDriveClient,
  getGoogleSheetsClient,
  getGoogleSlidesClient,
} from "@app/lib/providers/google_drive/utils";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
export async function getDriveClient(authInfo?: AuthInfo) {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return null;
  }
  return getGoogleDriveClient(accessToken);
}

// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
export async function getSheetsClient(authInfo?: AuthInfo) {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return null;
  }
  return getGoogleSheetsClient(accessToken);
}

// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
export async function getDocsClient(authInfo?: AuthInfo) {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return null;
  }
  return getGoogleDocsClient(accessToken);
}

// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
export async function getSlidesClient(authInfo?: AuthInfo) {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return null;
  }
  return getGoogleSlidesClient(accessToken);
}

import { cacheWithRedis } from "@dust-tt/types";
import type { drive_v3 } from "googleapis";
import { google } from "googleapis";
import { OAuth2Client } from "googleapis-common";

import { googleDriveConfig } from "@connectors/connectors/google_drive/lib/config";
import type { NangoConnectionResponse } from "@connectors/lib/nango_helpers";
import { getConnectionFromNango } from "@connectors/lib/nango_helpers";
import {
  getOAuthConnectionAccessTokenWithThrow,
  isDualUseOAuthConnectionId,
} from "@connectors/lib/oauth";
import logger from "@connectors/logger/logger";
import type { GoogleDriveObjectType } from "@connectors/types/google_drive";

export function getDocumentId(driveFileId: string): string {
  return `gdrive-${driveFileId}`;
}

async function _getMyDriveId(auth_credentials: OAuth2Client) {
  const drive = await getDriveClient(auth_credentials);
  const myDriveRes = await drive.files.get({ fileId: "root", fields: "id" });
  if (myDriveRes.status !== 200) {
    throw new Error(
      `Error getting my drive. status_code: ${myDriveRes.status}. status_text: ${myDriveRes.statusText}`
    );
  }
  if (!myDriveRes.data.id) {
    throw new Error("My drive id is undefined");
  }

  return myDriveRes.data.id;
}
export const getMyDriveIdCached = cacheWithRedis(
  _getMyDriveId,
  (auth_credentials: OAuth2Client) => {
    if (!auth_credentials.credentials.access_token) {
      throw new Error("No access token in auth credentials");
    }
    return auth_credentials.credentials.access_token;
  },
  60 * 10 * 1000 // 10 minutes
);

export async function driveObjectToDustType(
  file: drive_v3.Schema$File,
  authCredentials: OAuth2Client
): Promise<GoogleDriveObjectType> {
  if (
    !file.name ||
    !file.mimeType ||
    !file.createdTime ||
    !file.capabilities ||
    file.capabilities.canDownload === undefined
  ) {
    throw new Error("Invalid file. File is: " + JSON.stringify(file));
  }
  const drive = await getDriveClient(authCredentials);
  if (!file.driveId) {
    // There is no driveId, the object is stored in "My Drive".
    return {
      id: file.id as string,
      name: file.name,
      parent: file.parents && file.parents[0] ? file.parents[0] : null,
      mimeType: file.mimeType,
      webViewLink: file.webViewLink ? file.webViewLink : undefined,
      createdAtMs: new Date(file.createdTime).getTime(),
      trashed: file.trashed ? file.trashed : false,
      size: file.size ? parseInt(file.size, 10) : null,
      driveId: await getMyDriveIdCached(authCredentials),
      isInSharedDrive: false,
      updatedAtMs: file.modifiedTime
        ? new Date(file.modifiedTime).getTime()
        : undefined,
      lastEditor: file.lastModifyingUser
        ? { displayName: file.lastModifyingUser.displayName as string }
        : undefined,
      capabilities: {
        canDownload: file.capabilities.canDownload,
      },
    };
  } else if (file.driveId == file.id) {
    // We are dealing with a Google Drive object. We need a query to the Drive API to get the actual Drive name.
    const driveRes = await drive.drives.get({
      driveId: file.id as string,
    });
    if (driveRes.status !== 200) {
      throw new Error(
        `Error getting drive. status_code: ${driveRes.status}. status_text: ${driveRes.statusText}`
      );
    }
    return {
      id: driveRes.data.id as string,
      name: driveRes.data.name as string,
      parent: null,
      mimeType: "application/vnd.google-apps.folder",
      webViewLink: file.webViewLink ? file.webViewLink : undefined,
      createdAtMs: new Date(file.createdTime).getTime(),
      trashed: false,
      size: null,
      driveId: file.id,
      isInSharedDrive: true,
      capabilities: {
        canDownload: false,
      },
    };
  } else {
    // We are dealing with a file in a shared drive.
    return {
      id: file.id as string,
      name: file.name,
      parent: file.parents && file.parents[0] ? file.parents[0] : null,
      mimeType: file.mimeType,
      webViewLink: file.webViewLink ? file.webViewLink : undefined,
      createdAtMs: new Date(file.createdTime).getTime(),
      trashed: file.trashed ? file.trashed : false,
      size: file.size ? parseInt(file.size, 10) : null,
      driveId: file.driveId,
      isInSharedDrive: true,
      updatedAtMs: file.modifiedTime
        ? new Date(file.modifiedTime).getTime()
        : undefined,
      lastEditor: file.lastModifyingUser
        ? { displayName: file.lastModifyingUser.displayName as string }
        : undefined,
      capabilities: {
        canDownload: file.capabilities.canDownload,
      },
    };
  }
}

export async function getAuthObject(
  connectionId: string
): Promise<OAuth2Client> {
  const token = await getOAuthConnectionAccessTokenWithThrow({
    logger,
    provider: "google_drive",
    connectionId,
  });

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: token.access_token,
    scope: (token.scrubbed_raw_json as { scope: string }).scope,
    token_type: (token.scrubbed_raw_json as { token_type: string }).token_type,
    expiry_date: token.access_token_expiry,
  });
  return oauth2Client;
}

export async function getDriveClient(
  auth_credentials: OAuth2Client
): Promise<drive_v3.Drive>;
export async function getDriveClient(
  auth_credentials: string
): Promise<drive_v3.Drive>;
export async function getDriveClient(
  auth_credentials: string | OAuth2Client
): Promise<drive_v3.Drive> {
  if (auth_credentials instanceof OAuth2Client) {
    return google.drive({ version: "v3", auth: auth_credentials });
  } else if (typeof auth_credentials === "string") {
    const auth = await getAuthObject(auth_credentials);
    const drive = google.drive({ version: "v3", auth: auth });

    return drive;
  }

  throw new Error("Invalid auth_credentials type");
}

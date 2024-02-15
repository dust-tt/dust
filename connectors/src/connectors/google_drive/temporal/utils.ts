import type { drive_v3 } from "googleapis";
import { google } from "googleapis";
import { OAuth2Client } from "googleapis-common";

import { googleDriveConfig } from "@connectors/connectors/google_drive/lib/config";
import { nango_client } from "@connectors/lib/nango_client";
import type { NangoConnectionResponse } from "@connectors/lib/nango_helpers";
import { getConnectionFromNango } from "@connectors/lib/nango_helpers";
import type { GoogleDriveObjectType } from "@connectors/types/google_drive";

export function getDocumentId(driveFileId: string): string {
  return `gdrive-${driveFileId}`;
}

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
  if (file.driveId == file.id) {
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
      capabilities: {
        canDownload: false,
      },
    };
  } else {
    return {
      id: file.id as string,
      name: file.name,
      parent: file.parents && file.parents[0] ? file.parents[0] : null,
      mimeType: file.mimeType,
      webViewLink: file.webViewLink ? file.webViewLink : undefined,
      createdAtMs: new Date(file.createdTime).getTime(),
      trashed: file.trashed ? file.trashed : false,
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

export async function getGoogleCredentials(
  nangoConnectionId: string
): Promise<NangoConnectionResponse> {
  return nango_client().getConnection(
    googleDriveConfig.getRequiredNangoGoogleDriveConnectorId(),
    nangoConnectionId,
    false
  );
}

export async function getAuthObject(
  nangoConnectionId: string
): Promise<OAuth2Client> {
  const res: NangoConnectionResponse = await getConnectionFromNango({
    connectionId: nangoConnectionId,
    integrationId: googleDriveConfig.getRequiredNangoGoogleDriveConnectorId(),
    refreshToken: false,
    useCache: true,
  });

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: res.credentials.access_token,
    scope: res.credentials.raw.scope,
    token_type: res.credentials.raw.token_type,
    expiry_date: new Date(res.credentials.expires_at).getTime(),
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

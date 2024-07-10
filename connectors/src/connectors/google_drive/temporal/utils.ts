import { cacheWithRedis } from "@dust-tt/types";
import { parse } from "csv-parse";
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

export async function isValidCsv(csv: string): Promise<boolean> {
  try {
    const delimiter = await guessCsvDelimiter(csv);
    if (!delimiter) {
      return false;
    }

    const parser = parse(csv, { delimiter });
    let header: string[] | undefined = undefined;
    const headerSet = new Set<string>();

    for await (const record of parser) {
      if (!Array.isArray(record) || record.some((r) => typeof r !== "string")) {
        return false;
      }

      if (!header) {
        header = record.map((h) => h.trim().toLowerCase());
        const firstEmptyCellIndex = header.indexOf("");
        if (firstEmptyCellIndex !== -1) {
          if (header.slice(firstEmptyCellIndex).some((c) => c !== "")) {
            return false;
          }
          header = header.slice(0, firstEmptyCellIndex);
        }

        for (const h of header) {
          if (headerSet.has(h)) {
            return false;
          }
          headerSet.add(h);
        }
      } else {
        if (record.length !== header.length) {
          return false;
        }
      }
    }
    return !!header && headerSet.size > 0;
  } catch (error) {
    return false;
  }
}

async function guessCsvDelimiter(csv: string): Promise<string | undefined> {
  const possibleDelimiters = [",", ";", "\t"];
  let bestDelimiter: string | undefined;
  let maxColumns = 0;

  for (const delimiter of possibleDelimiters) {
    try {
      const parser = parse(csv, {
        delimiter,
        to_line: 2, // Only parse first two lines
        skip_empty_lines: true,
      });

      const rows: string[][] = [];
      for await (const record of parser) {
        rows.push(record);
        if (rows.length === 2) {
          break;
        } // Stop after we have two rows
      }

      if (rows.length >= 2 && rows[0] && rows[1]) {
        const firstRowLength = rows[0].length;
        const secondRowLength = rows[1].length;
        if (firstRowLength > maxColumns && firstRowLength === secondRowLength) {
          maxColumns = firstRowLength;
          bestDelimiter = delimiter;
        }
      }
    } catch {
      // If parsing fails, try the next delimiter
    }
  }

  return bestDelimiter;
}

import { removeNulls } from "@dust-tt/client";
import type { drive_v3 } from "googleapis";
import { google } from "googleapis";
import type { GaxiosError, GaxiosResponse } from "googleapis-common";
import { OAuth2Client } from "googleapis-common";

import { ExternalOAuthTokenError } from "@connectors/lib/error";
import { getOAuthConnectionAccessTokenWithThrow } from "@connectors/lib/oauth";
import logger from "@connectors/logger/logger";
import type { GoogleDriveObjectType, ModelId } from "@connectors/types";
import { cacheWithRedis } from "@connectors/types";

export function getInternalId(driveFileId: string): string {
  return `gdrive-${driveFileId}`;
}

export function getDriveFileId(documentId: string): string {
  return documentId.replace(/^gdrive-/, "");
}

async function _getMyDriveId(auth_credentials: OAuth2Client) {
  const drive = await getDriveClient(auth_credentials);
  let myDriveRes: GaxiosResponse<drive_v3.Schema$File>;
  try {
    myDriveRes = await drive.files.get({ fileId: "root", fields: "id" });
  } catch (e) {
    if ((e as GaxiosError).response?.status === 401) {
      throw new ExternalOAuthTokenError();
    }
    throw e;
  }

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

// Turn the labels into a string array of formatted string such as labelTitle:labelValue
const getLabelsNamesFromLabels = async (
  connectorId: ModelId,
  file: drive_v3.Schema$File,
  authCredentials: OAuth2Client
) => {
  const labelInfo = file.labelInfo;
  if (!labelInfo) {
    return [];
  }
  const labels = await getCachedLabels(connectorId, authCredentials);

  return removeNulls(
    labelInfo.labels?.flatMap((l) => {
      const labelDef = labels.find((def) => def.id === l.id);
      if (!labelDef || !labelDef.properties?.title) {
        return null;
      }

      const title: string = labelDef.properties.title;

      for (const f of Object.values(l.fields ?? {})) {
        if (!f.valueType) {
          continue;
        }

        const fieldDef = labelDef.fields?.find((def) => def.id === f.id);
        if (!fieldDef) {
          continue;
        }

        switch (f.valueType) {
          case "text":
            return (f.text ?? []).map((t) => `${title}:${t}`);
          case "dateString":
            return (f.dateString ?? []).map((d) => `${title}:${d}`);
          case "integer":
            return (f.integer ?? []).map((i) => `${title}:${i}`);
          case "selection":
            // In case of selection, we get ID's of the selection choice, to find out the values, we need to lookup in the field definition
            return removeNulls(
              (f.selection ?? []).map((s) => {
                const choice = fieldDef.selectionOptions?.choices?.find(
                  (c) => c.id === s
                );
                return choice?.properties?.displayName;
              })
            ).map((o) => `${title}:${o}`);
          case "user":
            // Ignore on purpose
            return null;
          default:
            logger.warn({ valueType: f.valueType }, "Unknown field type");
            return null;
        }
      }

      return null;
    }) ?? []
  );
};

export async function driveObjectToDustType(
  connectorId: ModelId,
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

  const labels = await getLabelsNamesFromLabels(
    connectorId,
    file,
    authCredentials
  );

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
      labels: labels,
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
      labels: labels,
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
      labels: labels,
    };
  }
}

export async function getAuthObject(
  connectionId: string
): Promise<OAuth2Client> {
  const oauth2Client = new google.auth.OAuth2();
  const token = await getOAuthConnectionAccessTokenWithThrow({
    logger,
    provider: "google_drive",
    connectionId,
  });

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

export const getCachedLabels = cacheWithRedis(
  _getLabels,
  (connectorId, authCredentials) => {
    if (!authCredentials.credentials.access_token) {
      throw new Error("No access token in auth credentials");
    }
    return `${connectorId}-labels`;
  },
  60 * 10 * 1000 // 10 minutes
);

// Get the list of published labels
export async function _getLabels(
  connectorId: ModelId,
  authCredentials: OAuth2Client
) {
  // For now, return empty array until we have the new scope approved.
  return [];
  try {
    const driveLabels = google.drivelabels({
      version: "v2",
      auth: authCredentials,
    });
    const r = await driveLabels.labels.list({
      pageSize: 200,
      publishedOnly: true,
      view: "LABEL_VIEW_FULL",
    });

    return removeNulls(r.data.labels?.map((l) => (l.id ? l : null)) ?? []);
  } catch (e) {
    // Warning for now as getting labels requires re-auth the google drive app with a new scope.
    logger.warn(
      {
        error: e,
      },
      "Error getting labels"
    );
  }
  return [];
}

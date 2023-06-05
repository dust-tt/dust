import PQueue from "p-queue";

import { upsertToDatasource } from "@connectors/lib/data_sources";
import { nango_client } from "@connectors/lib/nango_client";
import { DataSourceConfig } from "@connectors/types/data_source_config";
const { NANGO_GOOGLE_DRIVE_CONNECTOR_ID = "google" } = process.env;
import { google } from "googleapis";
import { drive_v3 } from "googleapis";
import { OAuth2Client } from "googleapis-common";

import { convertGoogleDocumentToJson } from "@connectors/connectors/google_drive/parser";
import {
  GoogleDriveFiles,
  GoogleDriveFolders,
  GoogleDriveSyncToken,
  ModelId,
} from "@connectors/lib/models";

export async function getAuthObject(
  nangoConnectionId: string
): Promise<OAuth2Client> {
  if (!NANGO_GOOGLE_DRIVE_CONNECTOR_ID) {
    throw new Error("NANGO_GOOGLE_DRIVE_CONNECTOR_ID is not defined");
  }
  const res = await nango_client().getRawTokenResponse(
    NANGO_GOOGLE_DRIVE_CONNECTOR_ID,
    nangoConnectionId
  );
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: res.access_token,
    scope: res.scope,
    token_type: res.token_type,
    expiry_date: new Date(res.expires_at).getTime(),
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

export async function getDrivesIds(
  nangoConnectionId: string
): Promise<string[]> {
  const drive = await getDriveClient(nangoConnectionId);
  let nextPageToken = undefined;
  const ids = [];
  do {
    const res = await drive.drives.list({
      pageSize: 100,
      fields: "nextPageToken, drives(id, name)",
    });
    if (res.status !== 200) {
      throw new Error(
        `Error getting drives. status_code: ${res.status}. status_text: ${res.statusText}`
      );
    }
    if (!res.data.drives) {
      throw new Error("Drives list is undefined");
    }
    for (const drive of res.data.drives) {
      if (drive.id) {
        ids.push(drive.id);
      }
    }
    nextPageToken = res.data.nextPageToken;
  } while (nextPageToken);

  return ids;
}

export async function syncFiles(
  connectorId: ModelId,
  nangoConnectionId: string,
  dataSourceConfig: DataSourceConfig,
  nextPageToken?: string
) {
  const folders = await GoogleDriveFolders.findAll({
    where: {
      connectorId: connectorId,
    },
  });

  const foldersIds = folders.map((f) => f.folderId);
  const authCredentials = await getAuthObject(nangoConnectionId);
  const drive = await getDriveClient(authCredentials);
  const res = await drive.files.list({
    corpora: "allDrives",
    pageSize: 1000,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields:
      "nextPageToken, files(id, name, parents, mimeType, modifiedTime, trashed, webViewLink)",
    pageToken: nextPageToken,
    q: "mimeType='application/vnd.google-apps.document'",
  });
  if (res.status !== 200) {
    throw new Error(
      `Error getting files. status_code: ${res.status}. status_text: ${res.statusText}`
    );
  }
  if (!res.data.files) {
    throw new Error("Files list is undefined");
  }
  const filesToSync = res.data.files
    .filter((file) => file.id)
    .map((file): { id: string; url?: string } => {
      return {
        id: file.id as string,
        url: file.webViewLink ? file.webViewLink : undefined,
      };
    });
  const queue = new PQueue({ concurrency: 30 });
  await Promise.all(
    filesToSync.map((file) => {
      return queue.add(async () => {
        const shouldSync = await objectIsInFolder(
          authCredentials,
          file.id,
          foldersIds
        );
        if (shouldSync) {
          await syncOneFile(
            connectorId,
            authCredentials,
            dataSourceConfig,
            file.id as string,
            file.url
          );
        }
      });
    })
  );

  // return res.data;
  return {
    nextPageToken: res.data.nextPageToken,
    count: res.data.files.length,
  };
}

async function syncOneFile(
  connectorId: ModelId,
  oauth2client: OAuth2Client,
  dataSourceConfig: DataSourceConfig,
  fileId: string,
  webViewLink?: string
) {
  console.log("syncOneFile", fileId);
  const docs = google.docs({ version: "v1", auth: oauth2client });
  const res = await docs.documents.get({
    documentId: fileId,
  });
  if (res.status !== 200) {
    throw new Error(
      `Error getting Google document. status_code: ${res.status}. status_text: ${res.statusText}`
    );
  }
  if (!res.data.title) {
    throw new Error("No title found");
  }
  if (!res.data.body) {
    throw new Error("No body found");
  }
  const tags = [`title:${res.data.title}`];

  const jsonDoc = convertGoogleDocumentToJson(res.data);
  const textDoc = googleDocJSON2Text(jsonDoc);

  await GoogleDriveFiles.upsert({
    connectorId: connectorId,
    fileId: fileId,
  });

  await upsertToDatasource(
    dataSourceConfig,
    fileId,
    textDoc,
    webViewLink,
    undefined,
    tags
  );
}

// Example payload returned by the Google Docs parser util.
//  {
//       "h1": "What we’re trying to do"
//     },
//     {
//       "h2": "Key goals"
//     },
//     {
//       "p": ""
//     },
//     {
//       "p": "**For Dust**"
//     },
//     {
//       "ul": [
//         "Update positioning: from developer platform to Smart Team OS",
//         "Tease / showcase uses cases for the core apps and platform"
//       ]
//     },
//   }

function googleDocJSON2Text(
  jsonDoc: ReturnType<typeof convertGoogleDocumentToJson>
) {
  const arrayDoc: string[] = [];
  for (const element of jsonDoc.content) {
    if (typeof element === "object") {
      const keys = Object.keys(element);
      keys.forEach((key) => {
        if (["p", "h1", "h2", "h3", "h4", "h5", "blockquote"].includes(key)) {
          arrayDoc.push(element[key]);
        }
        if (key === "ul") {
          arrayDoc.push(...element[key]);
        }
      });
    }
  }

  return arrayDoc.join("\n");
}

export async function _syncAllFiles(
  connectorId: ModelId,
  nangoConnectionId: string,
  dataSourceConfig: DataSourceConfig
) {
  let nextPageToken: string | undefined | null = undefined;
  const files = [];
  do {
    const res = await syncFiles(
      connectorId,
      nangoConnectionId,
      dataSourceConfig,
      nextPageToken
    );
    nextPageToken = res.nextPageToken;
    if (!res.files) {
      throw new Error("No files found");
    }
    for (const file of res.files) {
      files.push(file);
    }
  } while (nextPageToken);
}

/**
 * This function performs a BFS search in the parents tree of the object to check
 * if the object is in a list of folders.
 * We could memoize this function to avoid making the same request multiple times
 * to the Google Drive API.
 */
async function objectIsInFolder(
  oauth2client: OAuth2Client,
  objectId: string,
  foldersIds: string[]
) {
  // For now, we always return true until we have the file picker.
  return true;
  const drive = await getDriveClient(oauth2client);
  // Parents Queue to BFS the parents tree.
  // Objects in Google Drive can have multiple parents.
  const parentsQueue: string[] = [];
  parentsQueue.push(objectId);
  do {
    const currentObject = parentsQueue.shift();
    if (!currentObject) {
      // This makes Typescript happy.
      throw new Error("currentObject is undefined");
    }
    if (foldersIds.includes(currentObject)) {
      return true;
    }
    const res = await drive.files.get({
      fileId: currentObject,
      fields: "*",
      supportsAllDrives: true,
    });
    if (res.status !== 200) {
      throw new Error(
        `Error getting object. objetId:${objectId} status_code: ${res.status}. status_text: ${res.statusText}`
      );
    }
    if (!res.data.parents) {
      return false;
    }
    parentsQueue.push(...res.data.parents);
  } while (parentsQueue.length > 0);
}

export async function incrementalSync(
  connectorId: ModelId,
  nangoConnectionId: string,
  dataSourceConfig: DataSourceConfig,
  driveId: string
) {
  const lastSyncToken = await getSyncPageToken(
    connectorId,
    nangoConnectionId,
    driveId
  );

  const driveClient = await getDriveClient(nangoConnectionId);
  const oauth2client = await getAuthObject(nangoConnectionId);
  let nextPageToken: string | undefined = undefined;
  do {
    const changesRes = await driveClient.changes.list({
      driveId: driveId,
      pageToken: lastSyncToken,
      pageSize: 100,
      fields: "*",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    if (changesRes.status !== 200) {
      throw new Error(
        `Error getting changes. status_code: ${changesRes.status}. status_text: ${changesRes.statusText}`
      );
    }
    if (changesRes.data.changes === undefined) {
      throw new Error(`changes list is undefined`);
    }

    for (const change of changesRes.data.changes) {
      if (change.changeType !== "file") {
        continue;
      }
      if (change.file?.mimeType !== "application/vnd.google-apps.document") {
        continue;
      }
      if (!change.file.id) {
        continue;
      }
      await syncOneFile(
        connectorId,
        oauth2client,
        dataSourceConfig,
        change.file.id,
        change.file.webViewLink ? change.file.webViewLink : undefined
      );
    }
    nextPageToken = changesRes.data.nextPageToken
      ? changesRes.data.nextPageToken
      : undefined;
    if (changesRes.data.newStartPageToken) {
      await GoogleDriveSyncToken.upsert({
        connectorId: connectorId,
        driveId: driveId,
        syncToken: changesRes.data.newStartPageToken,
      });
    }
  } while (nextPageToken);
}

async function getSyncPageToken(
  connectorId: ModelId,
  nangoConnectionId: string,
  driveId: string
) {
  const last = await GoogleDriveSyncToken.findOne({
    where: {
      connectorId: connectorId,
      driveId: driveId,
    },
  });
  if (last) {
    return last.syncToken;
  }
  const driveClient = await getDriveClient(nangoConnectionId);
  let lastSyncToken = undefined;
  if (!lastSyncToken) {
    const startTokenRes = await driveClient.changes.getStartPageToken({
      driveId: driveId,
      supportsAllDrives: true,
    });
    if (startTokenRes.status !== 200) {
      throw new Error(
        `Error getting start page token. status_code: ${startTokenRes.status}. status_text: ${startTokenRes.statusText}`
      );
    }
    if (!startTokenRes.data.startPageToken) {
      throw new Error("No start page token found");
    }
    lastSyncToken = startTokenRes.data.startPageToken;
  }

  return lastSyncToken;
}

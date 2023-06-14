import PQueue from "p-queue";

import { upsertToDatasource } from "@connectors/lib/data_sources";
import { nango_client } from "@connectors/lib/nango_client";
import { DataSourceConfig } from "@connectors/types/data_source_config";
import { GoogleDriveFileType } from "@connectors/types/google_drive";
const { NANGO_GOOGLE_DRIVE_CONNECTOR_ID = "google" } = process.env;
import { google } from "googleapis";
import { drive_v3 } from "googleapis";
import { OAuth2Client } from "googleapis-common";
import memoize from "lodash.memoize";

import { convertGoogleDocumentToJson } from "@connectors/connectors/google_drive/parser";
import {
  GoogleDriveFiles,
  GoogleDriveFolders,
  GoogleDriveSyncToken,
  ModelId,
} from "@connectors/lib/models";

const FILES_SYNC_CONCURRENCY = 30;

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

export async function getDrivesIds(nangoConnectionId: string): Promise<
  {
    id: string;
    name: string;
  }[]
> {
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
      if (drive.id && drive.name) {
        ids.push({ id: drive.id, name: drive.name });
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
  const foldersIds = await getFoldersToSync(connectorId);
  const authCredentials = await getAuthObject(nangoConnectionId);
  const drive = await getDriveClient(authCredentials);
  const res = await drive.files.list({
    corpora: "allDrives",
    pageSize: 1000,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields:
      "nextPageToken, files(id, name, parents, mimeType, createdTime, modifiedTime, trashed, webViewLink)",
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
    .filter((file) => file.id && file.createdTime)
    .map((file): GoogleDriveFileType => {
      if (!file.id || !file.createdTime || !file.name) {
        throw new Error("Invalid file. File is: " + JSON.stringify(file));
      }
      return {
        id: file.id as string,
        name: file.name,
        webViewLink: file.webViewLink ? file.webViewLink : undefined,
        createdAtMs: new Date(file.createdTime).getTime(),
        updatedAtMs: file.modifiedTime
          ? new Date(file.modifiedTime).getTime()
          : undefined,
        lastEditor: file.lastModifyingUser
          ? { displayName: file.lastModifyingUser.displayName as string }
          : undefined,
      };
    });
  const queue = new PQueue({ concurrency: FILES_SYNC_CONCURRENCY });
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
            file
          );
        }
      });
    })
  );

  return {
    nextPageToken: res.data.nextPageToken,
    count: res.data.files.length,
  };
}

async function syncOneFile(
  connectorId: ModelId,
  oauth2client: OAuth2Client,
  dataSourceConfig: DataSourceConfig,
  file: GoogleDriveFileType
) {
  const docs = google.docs({ version: "v1", auth: oauth2client });
  const res = await docs.documents.get({
    documentId: file.id,
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
  if (file.updatedAtMs) {
    tags.push(`lastEditedAt:${file.updatedAtMs}`);
  }
  if (file.lastEditor) {
    tags.push(`lastEditor:${file.lastEditor.displayName}`);
  }

  const jsonDoc = convertGoogleDocumentToJson(res.data);
  const textDoc = googleDocJSON2Text(jsonDoc);

  const documentId = `gdrive-${file.id}`;
  await GoogleDriveFiles.upsert({
    connectorId: connectorId,
    fileId: documentId,
  });

  await upsertToDatasource(
    dataSourceConfig,
    documentId,
    textDoc,
    file.webViewLink,
    file.createdAtMs,
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
): string {
  const arrayDoc: string[] = [];
  for (const element of jsonDoc.content) {
    if (typeof element === "object") {
      const keys = Object.keys(element);
      keys.forEach((key) => {
        switch (key) {
          case "p":
            arrayDoc.push(element[key]);
            break;
          case "h1":
            arrayDoc.push(`# ${element[key]}`);
            break;
          case "h2":
            arrayDoc.push(`## ${element[key]}`);
            break;
          case "h3":
            arrayDoc.push(`### ${element[key]}`);
            break;
          case "h4":
            arrayDoc.push(`#### ${element[key]}`);
            break;
          case "h5":
            arrayDoc.push(`##### ${element[key]}`);
            break;

          case "blockquote":
            arrayDoc.push(`> ${element[key]}`);
            break;
          case "ul":
            arrayDoc.push(...element[key].map((item: string) => `- ${item}`));
            break;
          case "ol":
            arrayDoc.push(
              ...element[key].map(
                (item: string, i: number) => `- ${i + 1} ${item}`
              )
            );
            break;
          case "table": {
            let tableStr = element[key]?.headers
              .map((header: string) => {
                return ` ${header} `;
              })
              .join("|");
            tableStr = `|${tableStr}|\n`;
            tableStr += element[key]?.rows
              .map((row: string[]) => {
                return `|${row.join("|")}|`;
              })
              .join("\n");
            arrayDoc.push(tableStr);

            break;
          }
        }
      });
    }
  }

  return arrayDoc.join("\n");
}

async function getParents(
  objectId: string,
  oauth2client: OAuth2Client
): Promise<string[]> {
  const drive = await getDriveClient(oauth2client);

  const res = await drive.files.get({
    fileId: objectId,
    fields: "*",
    supportsAllDrives: true,
  });
  if (res.status !== 200) {
    throw new Error(
      `Error getting object. objetId:${objectId} status_code: ${res.status}. status_text: ${res.statusText}`
    );
  }
  if (res.data.parents && res.data.parents.length > 0) {
    return res.data.parents;
  }
  return [];
}

const getParentsMemoized = memoize(getParents);

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
  // Parents Queue to BFS the parents tree.
  // Objects in Google Drive can have multiple parents.
  const parentsQueue: string[] = [];
  parentsQueue.push(objectId);
  while (parentsQueue.length > 0) {
    const currentObject = parentsQueue.shift();
    if (!currentObject) {
      // This makes Typescript happy.
      throw new Error("currentObject is undefined");
    }
    if (foldersIds.includes(currentObject)) {
      return true;
    }
    const parents = await getParentsMemoized(currentObject, oauth2client);
    if (parents.length > 0) {
      parentsQueue.push(...parents);
    }
  }

  return false;
}

export async function incrementalSync(
  connectorId: ModelId,
  nangoConnectionId: string,
  dataSourceConfig: DataSourceConfig,
  driveId: string
): Promise<number> {
  const lastSyncToken = await getSyncPageToken(
    connectorId,
    nangoConnectionId,
    driveId
  );
  const foldersIds = await getFoldersToSync(connectorId);

  const driveClient = await getDriveClient(nangoConnectionId);
  const oauth2client = await getAuthObject(nangoConnectionId);
  let nextPageToken: string | undefined = undefined;
  let changeCount = 0;
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
      changeCount++;
      if (change.changeType !== "file") {
        continue;
      }
      if (change.file?.mimeType !== "application/vnd.google-apps.document") {
        continue;
      }
      if (!change.file.id) {
        continue;
      }
      if (!(await objectIsInFolder(oauth2client, change.file.id, foldersIds))) {
        continue;
      }
      if (!change.file.createdTime || !change.file.name || !change.file.id) {
        throw new Error(
          `Invalid file. File is: ${JSON.stringify(change.file)}`
        );
      }

      const driveFile: GoogleDriveFileType = {
        id: change.file.id,
        name: change.file.name,
        createdAtMs: new Date(change.file.createdTime).getTime(),
        updatedAtMs: change.file.modifiedTime
          ? new Date(change.file.modifiedTime).getTime()
          : undefined,
        webViewLink: change.file.webViewLink || undefined,
        lastEditor: change.file.lastModifyingUser
          ? { displayName: change.file.lastModifyingUser.displayName as string }
          : undefined,
      };
      await syncOneFile(connectorId, oauth2client, dataSourceConfig, driveFile);
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

  return changeCount;
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

export async function getFoldersToSync(connectorId: ModelId) {
  const folders = await GoogleDriveFolders.findAll({
    where: {
      connectorId: connectorId,
    },
  });

  const foldersIds = folders.map((f) => f.folderId);

  return foldersIds;
}

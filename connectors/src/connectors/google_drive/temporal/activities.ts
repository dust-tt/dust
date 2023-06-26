import { GaxiosError, GaxiosResponse } from "googleapis-common";
import StatsD from "hot-shots";
import PQueue from "p-queue";

import {
  deleteFromDataSource,
  upsertToDatasource,
} from "@connectors/lib/data_sources";
import { nango_client } from "@connectors/lib/nango_client";
import mainLogger from "@connectors/logger/logger";
import { DataSourceConfig } from "@connectors/types/data_source_config";
import { GoogleDriveFileType } from "@connectors/types/google_drive";
const { NANGO_GOOGLE_DRIVE_CONNECTOR_ID = "google" } = process.env;
import { uuid4 } from "@temporalio/workflow";
import { google } from "googleapis";
import { drive_v3 } from "googleapis";
import { OAuth2Client } from "googleapis-common";
import memoize from "lodash.memoize";
import { literal, Op } from "sequelize";

import { convertGoogleDocumentToJson } from "@connectors/connectors/google_drive/parser";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  Connector,
  GoogleDriveFiles,
  GoogleDriveFolders,
  GoogleDriveSyncToken,
  GoogleDriveWebhook,
  ModelId,
  sequelize_conn,
} from "@connectors/lib/models";
import logger from "@connectors/logger/logger";

import { registerWebhook } from "../lib";

const FILES_SYNC_CONCURRENCY = 30;
const FILES_GC_CONCURRENCY = 30;

export const statsDClient = new StatsD();

type NangoGetConnectionRes = {
  connection_id: string;
  credentials: {
    type: string;
    access_token: string;
    refresh_token: string;
    expires_at: string;
    expires_in: number;
    raw: {
      scope: string;
      token_type: string;
    };
  };
};

export async function getGoogleCredentials(
  nangoConnectionId: string
): Promise<NangoGetConnectionRes> {
  if (!NANGO_GOOGLE_DRIVE_CONNECTOR_ID) {
    throw new Error("NANGO_GOOGLE_DRIVE_CONNECTOR_ID is not defined");
  }
  return await nango_client().getConnection(
    NANGO_GOOGLE_DRIVE_CONNECTOR_ID,
    nangoConnectionId,
    false,
    true
  );
}

export async function getAuthObject(
  nangoConnectionId: string
): Promise<OAuth2Client> {
  if (!NANGO_GOOGLE_DRIVE_CONNECTOR_ID) {
    throw new Error("NANGO_GOOGLE_DRIVE_CONNECTOR_ID is not defined");
  }
  const res: NangoGetConnectionRes = await nango_client().getConnection(
    NANGO_GOOGLE_DRIVE_CONNECTOR_ID,
    nangoConnectionId,
    false,
    true
  );
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: res.credentials.access_token,
    scope: res.credentials.raw.scope,
    token_type: res.credentials.raw.token_type,
    expiry_date: new Date(res.credentials.expires_at).getTime(),
    refresh_token: res.credentials.refresh_token,
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
  const textDoc = googleDocJSON2Text(jsonDoc, res.data.title);

  const documentId = `gdrive-${file.id}`;
  await GoogleDriveFiles.upsert({
    connectorId: connectorId,
    dustFileId: documentId,
    driveFileId: file.id,
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
  jsonDoc: ReturnType<typeof convertGoogleDocumentToJson>,
  title: string
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

  const body = arrayDoc.join("\n");
  const result = `$title: ${title}\n\n${body}`;

  return result;
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
  const logger = mainLogger.child({
    provider: "google_drive",
    connectorId: connectorId,
    driveId: driveId,
    nangoConnectionId: nangoConnectionId,
    activity: "incrementalSync",
    runInstance: uuid4(),
  });
  try {
    const lastSyncToken = await getSyncPageToken(
      connectorId,
      nangoConnectionId,
      driveId
    );

    const foldersIds = await getFoldersToSync(connectorId);

    const oauth2client = await getAuthObject(nangoConnectionId);
    const driveClient = await getDriveClient(oauth2client);
    logger.info(`Starting incremental sync.`);
    let nextPageToken: string | undefined = lastSyncToken;
    let changeCount = 0;
    do {
      logger.info(`Querying for changes.`);
      const changesRes: GaxiosResponse<drive_v3.Schema$ChangeList> =
        await driveClient.changes.list({
          driveId: driveId,
          pageToken: nextPageToken,
          pageSize: 100,
          fields: "*",
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
        });

      logger.info(
        {
          nextPageToken,
        },
        `Done fetching changes.`
      );
      if (changesRes.status !== 200) {
        throw new Error(
          `Error getting changes. status_code: ${changesRes.status}. status_text: ${changesRes.statusText}`
        );
      }

      if (changesRes.data.changes === undefined) {
        throw new Error(`changes list is undefined`);
      }

      logger.info(
        {
          nbChanges: changesRes.data.changes.length,
        },
        `Got changes.`
      );
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
        if (
          !(await objectIsInFolder(oauth2client, change.file.id, foldersIds))
        ) {
          continue;
        }
        if (!change.file.createdTime || !change.file.name || !change.file.id) {
          throw new Error(
            `Invalid file. File is: ${JSON.stringify(change.file)}`
          );
        }
        logger.info({ file_id: change.file.id }, "will sync file");

        const driveFile: GoogleDriveFileType = {
          id: change.file.id,
          name: change.file.name,
          createdAtMs: new Date(change.file.createdTime).getTime(),
          updatedAtMs: change.file.modifiedTime
            ? new Date(change.file.modifiedTime).getTime()
            : undefined,
          webViewLink: change.file.webViewLink || undefined,
          lastEditor: change.file.lastModifyingUser
            ? {
                displayName: change.file.lastModifyingUser
                  .displayName as string,
              }
            : undefined,
        };

        await syncOneFile(
          connectorId,
          oauth2client,
          dataSourceConfig,
          driveFile
        );
        logger.info({ file_id: change.file.id }, "done syncing file");
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
  } catch (e) {
    if (e instanceof GaxiosError && e.response?.status === 403) {
      logger.error(
        {
          error: e.message,
        },
        `Looks like we lost access to this drive. Skipping`
      );
      return 0;
    } else {
      throw e;
    }
  }
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

export async function garbageCollector(
  connectorId: ModelId,
  startTs: number
): Promise<number> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const authCredentials = await getAuthObject(connector.connectionId);
  const files = await GoogleDriveFiles.findAll({
    where: {
      connectorId: connectorId,
      garbageCollectedAt: { [Op.or]: [{ [Op.lt]: new Date(startTs) }, null] },
    },
    limit: 100,
  });

  const queue = new PQueue({ concurrency: FILES_GC_CONCURRENCY });
  const selectedFolders = await getFoldersToSync(connectorId);
  await Promise.all(
    files.map(async (file) => {
      return queue.add(async () => {
        if (
          (await objectIsInFolder(
            authCredentials,
            file.driveFileId,
            selectedFolders
          )) === false
        ) {
          await deleteFromDataSource(dataSourceConfig, file.dustFileId);
          await file.destroy();
        } else {
          await file.update({
            garbageCollectedAt: new Date(),
          });
        }
      });
    })
  );

  return files.length;
}
export async function renewWebhooks(pageSize: number): Promise<number> {
  // Find webhook that are about to expire in the next hour.
  const webhooks = await GoogleDriveWebhook.findAll({
    where: {
      renewAt: {
        [Op.lt]: literal("now() + INTERVAL '1 hour'"),
      },
      renewedByWebhookId: null,
    },
    limit: pageSize,
  });

  for (const wh of webhooks) {
    // Renew each webhook.
    await renewOneWebhook(wh.id);
  }

  // Clean up webhooks pointers that expired more than 1 day ago.
  await GoogleDriveWebhook.destroy({
    where: {
      expiresAt: {
        [Op.lt]: literal("now() - INTERVAL '1 day'"),
      },
      renewedByWebhookId: {
        [Op.not]: null,
      },
    },
    limit: pageSize,
  });

  return webhooks.length;
}

export async function renewOneWebhook(webhookId: ModelId) {
  const wh = await GoogleDriveWebhook.findByPk(webhookId);
  if (!wh) {
    throw new Error(`Webhook ${webhookId} not found`);
  }

  const connector = await Connector.findByPk(wh.connectorId);

  if (connector) {
    try {
      const webhookInfo = await registerWebhook(connector.connectionId);
      if (webhookInfo.isErr()) {
        throw webhookInfo.error;
      } else {
        await sequelize_conn.transaction(async (t) => {
          const freshWebhook = await GoogleDriveWebhook.create(
            {
              webhookId: webhookInfo.value.id,
              expiresAt: new Date(webhookInfo.value.expirationTsMs),
              renewAt: new Date(webhookInfo.value.expirationTsMs),
              connectorId: connector.id,
            },
            { transaction: t }
          );
          await wh.update(
            {
              renewedByWebhookId: freshWebhook.webhookId,
            },
            {
              transaction: t,
            }
          );
        });
      }
    } catch (e) {
      logger.error({ error: e }, `Failed to renew webhook`);
      const tags = [
        `connector_id:${wh.connectorId}`,
        `workspaceId:${connector.workspaceId}`,
      ];
      statsDClient.increment(
        "google_drive_renew_webhook_errors.count",
        1,
        tags
      );
    }
  }
}
export async function populateSyncTokens(connectorId: ModelId) {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }
  const drivesIds = await getDrivesIds(connector.connectionId);
  for (const drive of drivesIds) {
    const lastSyncToken = await getSyncPageToken(
      connectorId,
      connector.connectionId,
      drive.id
    );
    await GoogleDriveSyncToken.upsert({
      connectorId: connectorId,
      driveId: drive.id,
      syncToken: lastSyncToken,
    });
  }
}

import fs from "fs/promises";
import { GaxiosError, GaxiosResponse } from "googleapis-common";
import StatsD from "hot-shots";
import os from "os";
import PQueue from "p-queue";

import {
  deleteFromDataSource,
  MAX_DOCUMENT_TXT_LEN,
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

import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { dpdf2text } from "@connectors/lib/dpdf2text";
import {
  Connector,
  GoogleDriveBFSDedup,
  GoogleDriveFiles,
  GoogleDriveFolders,
  GoogleDriveSyncToken,
  GoogleDriveWebhook,
  ModelId,
  sequelize_conn,
} from "@connectors/lib/models";
import logger from "@connectors/logger/logger";

import { registerWebhook } from "../lib";

const FILES_SYNC_CONCURRENCY = 10;
const FILES_GC_CONCURRENCY = 5;

const MIME_TYPES_TO_EXPORT: { [key: string]: string } = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.presentation": "text/plain",
};
// Deactivated CSV for now 20230721 (spolu)
// Deactivated PDF for now 20230803 (fontanierh)
// const MIME_TYPES_TO_DOWNLOAD = ["text/plain", "text/csv", "application/pdf"];
const MIME_TYPES_TO_DOWNLOAD = ["text/plain"];
const MIME_TYPES_TO_SYNC = [
  ...MIME_TYPES_TO_DOWNLOAD,
  ...Object.keys(MIME_TYPES_TO_EXPORT),
];

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
  driveFolderId: string,
  runId: string,
  nextPageToken?: string
): Promise<{
  nextPageToken: string | null;
  count: number;
  subfolders: string[];
}> {
  if (nextPageToken === undefined) {
    // On the first page of a folder id, we can check if we already visited it
    const visitedFolder = await GoogleDriveBFSDedup.findOne({
      where: {
        connectorId: connectorId,
        driveFolderId: driveFolderId,
        runId: runId,
      },
    });
    if (visitedFolder) {
      return { nextPageToken: null, count: 0, subfolders: [] };
    } else {
      await GoogleDriveBFSDedup.create({
        connectorId: connectorId,
        driveFolderId: driveFolderId,
        runId: runId,
      });
    }
  }
  const authCredentials = await getAuthObject(nangoConnectionId);
  const drive = await getDriveClient(authCredentials);
  const mimeTypesSearchString = MIME_TYPES_TO_SYNC.concat(
    "application/vnd.google-apps.folder"
  )
    .map((mimeType) => `mimeType='${mimeType}'`)
    .join(" or ");
  console.log("mimeTypesSearchString", mimeTypesSearchString);
  const res = await drive.files.list({
    corpora: "allDrives",
    pageSize: 200,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields:
      "nextPageToken, files(id, name, parents, mimeType, createdTime, modifiedTime, trashed, webViewLink)",
    q: `'${driveFolderId}' in parents and (${mimeTypesSearchString})`,
    pageToken: nextPageToken,
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
      if (!file.id || !file.createdTime || !file.name || !file.mimeType) {
        throw new Error("Invalid file. File is: " + JSON.stringify(file));
      }
      return {
        id: file.id as string,
        name: file.name,
        mimeType: file.mimeType,
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
  const subfolders = filesToSync
    .filter((file) => file.mimeType === "application/vnd.google-apps.folder")
    .map((file) => file.id);
  const queue = new PQueue({ concurrency: FILES_SYNC_CONCURRENCY });
  const results = await Promise.all(
    filesToSync.map((file) => {
      return queue.add(async () => {
        return await syncOneFile(
          connectorId,
          authCredentials,
          dataSourceConfig,
          file,
          true // isBatchSync
        );
      });
    })
  );
  return {
    nextPageToken: res.data.nextPageToken ? res.data.nextPageToken : null,
    count: results.filter((r) => r).length,
    subfolders: subfolders,
  };
}

async function syncOneFile(
  connectorId: ModelId,
  oauth2client: OAuth2Client,
  dataSourceConfig: DataSourceConfig,
  file: GoogleDriveFileType,
  isBatchSync = false
): Promise<boolean> {
  let documentContent: string | undefined = undefined;
  if (MIME_TYPES_TO_EXPORT[file.mimeType]) {
    const drive = await getDriveClient(oauth2client);
    const res = await drive.files.export({
      fileId: file.id,
      mimeType: MIME_TYPES_TO_EXPORT[file.mimeType],
    });
    if (res.status !== 200) {
      throw new Error(
        `Error exporting Google document. status_code: ${res.status}. status_text: ${res.statusText}`
      );
    }
    if (typeof res.data === "string") {
      documentContent = res.data;
    }
  } else if (MIME_TYPES_TO_DOWNLOAD.includes(file.mimeType)) {
    const drive = await getDriveClient(oauth2client);

    let res;
    try {
      res = await drive.files.get(
        {
          fileId: file.id,
          alt: "media",
        },
        {
          responseType: "arraybuffer",
        }
      );
    } catch (e) {
      const maybeErrorWithCode = e as { code: string };
      if (maybeErrorWithCode.code === "ERR_OUT_OF_RANGE") {
        // This error happens when the file is too big to be downloaded.
        // We skip this file.
        logger.info(
          {
            file_id: file.id,
            mimeType: file.mimeType,
            title: file.name,
          },
          `File too big to be downloaded. Skipping`
        );
        return false;
      }
      throw e;
    }

    if (res.status !== 200) {
      throw new Error(
        `Error downloading Google document. status_code: ${res.status}. status_text: ${res.statusText}`
      );
    }

    if (file.mimeType === "text/plain") {
      if (res.data instanceof ArrayBuffer) {
        documentContent = Buffer.from(res.data).toString("utf-8");
      }
    } else if (file.mimeType === "application/pdf") {
      const pdf_path = os.tmpdir() + "/" + uuid4() + ".pdf";
      try {
        if (res.data instanceof ArrayBuffer) {
          await fs.writeFile(pdf_path, Buffer.from(res.data), "binary");
        }

        const pdfTextData = await dpdf2text(pdf_path);

        documentContent = pdfTextData;
        logger.info(
          {
            file_id: file.id,
            mimeType: file.mimeType,
            title: file.name,
          },
          `Successfully converted PDF to text`
        );
      } catch (err) {
        logger.warn(
          {
            error: err,
            file_id: file.id,
            mimeType: file.mimeType,
            filename: file.name,
          },
          `Error while converting PDF to text`
        );
        // we don't know what to do with PDF files that fails to be converted to text.
        // So we log the error and skip the file.
        return false;
      } finally {
        await fs.unlink(pdf_path);
      }
    }
  } else {
    // We do not support this file type
    return false;
  }
  //Adding the title of the file to the beginning of the document
  documentContent = `$title:${file.name}\n\n${documentContent}`;

  if (documentContent === undefined) {
    throw new Error("documentContent is undefined");
  }
  const tags = [`title:${file.name}`];
  if (file.updatedAtMs) {
    tags.push(`lastEditedAt:${file.updatedAtMs}`);
  }
  if (file.createdAtMs) {
    tags.push(`createdAt:${file.createdAtMs}`);
  }
  if (file.lastEditor) {
    tags.push(`lastEditor:${file.lastEditor.displayName}`);
  }

  const documentId = `gdrive-${file.id}`;
  await GoogleDriveFiles.upsert({
    connectorId: connectorId,
    dustFileId: documentId,
    driveFileId: file.id,
  });

  if (documentContent.length <= MAX_DOCUMENT_TXT_LEN) {
    await upsertToDatasource({
      dataSourceConfig,
      documentId,
      documentText: documentContent,
      documentUrl: file.webViewLink,
      timestampMs: file.updatedAtMs,
      tags,
      parents: [],
      upsertContext: {
        sync_type: isBatchSync ? "batch" : "incremental",
      },
    });

    return true;
  } else {
    logger.info(
      {
        documentId,
        dataSourceConfig,
        documentLen: documentContent.length,
        title: file.name,
      },
      `Document too big to be upserted. Skipping`
    );
  }

  return false;
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
  if (res.data.trashed) {
    // When a file is trashed, we don't want to consider its other parent folder.
    return [];
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
  driveId: string,
  nextPageToken?: string
): Promise<string | undefined> {
  const logger = mainLogger.child({
    provider: "google_drive",
    connectorId: connectorId,
    driveId: driveId,
    nangoConnectionId: nangoConnectionId,
    activity: "incrementalSync",
    runInstance: uuid4(),
  });
  try {
    if (!nextPageToken) {
      nextPageToken = await getSyncPageToken(
        connectorId,
        nangoConnectionId,
        driveId
      );
    }

    const foldersIds = await getFoldersToSync(connectorId);

    const oauth2client = await getAuthObject(nangoConnectionId);
    const driveClient = await getDriveClient(oauth2client);
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
      if (change.changeType !== "file" || !change.file) {
        continue;
      }
      if (
        !change.file.mimeType ||
        !MIME_TYPES_TO_SYNC.includes(change.file.mimeType)
      ) {
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
      logger.info({ file_id: change.file.id }, "will sync file");

      const driveFile: GoogleDriveFileType = {
        id: change.file.id,
        name: change.file.name,
        mimeType: change.file.mimeType,
        createdAtMs: new Date(change.file.createdTime).getTime(),
        updatedAtMs: change.file.modifiedTime
          ? new Date(change.file.modifiedTime).getTime()
          : undefined,
        webViewLink: change.file.webViewLink || undefined,
        lastEditor: change.file.lastModifyingUser
          ? {
              displayName: change.file.lastModifyingUser.displayName as string,
            }
          : undefined,
      };

      await syncOneFile(connectorId, oauth2client, dataSourceConfig, driveFile);
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

    return nextPageToken;
  } catch (e) {
    if (e instanceof GaxiosError && e.response?.status === 403) {
      logger.error(
        {
          error: e.message,
        },
        `Looks like we lost access to this drive. Skipping`
      );
      return undefined;
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
        try {
          const isInFolder = await objectIsInFolder(
            authCredentials,
            file.driveFileId,
            selectedFolders
          );

          if (isInFolder === false) {
            await deleteOneFile(connectorId, file.driveFileId);
          } else {
            await file.update({
              garbageCollectedAt: new Date(),
            });
          }
        } catch (e) {
          if (e instanceof GaxiosError) {
            if (e.response?.status === 404) {
              // File not found, we can delete it.
              await deleteOneFile(connectorId, file.driveFileId);
            }
          }
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
      // retry in two hours in case of failure
      await wh.update({
        renewAt: literal("NOW() + INTERVAL '2 hour'"),
      });
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

export async function garbageCollectorFinished(connectorId: ModelId) {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  connector.lastGCTime = new Date();
  await connector.save();
}

export async function getLastGCTime(connectorId: ModelId): Promise<number> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }
  return connector.lastGCTime?.getTime() || 0;
}

async function deleteOneFile(connectorId: ModelId, driveFileId: string) {
  const googleDriveFile = await GoogleDriveFiles.findOne({
    where: {
      connectorId: connectorId,
      driveFileId: driveFileId,
    },
  });
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }
  // Only clean up files that we were syncing.
  if (googleDriveFile) {
    logger.info(
      {
        driveFileId,
        connectorId,
      },
      `Deleting Google Drive file.`
    );
    const dataSourceConfig = dataSourceConfigFromConnector(connector);
    await deleteFromDataSource(dataSourceConfig, googleDriveFile.dustFileId);
    await googleDriveFile.destroy();
  }
  return;
}

// When exploring the Google Drive API, we need to keep track of the folders
// we already explored. This is done by storing the folderId in a table.
// This function clean-up the list of folders already visited on previous instances
// of the full sync workflow.
export async function cleanupDedupList(connectorId: ModelId, runId: string) {
  await GoogleDriveBFSDedup.destroy({
    where: {
      connectorId: connectorId,
      runId: { [Op.not]: runId },
    },
  });
}

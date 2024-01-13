import fs from "fs/promises";
import { GaxiosError, GaxiosResponse } from "googleapis-common";
import StatsD from "hot-shots";
import os from "os";
import PQueue from "p-queue";

import {
  deleteFromDataSource,
  MAX_DOCUMENT_TXT_LEN,
  renderDocumentTitleAndContent,
  upsertToDatasource,
} from "@connectors/lib/data_sources";
import { HTTPError } from "@connectors/lib/error";
import { nango_client } from "@connectors/lib/nango_client";
import mainLogger from "@connectors/logger/logger";
import { DataSourceConfig } from "@connectors/types/data_source_config";
import { GoogleDriveObjectType } from "@connectors/types/google_drive";
const { NANGO_GOOGLE_DRIVE_CONNECTOR_ID = "google" } = process.env;
import { cacheWithRedis, ModelId } from "@dust-tt/types";
import { uuid4 } from "@temporalio/workflow";
import { google } from "googleapis";
import { drive_v3 } from "googleapis";
import { OAuth2Client } from "googleapis-common";
import { CreationAttributes, literal, Op } from "sequelize";

import { registerWebhook } from "@connectors/connectors/google_drive/lib";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { dpdf2text } from "@connectors/lib/dpdf2text";
import { ExternalOauthTokenError } from "@connectors/lib/error";
import { Connector, sequelize_conn } from "@connectors/lib/models";
import {
  GoogleDriveConfig,
  GoogleDriveFiles,
  GoogleDriveFolders,
  GoogleDriveSyncToken,
  GoogleDriveWebhook,
} from "@connectors/lib/models/google_drive";
import { getConnectionFromNango } from "@connectors/lib/nango_helpers";
import { syncFailed } from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";

const FILES_SYNC_CONCURRENCY = 10;
const FILES_GC_CONCURRENCY = 5;

const GDRIVE_FILE_IDS_BLACKLIST = [
  "1IR3Ql2-QfGf9VUIqTqAunzYJi0pQNg3u",
  "1Seekzy_3m_P0blWP37mU2roMc5HYtULH",
  "1aUUY4nDPrM8YCxFybW_ClVud4TnqQC1w",
  "10Yaj4T-_UOzSaE7Ea0qEZLULU1noZWSX",
  "1YEfZGWPK_fULC3ZWb5vD6YYJKYJ1nUdG",
];

export const MIME_TYPES_TO_EXPORT: { [key: string]: string } = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.presentation": "text/plain",
};

async function getMimeTypesToDownload(connectorId: ModelId) {
  const mimeTypes = ["text/plain"];
  const config = await GoogleDriveConfig.findOne({
    where: {
      connectorId: connectorId,
    },
  });
  if (config?.pdfEnabled) {
    mimeTypes.push("application/pdf");
  }

  return mimeTypes;
}

async function getMimesTypeToSync(connectorId: ModelId) {
  const mimeTypes = await getMimeTypesToDownload(connectorId);
  mimeTypes.push(...Object.keys(MIME_TYPES_TO_EXPORT));
  mimeTypes.push("application/vnd.google-apps.folder");

  return mimeTypes;
}

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
  return nango_client().getConnection(
    NANGO_GOOGLE_DRIVE_CONNECTOR_ID,
    nangoConnectionId,
    false
  );
}

export async function getAuthObject(
  nangoConnectionId: string
): Promise<OAuth2Client> {
  if (!NANGO_GOOGLE_DRIVE_CONNECTOR_ID) {
    throw new Error("NANGO_GOOGLE_DRIVE_CONNECTOR_ID is not defined");
  }
  const res: NangoGetConnectionRes = await getConnectionFromNango({
    connectionId: nangoConnectionId,
    integrationId: NANGO_GOOGLE_DRIVE_CONNECTOR_ID,
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

export async function getDrivesIds(connectorId: ModelId): Promise<
  {
    id: string;
    name: string;
    sharedDrive: boolean;
  }[]
> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }
  const drive = await getDriveClient(connector.connectionId);

  let nextPageToken: string | undefined | null = undefined;
  const ids: { id: string; name: string; sharedDrive: boolean }[] = [];
  const myDriveRes = await drive.files.get({ fileId: "root" });
  if (myDriveRes.status !== 200) {
    throw new Error(
      `Error getting my drive. status_code: ${myDriveRes.status}. status_text: ${myDriveRes.statusText}`
    );
  }
  if (!myDriveRes.data.id) {
    throw new Error("My drive id is undefined");
  }
  ids.push({ id: myDriveRes.data.id, name: "My Drive", sharedDrive: false });
  do {
    const res: GaxiosResponse<drive_v3.Schema$DriveList> =
      await drive.drives.list({
        pageSize: 100,
        fields: "nextPageToken, drives(id, name)",
        pageToken: nextPageToken,
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
        ids.push({ id: drive.id, name: drive.name, sharedDrive: true });
      }
    }
    nextPageToken = res.data.nextPageToken;
  } while (nextPageToken);

  return ids;
}

export async function syncFiles(
  connectorId: ModelId,
  dataSourceConfig: DataSourceConfig,
  driveFolderId: string,
  startSyncTs: number,
  nextPageToken?: string
): Promise<{
  nextPageToken: string | null;
  count: number;
  subfolders: string[];
}> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }
  const mimeTypeToSync = await getMimesTypeToSync(connectorId);
  const authCredentials = await getAuthObject(connector.connectionId);
  const driveFolder = await getGoogleDriveObject(
    authCredentials,
    driveFolderId
  );
  if (!driveFolder) {
    // We got a 404 on this folder, we skip it.
    logger.info(
      { driveFolderId },
      `Google Drive Folder unexpectedly not found (got 404)`
    );
    return {
      nextPageToken: null,
      count: 0,
      subfolders: [],
    };
  }
  if (nextPageToken === undefined) {
    // On the first page of a folder id, we can check if we already visited it
    const visitedFolder = await GoogleDriveFiles.findOne({
      where: {
        connectorId: connectorId,
        driveFileId: driveFolder.id,
        lastSeenTs: {
          [Op.gte]: new Date(startSyncTs),
        },
      },
    });
    if (visitedFolder) {
      return { nextPageToken: null, count: 0, subfolders: [] };
    }
  }

  const drive = await getDriveClient(authCredentials);
  const mimeTypesSearchString = mimeTypeToSync
    .map((mimeType) => `mimeType='${mimeType}'`)
    .join(" or ");

  const res = await drive.files.list({
    corpora: "allDrives",
    pageSize: 200,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields:
      "nextPageToken, files(id, name, parents, mimeType, createdTime, lastModifyingUser, modifiedTime, trashed, webViewLink)",
    q: `'${driveFolder.id}' in parents and (${mimeTypesSearchString}) and trashed=false`,
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
  const filesToSync = await Promise.all(
    res.data.files
      .filter((file) => file.id && file.createdTime)
      .map(async (file) => {
        if (!file.id || !file.createdTime || !file.name || !file.mimeType) {
          throw new Error("Invalid file. File is: " + JSON.stringify(file));
        }
        return driveObjectToDustType(file, authCredentials);
      })
  );
  const subfolders = filesToSync
    .filter((file) => file.mimeType === "application/vnd.google-apps.folder")
    .map((f) => f.id);

  const queue = new PQueue({ concurrency: FILES_SYNC_CONCURRENCY });
  const results = await Promise.all(
    filesToSync.map((file) => {
      return queue.add(async () => {
        if (!file.trashed) {
          return syncOneFile(
            connectorId,
            authCredentials,
            dataSourceConfig,
            file,
            startSyncTs,
            true // isBatchSync
          );
        } else {
          await deleteOneFile(connectorId, file);
        }
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
  file: GoogleDriveObjectType,
  startSyncTs: number,
  isBatchSync = false
): Promise<boolean> {
  const mimeTypesToDownload = await getMimeTypesToDownload(connectorId);
  const documentId = getDocumentId(file.id);
  let documentContent: string | undefined = undefined;

  const fileInDb = await GoogleDriveFiles.findOne({
    where: {
      connectorId: connectorId,
      driveFileId: file.id,
    },
  });

  if (fileInDb?.skipReason) {
    logger.info(
      {
        documentId,
        dataSourceConfig,
        fileId: file.id,
        title: file.name,
      },
      `Google Drive document skipped with skip reason ${fileInDb.skipReason}`
    );
    return false;
  }

  if (MIME_TYPES_TO_EXPORT[file.mimeType]) {
    const drive = await getDriveClient(oauth2client);
    try {
      const res = await drive.files.export({
        fileId: file.id,
        mimeType: MIME_TYPES_TO_EXPORT[file.mimeType],
      });
      if (res.status !== 200) {
        logger.error(
          {
            documentId,
            dataSourceConfig,
            fileId: file.id,
            title: file.name,
          },
          "Error exporting Google document"
        );
        throw new Error(
          `Error exporting Google document. status_code: ${res.status}. status_text: ${res.statusText}`
        );
      }
      if (typeof res.data === "string") {
        documentContent = res.data;
      } else if (
        typeof res.data === "object" ||
        typeof res.data === "number" ||
        typeof res.data === "boolean" ||
        typeof res.data === "bigint"
      ) {
        // In case the contents returned by the file export matches a JS type,
        // we need to convert it
        //  e.g. a google presentation with just the number
        // 1 in it, the export will return the number 1 instead of a string
        documentContent = res.data?.toString();
      } else {
        logger.error(
          {
            connectorId: connectorId,
            documentId,
            fileMimeType: file.mimeType,
            fileId: file.id,
            title: file.name,
            resDataTypeOf: typeof res.data,
            type: "export",
          },
          "Unexpected GDrive export response type"
        );
      }
    } catch (e) {
      logger.error(
        {
          documentId,
          dataSourceConfig,
          fileId: file.id,
          title: file.name,
        },
        "Error exporting Google document"
      );
      throw e;
    }
  } else if (mimeTypesToDownload.includes(file.mimeType)) {
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
        // If data is > 4 times the limit, we skip the file since even if
        // converted to utf-8 it will overcome the limit enforced below. This
        // avoids operations on very long text files, that can cause
        // Buffer.toString to crash if the file is > 500MB
        if (res.data.byteLength > 4 * MAX_DOCUMENT_TXT_LEN) {
          logger.info(
            {
              file_id: file.id,
              mimeType: file.mimeType,
              title: file.name,
            },
            `File too big to be chunked. Skipping`
          );
          return false;
        }
        documentContent = Buffer.from(res.data).toString("utf-8");
      } else {
        logger.error(
          {
            connectorId: connectorId,
            documentId,
            fileMimeType: file.mimeType,
            fileId: file.id,
            title: file.name,
            resDataTypeOf: typeof res.data,
            type: "download",
          },
          "Unexpected GDrive export response type"
        );
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

  if (GDRIVE_FILE_IDS_BLACKLIST.includes(file.id)) {
    logger.info(
      {
        file_id: file.id,
        title: file.name,
      },
      `File ID is blacklisted. Skipping`
    );
    return false;
  }

  if (!documentContent || documentContent.trim().length === 0) {
    logger.info(
      {
        connectorId: connectorId,
        documentId,
        fileMimeType: file.mimeType,
        fileId: file.id,
        title: file.name,
      },
      "Skipping empty document"
    );

    return false;
  }

  const content = renderDocumentTitleAndContent({
    title: file.name,
    updatedAt: file.updatedAtMs ? new Date(file.updatedAtMs) : undefined,
    createdAt: file.createdAtMs ? new Date(file.createdAtMs) : undefined,
    lastEditor: file.lastEditor ? file.lastEditor.displayName : undefined,
    content: documentContent
      ? { prefix: null, content: documentContent, sections: [] }
      : null,
  });

  if (documentContent === undefined) {
    logger.error(
      {
        connectorId: connectorId,
        documentId,
        fileMimeType: file.mimeType,
        fileId: file.id,
        title: file.name,
      },
      "documentContent is undefined"
    );
    throw new Error("documentContent is undefined");
  }
  const tags = [`title:${file.name}`];
  if (file.updatedAtMs) {
    tags.push(`updatedAt:${file.updatedAtMs}`);
  }
  if (file.createdAtMs) {
    tags.push(`createdAt:${file.createdAtMs}`);
  }
  if (file.lastEditor) {
    tags.push(`lastEditor:${file.lastEditor.displayName}`);
  }
  tags.push(`mimeType:${file.mimeType}`);

  let upsertTimestampMs: number | undefined = undefined;

  if (documentContent.length <= MAX_DOCUMENT_TXT_LEN) {
    const parents = (
      await getFileParentsMemoized(connectorId, oauth2client, file, startSyncTs)
    ).map((f) => f.id);
    parents.push(file.id);
    parents.reverse();

    await upsertToDatasource({
      dataSourceConfig,
      documentId,
      documentContent: content,
      documentUrl: file.webViewLink,
      timestampMs: file.updatedAtMs,
      tags,
      parents: parents,
      upsertContext: {
        sync_type: isBatchSync ? "batch" : "incremental",
      },
    });

    upsertTimestampMs = file.updatedAtMs;
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

  const params: CreationAttributes<GoogleDriveFiles> = {
    connectorId: connectorId,
    dustFileId: documentId,
    driveFileId: file.id,
    name: file.name,
    mimeType: file.mimeType,
    parentId: file.parent,
    lastSeenTs: new Date(),
  };

  if (upsertTimestampMs) {
    params.lastUpsertedTs = new Date(upsertTimestampMs);
  }

  await GoogleDriveFiles.upsert(params);

  return !!upsertTimestampMs;
}

// Please consider using the memoized version getFileParentsMemoized instead of this one.
async function getFileParents(
  connectorId: ModelId,
  authCredentials: OAuth2Client,
  driveFile: GoogleDriveObjectType,
  /* eslint-disable @typescript-eslint/no-unused-vars */
  startSyncTs: number
): Promise<GoogleDriveObjectType[]> {
  const logger = mainLogger.child({
    provider: "google_drive",
    connectorId: connectorId,
  });
  const parents: GoogleDriveObjectType[] = [];
  let currentObject = driveFile;
  while (currentObject.parent) {
    const parent = await getGoogleDriveObject(
      authCredentials,
      currentObject.parent
    );
    if (!parent) {
      // If we got a 404 error we stop the iteration as the parent disappeared.
      logger.info("Parent not found in `getFileParents`", {
        parentId: currentObject.parent,
        fileId: driveFile.id,
      });
      break;
    }
    parents.push(parent);
    currentObject = parent;
  }

  return parents.reverse();
}

export const getFileParentsMemoized = cacheWithRedis(
  getFileParents,
  (
    connectorId: ModelId,
    authCredentials: OAuth2Client,
    driveFile: GoogleDriveObjectType,
    startSyncTs: number
  ) => {
    const cacheKey = `${connectorId}-${startSyncTs}-${driveFile.id}`;

    return cacheKey;
  },
  60 * 10 * 1000
);

export async function objectIsInFolders(
  connectorId: ModelId,
  authCredentials: OAuth2Client,
  driveFile: GoogleDriveObjectType,
  foldersIds: string[],
  startSyncTs: number
): Promise<boolean> {
  const parents = await getFileParentsMemoized(
    connectorId,
    authCredentials,
    driveFile,
    startSyncTs
  );
  for (const parent of parents) {
    if (foldersIds.includes(parent.id)) {
      return true;
    }
  }

  return false;
}

export async function incrementalSync(
  connectorId: ModelId,
  dataSourceConfig: DataSourceConfig,
  driveId: string,
  sharedDrive: boolean,
  startSyncTs: number,
  nextPageToken?: string
): Promise<string | undefined> {
  const logger = mainLogger.child({
    provider: "google_drive",
    connectorId: connectorId,
    driveId: driveId,
    activity: "incrementalSync",
    runInstance: uuid4(),
  });
  try {
    const connector = await Connector.findByPk(connectorId);
    if (!connector) {
      throw new Error(`Connector ${connectorId} not found`);
    }
    if (!nextPageToken) {
      nextPageToken = await getSyncPageToken(connectorId, driveId, sharedDrive);
    }
    const mimeTypesToSync = await getMimesTypeToSync(connectorId);

    const selectedFoldersIds = await getFoldersToSync(connectorId);

    const authCredentials = await getAuthObject(connector.connectionId);
    const driveClient = await getDriveClient(authCredentials);

    let opts: drive_v3.Params$Resource$Changes$List = {
      pageToken: nextPageToken,
      pageSize: 100,
      fields: "*",
    };
    if (sharedDrive) {
      opts = {
        ...opts,
        driveId: driveId,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      };
    }
    const changesRes: GaxiosResponse<drive_v3.Schema$ChangeList> =
      await driveClient.changes.list(opts);

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
        !mimeTypesToSync.includes(change.file.mimeType)
      ) {
        continue;
      }
      if (!change.file.id) {
        continue;
      }
      const file = await driveObjectToDustType(change.file, authCredentials);
      if (
        !(await objectIsInFolders(
          connectorId,
          authCredentials,
          file,
          selectedFoldersIds,
          startSyncTs
        )) ||
        change.file.trashed
      ) {
        // The current file is not in the list of selected folders.
        // If we have it locally, we need to garbage collect it.
        const localFile = await GoogleDriveFiles.findOne({
          where: {
            connectorId: connectorId,
            driveFileId: change.file.id,
          },
        });
        if (localFile) {
          await deleteOneFile(connectorId, file);
        }
        continue;
      }

      if (!change.file.createdTime || !change.file.name || !change.file.id) {
        throw new Error(
          `Invalid file. File is: ${JSON.stringify(change.file)}`
        );
      }
      logger.info({ file_id: change.file.id }, "will sync file");

      const driveFile: GoogleDriveObjectType = await driveObjectToDustType(
        change.file,
        authCredentials
      );
      if (driveFile.mimeType === "application/vnd.google-apps.folder") {
        await GoogleDriveFiles.upsert({
          connectorId: connectorId,
          dustFileId: getDocumentId(driveFile.id),
          driveFileId: file.id,
          name: file.name,
          mimeType: file.mimeType,
          parentId: file.parent,
          lastSeenTs: new Date(),
        });
        logger.info({ file_id: change.file.id }, "done syncing file");

        continue;
      }
      await syncOneFile(
        connectorId,
        authCredentials,
        dataSourceConfig,
        driveFile,
        startSyncTs
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
  driveId: string,
  sharedDrive: boolean
) {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }
  const last = await GoogleDriveSyncToken.findOne({
    where: {
      connectorId: connectorId,
      driveId: driveId,
    },
  });
  if (last) {
    return last.syncToken;
  }
  const driveClient = await getDriveClient(connector.connectionId);
  let lastSyncToken = undefined;
  if (!lastSyncToken) {
    let opts = {};
    if (sharedDrive) {
      opts = {
        driveId: driveId,
        supportsAllDrives: true,
      };
    }
    const startTokenRes = await driveClient.changes.getStartPageToken(opts);
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

/**
 * @param lastSeenTs Garbage collect all files that have not been seen since this timestamp.
 */
export async function garbageCollector(
  connectorId: ModelId,
  lastSeenTs: number
): Promise<number> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const authCredentials = await getAuthObject(connector.connectionId);
  const files = await GoogleDriveFiles.findAll({
    where: {
      connectorId: connectorId,
      lastSeenTs: { [Op.or]: [{ [Op.lt]: new Date(lastSeenTs) }, null] },
    },
    limit: 100,
  });

  const queue = new PQueue({ concurrency: FILES_GC_CONCURRENCY });
  const selectedFolders = await getFoldersToSync(connectorId);
  await Promise.all(
    files.map(async (file) => {
      return queue.add(async () => {
        const driveFile = await getGoogleDriveObject(
          authCredentials,
          file.driveFileId
        );
        if (!driveFile) {
          // Could not find the file on Gdrive, deleting our local reference to it.
          await deleteFile(file);
          return null;
        }
        const isInFolder = await objectIsInFolders(
          connectorId,
          authCredentials,
          driveFile,
          selectedFolders,
          lastSeenTs
        );
        if (isInFolder === false || driveFile.trashed) {
          await deleteOneFile(connectorId, driveFile);
        } else {
          await file.update({
            lastSeenTs: new Date(),
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
  logger.info({ count: webhooks.length }, `Renewing webhooks`);

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
      const webhookInfo = await registerWebhook(connector);
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
      if (e instanceof ExternalOauthTokenError) {
        logger.info(
          {
            error: e,
            connectorId: wh.connectorId,
            workspaceId: connector.workspaceId,
            id: wh.id,
          },
          `Deleting webhook because the oauth token was revoked.`
        );
        await wh.destroy();
        return;
      }

      if (
        e instanceof HTTPError &&
        e.message === "The caller does not have permission"
      ) {
        await syncFailed(connector.id, "oauth_token_revoked");
        logger.error(
          {
            error: e,
            connectorId: wh.connectorId,
            workspaceId: connector.workspaceId,
            id: wh.id,
          },
          `Failed to renew webhook: Received "The caller does not have permission" from Google.`
        );
        return;
      }

      logger.error(
        {
          error: e,
          connectorId: wh.connectorId,
          workspaceId: connector.workspaceId,
          id: wh.id,
        },
        `Failed to renew webhook`
      );
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
  const drivesIds = await getDrivesIds(connector.id);
  for (const drive of drivesIds) {
    const lastSyncToken = await getSyncPageToken(
      connectorId,
      drive.id,
      drive.sharedDrive
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

async function deleteOneFile(
  connectorId: ModelId,
  file: GoogleDriveObjectType
) {
  const googleDriveFile = await GoogleDriveFiles.findOne({
    where: {
      connectorId: connectorId,
      driveFileId: file.id,
    },
  });
  // Only clean up files that we were syncing
  if (!googleDriveFile) {
    return;
  }
  await deleteFile(googleDriveFile);
}

async function deleteFile(googleDriveFile: GoogleDriveFiles) {
  const connectorId = googleDriveFile.connectorId;
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }
  logger.info(
    {
      driveFileId: googleDriveFile.driveFileId,
      connectorId,
    },
    `Deleting Google Drive file.`
  );

  if (googleDriveFile.mimeType !== "application/vnd.google-apps.folder") {
    const dataSourceConfig = dataSourceConfigFromConnector(connector);
    await deleteFromDataSource(dataSourceConfig, googleDriveFile.dustFileId);
  }
  await googleDriveFile.destroy();
}

export async function getGoogleDriveObject(
  authCredentials: OAuth2Client,
  driveObjectId: string
): Promise<GoogleDriveObjectType | null> {
  const drive = await getDriveClient(authCredentials);

  try {
    const res = await drive.files.get({
      fileId: driveObjectId,
      supportsAllDrives: true,
      fields: "*",
    });
    if (res.status !== 200) {
      throw new Error(
        `Error getting files. status_code: ${res.status}. status_text: ${res.statusText}`
      );
    }
    const file = res.data;

    return await driveObjectToDustType(file, authCredentials);
  } catch (e) {
    if ((e as GaxiosError).response?.status === 404) {
      return null;
    }
    throw e;
  }
}

export async function driveObjectToDustType(
  file: drive_v3.Schema$File,
  authCredentials: OAuth2Client
): Promise<GoogleDriveObjectType> {
  if (!file.name || !file.mimeType || !file.createdTime) {
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
    };
  }
}

export function getDocumentId(driveFileId: string): string {
  return `gdrive-${driveFileId}`;
}

export async function markFolderAsVisited(
  connectorId: ModelId,
  driveFileId: string
) {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }
  const authCredentials = await getAuthObject(connector.connectionId);
  const file = await getGoogleDriveObject(authCredentials, driveFileId);

  if (!file) {
    logger.info(
      { driveFileId },
      `Google Drive File unexpectedly not found (got 404)`
    );
    // We got a 404 on this folder, we skip it.
    return;
  }

  await GoogleDriveFiles.upsert({
    connectorId: connectorId,
    dustFileId: getDocumentId(driveFileId),
    driveFileId: file.id,
    name: file.name,
    mimeType: file.mimeType,
    parentId: file.parent,
    lastSeenTs: new Date(),
  });
}

export async function folderHasChildren(
  connectorId: ModelId,
  folderId: string
): Promise<boolean> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const drive = await getDriveClient(connector.connectionId);
  const res = await drive.files.list({
    corpora: "allDrives",
    pageSize: 1,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields:
      "nextPageToken, files(id, name, parents, mimeType, createdTime, modifiedTime, trashed, webViewLink)",
    q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder'`,
  });
  if (!res.data.files) {
    return false;
  }

  return res.data.files?.length > 0;
}

import PQueue from "p-queue";
import { Op } from "sequelize";

import { getGoogleDriveObject } from "@connectors/connectors/google_drive/lib/google_drive_api";
import { FILES_SYNC_CONCURRENCY } from "@connectors/connectors/google_drive/temporal/activities/common/constants";
import { deleteOneFile } from "@connectors/connectors/google_drive/temporal/activities/common/utils";
import { syncOneFile } from "@connectors/connectors/google_drive/temporal/file";
import { getMimeTypesToSync } from "@connectors/connectors/google_drive/temporal/mime_types";
import {
  driveObjectToDustType,
  getAuthObject,
  getCachedLabels,
  getDriveClient,
} from "@connectors/connectors/google_drive/temporal/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  GoogleDriveConfig,
  GoogleDriveFiles,
} from "@connectors/lib/models/google_drive";
import { heartbeat } from "@connectors/lib/temporal";
import { getActivityLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import { FILE_ATTRIBUTES_TO_FETCH } from "@connectors/types";

export async function syncFiles(
  connectorId: ModelId,
  driveFolderId: string,
  startSyncTs: number,
  nextPageToken?: string,
  mimeTypeFilter?: string[]
): Promise<{
  nextPageToken: string | null;
  count: number;
  subfolders: string[];
}> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }
  const config = await GoogleDriveConfig.findOne({
    where: {
      connectorId: connectorId,
    },
  });

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const activityLogger = getActivityLogger(connector);

  activityLogger.info(
    {
      connectorId,
      folderId: driveFolderId,
      dataSourceId: dataSourceConfig.dataSourceId,
    },
    `[SyncFiles] Start sync.`
  );

  const mimeTypesToSync = getMimeTypesToSync({
    pdfEnabled: config?.pdfEnabled || false,
    csvEnabled: config?.csvEnabled || false,
  });
  const authCredentials = await getAuthObject(connector.connectionId);
  const driveFolder = await getGoogleDriveObject({
    connectorId,
    authCredentials,
    driveObjectId: driveFolderId,
    cacheKey: { connectorId, ts: startSyncTs },
  });
  await heartbeat();
  if (!driveFolder) {
    // We got a 404 on this folder, we skip it.
    activityLogger.info(
      {
        connectorId,
        folderId: driveFolderId,
        dataSourceId: dataSourceConfig.dataSourceId,
      },
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

  const labels = await getCachedLabels(connectorId, authCredentials);

  const drive = await getDriveClient(authCredentials);
  const mimeTypesSearchString = mimeTypesToSync
    .filter(
      (mimeType) =>
        mimeTypeFilter === undefined || mimeTypeFilter.includes(mimeType)
    )
    .map((mimeType) => `mimeType='${mimeType}'`)
    .join(" or ");

  const res = await drive.files.list({
    corpora: "allDrives",
    pageSize: 200,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    includeLabels: labels.map((l) => l.id).join(","),
    fields: `nextPageToken, files(${FILE_ATTRIBUTES_TO_FETCH.join(",")})`,
    q: `'${driveFolder.id}' in parents and (${mimeTypesSearchString}) and trashed=false`,
    ...(nextPageToken ? { pageToken: nextPageToken } : {}),
  });
  if (res.status !== 200) {
    throw new Error(
      `Error getting files. status_code: ${res.status}. status_text: ${res.statusText}`
    );
  }
  if (!res.data.files) {
    throw new Error("Files list is undefined");
  }
  await heartbeat();
  const filesToSync = await Promise.all(
    res.data.files
      .filter((file) => file.id && file.createdTime)
      .map(async (file) => {
        if (!file.id || !file.createdTime || !file.name || !file.mimeType) {
          throw new Error("Invalid file. File is: " + JSON.stringify(file));
        }
        return driveObjectToDustType(connectorId, file, authCredentials);
      })
  );
  const subfolders = filesToSync.filter(
    (file) => file.mimeType === "application/vnd.google-apps.folder"
  );

  activityLogger.info(
    {
      connectorId,
      dataSourceId: dataSourceConfig.dataSourceId,
      folderId: driveFolderId,
      count: filesToSync.length,
    },
    `[SyncFiles] Call syncOneFile.`
  );

  const queue = new PQueue({ concurrency: FILES_SYNC_CONCURRENCY });
  const results = await Promise.all(
    filesToSync.map((file) => {
      return queue.add(async () => {
        await heartbeat();
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

  const count = results.filter((r) => r).length;

  activityLogger.info(
    {
      connectorId,
      dataSourceId: dataSourceConfig.dataSourceId,
      folderId: driveFolderId,
      count,
    },
    `[SyncFiles] Successful sync.`
  );

  return {
    nextPageToken: res.data.nextPageToken ? res.data.nextPageToken : null,
    count,
    subfolders: subfolders.map((f) => f.id),
  };
}

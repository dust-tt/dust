import { uuid4 } from "@temporalio/workflow";
import type { drive_v3 } from "googleapis";
import type { GaxiosResponse } from "googleapis-common";
import { GaxiosError } from "googleapis-common";
import type { RedisClientType } from "redis";

import { updateParentsField } from "@connectors/connectors/google_drive/lib";
import { getFileParentsMemoized } from "@connectors/connectors/google_drive/lib/hierarchy";
import {
  deleteOneFile,
  getSyncPageToken,
  objectIsInFolderSelection,
} from "@connectors/connectors/google_drive/temporal/activities/common/utils";
import { getFoldersToSync } from "@connectors/connectors/google_drive/temporal/activities/get_folders_to_sync";
import { syncOneFile } from "@connectors/connectors/google_drive/temporal/file";
import { getMimeTypesToSync } from "@connectors/connectors/google_drive/temporal/mime_types";
import {
  driveObjectToDustType,
  getAuthObject,
  getCachedLabels,
  getDriveClient,
  getInternalId,
  isSharedDriveNotFoundError,
} from "@connectors/connectors/google_drive/temporal/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  GoogleDriveConfig,
  GoogleDriveFiles,
  GoogleDriveSyncToken,
} from "@connectors/lib/models/google_drive";
import { heartbeat } from "@connectors/lib/temporal";
import type { Logger } from "@connectors/logger/logger";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { GoogleDriveObjectType, ModelId } from "@connectors/types";
import { WithRetriesError } from "@connectors/types";
import { redisClient } from "@connectors/types/shared/redis";

export async function incrementalSync(
  connectorId: ModelId,
  driveId: string,
  isSharedDrive: boolean,
  startSyncTs: number,
  nextPageToken?: string
): Promise<
  { nextPageToken: string | undefined; newFolders: string[] } | undefined
> {
  const localLogger = logger.child({
    provider: "google_drive",
    connectorId: connectorId,
    driveId: driveId,
    activity: "incrementalSync",
    runInstance: uuid4(),
  });
  const redisCli = await redisClient({
    origin: "google_drive_incremental_sync",
  });
  const newFolders = [];
  try {
    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      throw new Error(`Connector ${connectorId} not found`);
    }
    if (!nextPageToken) {
      nextPageToken = await getSyncPageToken(
        connectorId,
        driveId,
        isSharedDrive
      );
    }
    const config = await GoogleDriveConfig.findOne({
      where: {
        connectorId: connectorId,
      },
    });
    const mimeTypesToSync = getMimeTypesToSync({
      pdfEnabled: config?.pdfEnabled || false,
      csvEnabled: config?.csvEnabled || false,
    });

    const selectedFoldersIds = await getFoldersToSync(connectorId);

    const authCredentials = await getAuthObject(connector.connectionId);
    const labels = await getCachedLabels(connectorId, authCredentials);
    const driveClient = await getDriveClient(authCredentials);

    let opts: drive_v3.Params$Resource$Changes$List = {
      pageToken: nextPageToken,
      pageSize: 1000,
      fields: "*",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      includeLabels: labels.map((l) => l.id).join(","),
    };
    if (isSharedDrive) {
      opts = {
        ...opts,
        driveId: driveId,
      };
    }

    await heartbeat();
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

    if (changesRes.data.changes.length > 0) {
      localLogger.info(
        {
          nbChanges: changesRes.data.changes.length,
        },
        `Got changes.`
      );
    }

    for (const change of changesRes.data.changes) {
      await heartbeat();

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

      if (
        await alreadySeenAndIgnored({
          fileId: change.file.id,
          connectorId,
          startSyncTs,
          redisCli,
        })
      ) {
        continue;
      }

      const file = await driveObjectToDustType(
        connectorId,
        change.file,
        authCredentials
      );
      if (
        !(await objectIsInFolderSelection(
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
        await markAsSeenAndIgnored({
          fileId: change.file.id,
          connectorId,
          startSyncTs,
          redisCli,
        });
        continue;
      }

      if (!change.file.createdTime || !change.file.name || !change.file.id) {
        throw new Error(
          `Invalid file. File is: ${JSON.stringify(change.file)}`
        );
      }
      localLogger.info({ fileId: change.file.id }, "will sync file");

      const dataSourceConfig = dataSourceConfigFromConnector(connector);

      await heartbeat();
      const driveFile: GoogleDriveObjectType = await driveObjectToDustType(
        connectorId,
        change.file,
        authCredentials
      );
      if (driveFile.mimeType === "application/vnd.google-apps.folder") {
        const parentGoogleIds = await getFileParentsMemoized(
          connectorId,
          authCredentials,
          driveFile,
          startSyncTs
        );
        const localFolder = await GoogleDriveFiles.findOne({
          where: {
            connectorId: connectorId,
            driveFileId: change.file.id,
          },
        });

        const parents = parentGoogleIds.map((parent) => getInternalId(parent));

        if (localFolder && localFolder.parentId !== parentGoogleIds[1]) {
          logger.info(
            {
              fileId: change.file.id,
              localParentId: localFolder.parentId,
              parentId: parentGoogleIds[1],
            },
            "Folder moved"
          );
          if (localFolder.skipReason) {
            localLogger.info(
              `Google Drive folder skipped with skip reason ${localFolder.skipReason}`
            );
          } else {
            await recurseUpdateParents(
              connector,
              localFolder,
              parents,
              localLogger
            );
          }
        }

        if (!localFolder) {
          localLogger.info(
            { folderId: driveFile.id },
            "Adding new folder to sync"
          );
          newFolders.push(driveFile.id);
        }

        localLogger.info({ fileId: change.file.id }, "done syncing file");

        continue;
      } else {
        await heartbeat();
        await syncOneFile(
          connectorId,
          authCredentials,
          dataSourceConfig,
          driveFile,
          startSyncTs
        );
      }
      localLogger.info({ fileId: change.file.id }, "done syncing file");
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

    return { nextPageToken, newFolders };
  } catch (e) {
    if (
      (e instanceof GaxiosError && e.response?.status === 403) ||
      (e instanceof WithRetriesError &&
        e.errors.every(
          (error) =>
            error.error instanceof GaxiosError &&
            error.error.response?.status === 403
        ))
    ) {
      localLogger.error(
        {
          error: e.message,
        },
        `Looks like we lost access to this drive. Skipping`
      );
      return undefined;
    } else if (
      isSharedDriveNotFoundError(e) ||
      (e instanceof WithRetriesError &&
        e.errors.every((error) => isSharedDriveNotFoundError(error.error)))
    ) {
      localLogger.error(
        {
          error: e instanceof Error ? e.message : "Unknown error",
          driveId,
        },
        `Shared drive not found. Skipping`
      );
      return undefined;
    } else {
      throw e;
    }
  }
}

async function recurseUpdateParents(
  connector: ConnectorResource,
  file: GoogleDriveFiles,
  parentIds: string[],
  logger: Logger
) {
  await heartbeat();
  const children = await GoogleDriveFiles.findAll({
    where: {
      connectorId: connector.id,
      parentId: file.driveFileId,
      skipReason: null,
    },
  });

  logger.info(
    {
      fileId: file.driveFileId,
      parentIds,
      name: file.name,
      count: children.length,
    },
    "Updating parents recursively"
  );

  if (parentIds.includes(file.dustFileId)) {
    logger.warn(
      {
        fileId: file.driveFileId,
        parentIds,
        name: file.name,
        count: children.length,
      },
      "Infinite parent loop."
    );
    return;
  }

  for (const child of children) {
    await recurseUpdateParents(
      connector,
      child,
      [child.dustFileId, ...parentIds],
      logger
    );
  }

  await updateParentsField(connector, file, parentIds, logger);
}

async function alreadySeenAndIgnored({
  fileId,
  connectorId,
  startSyncTs,
  redisCli,
}: {
  fileId: string;
  connectorId: ModelId;
  startSyncTs: number;
  redisCli: RedisClientType;
}) {
  const key = `google_drive_seen_and_ignored_${connectorId}_${startSyncTs}_${fileId}`;
  const val = await redisCli.get(key);
  return val !== null;
}

async function markAsSeenAndIgnored({
  fileId,
  connectorId,
  startSyncTs,
  redisCli,
}: {
  fileId: string;
  connectorId: ModelId;
  startSyncTs: number;
  redisCli: RedisClientType;
}) {
  const key = `google_drive_seen_and_ignored_${connectorId}_${startSyncTs}_${fileId}`;
  await redisCli.set(key, "1", {
    PX: 1000 * 60 * 60 * 24, // 1 day
  });
  return;
}

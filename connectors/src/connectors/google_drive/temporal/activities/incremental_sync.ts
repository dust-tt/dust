import {
  updateFolderMetadata,
  updateParentsField,
} from "@connectors/connectors/google_drive/lib";
import { getFileParentsMemoized } from "@connectors/connectors/google_drive/lib/hierarchy";
import {
  deleteFile,
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
  isGoogleDriveRateLimitError,
  isSharedDriveNotFoundError,
} from "@connectors/connectors/google_drive/temporal/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import {
  GoogleDriveConfigModel,
  GoogleDriveFilesModel,
  GoogleDriveSyncTokenModel,
} from "@connectors/lib/models/google_drive";
import { heartbeat } from "@connectors/lib/temporal";
import type { Logger } from "@connectors/logger/logger";
import { getActivityLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { GoogleDriveObjectType, ModelId } from "@connectors/types";
import { FILE_ATTRIBUTES_TO_FETCH, WithRetriesError } from "@connectors/types";
import { redisClient } from "@connectors/types/shared/redis_client";
import { uuid4 } from "@temporalio/workflow";
import tracer from "dd-trace";
import type { drive_v3 } from "googleapis";
import type { GaxiosResponse } from "googleapis-common";
import { GaxiosError } from "googleapis-common";
import type { RedisClientType } from "redis";

const PAGE_SIZE = 500;
const UPDATE_PARENTS_BATCH_SIZE = 1_000;
const UPDATE_PARENTS_CONCURRENCY = 8;
const UPDATE_PARENTS_PROGRESS_TTL_SECONDS = 60 * 60 * 24; // 1 day

type ParentsUpdate = {
  file: GoogleDriveFilesModel;
  parentIds: string[];
};

type EnqueueParentsUpdate = (update: ParentsUpdate) => Promise<void>;

/**
 * @cc [owner:philipperolet,label:performance] folder-move-detection
 * A folder change MUST trigger the recursive parents update of the folder's subtree only when the
 * folder's stored `parentId` differs from its current synced parent. A top-level synced folder
 * (stored `parentId` null, no synced parent in Drive) MUST NOT be treated as moved.
 */
export async function incrementalSync(
  connectorId: ModelId,
  driveId: string,
  isSharedDrive: boolean,
  startSyncTs: number,
  nextPageToken?: string
): Promise<
  { nextPageToken: string | undefined; newFolders: string[] } | undefined
> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }
  const localLogger = getActivityLogger(connector).child({
    driveId: driveId,
    runInstance: uuid4(),
  });
  localLogger.info(
    {
      connectorId,
      driveId,
      isSharedDrive,
      startSyncTs,
      nextPageToken,
    },
    "Starting incremental sync"
  );
  const redisCli = await redisClient({
    origin: "google_drive_incremental_sync",
  });
  const newFolders = [];
  let hadRelevantChange = false;
  try {
    if (!nextPageToken) {
      nextPageToken = await getSyncPageToken(
        connectorId,
        driveId,
        isSharedDrive
      );
    }
    const config = await GoogleDriveConfigModel.findOne({
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
      pageSize: PAGE_SIZE,
      fields: `nextPageToken, newStartPageToken, changes(changeType, fileId, time, removed, file(${FILE_ATTRIBUTES_TO_FETCH.join(",")}))`,
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

      if (change.changeType !== "file") {
        continue;
      }

      if (change.removed && change.fileId) {
        const localFile = await GoogleDriveFilesModel.findOne({
          where: {
            connectorId: connectorId,
            driveFileId: change.fileId,
          },
        });
        if (localFile) {
          await deleteFile(localFile);
          hadRelevantChange = true;
        }
        continue;
      }

      if (!change.file) {
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
        const localFile = await GoogleDriveFilesModel.findOne({
          where: {
            connectorId: connectorId,
            driveFileId: change.file.id,
          },
        });
        if (localFile) {
          await deleteOneFile(connectorId, file);
          hadRelevantChange = true;
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
      localLogger.info(
        {
          fileId: change.file.id,
          createdTime: change.file.createdTime,
          modifiedTime: change.file.modifiedTime,
          trashed: change.file.trashed,
          mimeType: change.file.mimeType,
          size: change.file.size,
        },
        "will sync file"
      );

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
        const localFolder = await GoogleDriveFilesModel.findOne({
          where: {
            connectorId: connectorId,
            driveFileId: change.file.id,
          },
        });

        const parents = parentGoogleIds.map((parent) => getInternalId(parent));
        // A top-level synced folder has no parent in `parentGoogleIds` and a null `parentId`.
        const moved =
          localFolder && localFolder.parentId !== (parentGoogleIds[1] ?? null);

        // Drive change events do not tell us which folder field changed, so we
        // refresh folder metadata on every seen folder change.
        if (localFolder && moved) {
          await localFolder.update({
            name: driveFile.name,
            mimeType: driveFile.mimeType,
            lastSeenTs: new Date(),
          });
          localLogger.info(
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
              localLogger,
              redisCli
            );
            hadRelevantChange = true;
          }
        } else if (localFolder) {
          if (localFolder.skipReason) {
            await localFolder.update({
              name: driveFile.name,
              mimeType: driveFile.mimeType,
              lastSeenTs: new Date(),
            });
            localLogger.info(
              `Google Drive folder skipped with skip reason ${localFolder.skipReason}`
            );
          } else {
            await updateFolderMetadata(
              connector,
              localFolder,
              driveFile,
              parents,
              localLogger
            );
            hadRelevantChange = true;
          }
        }

        if (!localFolder) {
          localLogger.info(
            { folderId: driveFile.id },
            "Adding new folder to sync"
          );
          newFolders.push(driveFile.id);
          hadRelevantChange = true;
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
        hadRelevantChange = true;
      }
      localLogger.info({ fileId: change.file.id }, "done syncing file");
    }

    nextPageToken = changesRes.data.nextPageToken
      ? changesRes.data.nextPageToken
      : undefined;
    if (changesRes.data.newStartPageToken) {
      await upsertCompletedSyncToken({
        connectorId: connectorId,
        driveId: driveId,
        syncToken: changesRes.data.newStartPageToken,
        hadRelevantChange,
      });
    }

    return { nextPageToken, newFolders };
  } catch (e) {
    // A 403 can also mean a transient rate-limit/quota exhaustion ("User rate limit
    // exceeded."). Those must be re-thrown so Temporal retries with backoff, not
    // treated as a permanent loss of access to the drive (which would silently skip
    // the drive and leave it stale).
    if (
      isGoogleDriveRateLimitError(e) ||
      (e instanceof WithRetriesError &&
        e.errors.every((error) => isGoogleDriveRateLimitError(error.error)))
    ) {
      throw e;
    } else if (
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

async function upsertCompletedSyncToken({
  connectorId,
  driveId,
  syncToken,
  hadRelevantChange,
}: {
  connectorId: ModelId;
  driveId: string;
  syncToken: string;
  hadRelevantChange: boolean;
}) {
  const completedAt = new Date();
  const lastRelevantChangeAt = hadRelevantChange
    ? completedAt
    : await getQuietDriveBaselineAt(connectorId, driveId, completedAt);

  await GoogleDriveSyncTokenModel.upsert({
    connectorId,
    driveId,
    syncToken,
    lastSyncAt: completedAt,
    lastRelevantChangeAt,
  });
}

async function getQuietDriveBaselineAt(
  connectorId: ModelId,
  driveId: string,
  completedAt: Date
) {
  const syncToken = await GoogleDriveSyncTokenModel.findOne({
    attributes: ["lastSyncAt", "lastRelevantChangeAt"],
    where: { connectorId, driveId },
  });

  return (
    syncToken?.lastRelevantChangeAt ?? syncToken?.lastSyncAt ?? completedAt
  );
}

/**
 * @cc [owner:philipperolet,label:performance;product] resumable-move
 * When a folder is moved, a descendant's data source parents update MUST be skipped only if a
 * previous attempt completed it for the same folder and the same new parents chain.
 */
async function recurseUpdateParents(
  connector: ConnectorResource,
  file: GoogleDriveFilesModel,
  parentIds: string[],
  logger: Logger,
  redisCli: RedisClientType
) {
  return tracer.trace(
    "gdrive",
    {
      resource: "recurseUpdateParents",
    },
    async (span) => {
      span?.setTag("connectorId", connector.id);
      span?.setTag("workspaceId", connector.workspaceId);
      span?.setTag("fileId", file.driveFileId);

      // Records the descendants already updated, so that retries of a move too large for one
      // activity attempt make progress.
      const progressKey = await getMoveProgressKey(
        redisCli,
        connector.id,
        file,
        parentIds
      );
      let updateBatch: ParentsUpdate[] = [];
      const flushUpdateBatch = async () => {
        await updateParentsFieldForBatch(connector, updateBatch, logger, {
          redisCli,
          progressKey,
        });
        updateBatch = [];
      };
      const enqueueUpdate = async (update: ParentsUpdate) => {
        if (updateBatch.length >= UPDATE_PARENTS_BATCH_SIZE) {
          await flushUpdateBatch();
        }
        updateBatch.push(update);
      };

      await recurseUpdateParentsInner(
        connector,
        file,
        parentIds,
        logger,
        enqueueUpdate
      );
      const initialFolderUpdate = updateBatch.pop();
      await flushUpdateBatch();

      if (!initialFolderUpdate) {
        return;
      }

      await updateParentsField(
        connector,
        initialFolderUpdate.file,
        initialFolderUpdate.parentIds,
        logger
      );
      await redisCli.del(progressKey);
    }
  );
}

/**
 * Returns the key of the Redis set of descendants already updated for the move of `folder` to
 * `parentIds`. Progress recorded for a previous move of the folder to another chain is cleared.
 */
async function getMoveProgressKey(
  redisCli: RedisClientType,
  connectorId: ModelId,
  folder: GoogleDriveFilesModel,
  parentIds: string[]
) {
  const progressKey = `google_drive_moved_folder_progress_${connectorId}_${folder.id}`;
  const chainKey = `${progressKey}_chain`;
  const chain = parentIds.join("/");

  if ((await redisCli.get(chainKey)) !== chain) {
    await redisCli.del(progressKey);
  }
  await redisCli.set(chainKey, chain, {
    EX: UPDATE_PARENTS_PROGRESS_TTL_SECONDS,
  });

  return progressKey;
}

async function recurseUpdateParentsInner(
  connector: ConnectorResource,
  file: GoogleDriveFilesModel,
  parentIds: string[],
  logger: Logger,
  enqueueUpdate: EnqueueParentsUpdate
) {
  await heartbeat();
  const children = await GoogleDriveFilesModel.findAll({
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

  // Move updates recurse from the moved folder itself, so `parentIds[0]` is
  // the current node and only deeper repeats indicate a real parent cycle.
  if (parentIds.slice(1).includes(file.dustFileId)) {
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
    await recurseUpdateParentsInner(
      connector,
      child,
      [child.dustFileId, ...parentIds],
      logger,
      enqueueUpdate
    );
  }

  await enqueueUpdate({ file, parentIds });
}

async function updateParentsFieldForBatch(
  connector: ConnectorResource,
  updateBatch: ParentsUpdate[],
  logger: Logger,
  { redisCli, progressKey }: { redisCli: RedisClientType; progressKey: string }
) {
  await concurrentExecutor(
    updateBatch,
    async ({ file, parentIds }) => {
      const fileId = file.id.toString();
      if (await redisCli.sIsMember(progressKey, fileId)) {
        return;
      }
      await updateParentsField(connector, file, parentIds, logger);
      await redisCli.sAdd(progressKey, fileId);
      await redisCli.expire(progressKey, UPDATE_PARENTS_PROGRESS_TTL_SECONDS);
    },
    { concurrency: UPDATE_PARENTS_CONCURRENCY, onBatchComplete: heartbeat }
  );
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

import { getGoogleDriveObject } from "@connectors/connectors/google_drive/lib/google_drive_api";
import type { LightGoogleDrive } from "@connectors/connectors/google_drive/temporal/activities/common/types";
import { getDrives } from "@connectors/connectors/google_drive/temporal/activities/common/utils";
import { getAuthObject } from "@connectors/connectors/google_drive/temporal/utils";
import {
  GoogleDriveFoldersModel,
  GoogleDriveSyncTokenModel,
} from "@connectors/lib/models/google_drive";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";

const GDRIVE_BASE_INCREMENTAL_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const GDRIVE_MAX_INCREMENTAL_SYNC_INTERVAL_MS = 20 * 60 * 1000;
const GDRIVE_QUIET_DRIVE_BACKOFF_MULTIPLIER = 2;

// Get the list of drives that have folders selected for sync.
export async function getDrivesToSync(
  connectorId: ModelId
): Promise<LightGoogleDrive[]> {
  const selectedFolders = await GoogleDriveFoldersModel.findAll({
    where: {
      connectorId: connectorId,
    },
  });
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }
  const allSharedDrives = await getDrives(connectorId);
  const authCredentials = await getAuthObject(connector.connectionId);
  const drivesById: Record<string, LightGoogleDrive> = {};

  for (const folder of selectedFolders) {
    const remoteFolder = await getGoogleDriveObject({
      connectorId,
      authCredentials,
      driveObjectId: folder.folderId,
    });
    if (remoteFolder) {
      if (!remoteFolder.driveId) {
        throw new Error(`Folder ${folder.folderId} does not have a driveId.`);
      }
      // A selected folder can be in a shared drive we don't have access to,
      // so we need to filter them out.
      // This is the case for files "shared with me" for example.
      if (allSharedDrives.find((d) => d.id === remoteFolder.driveId)) {
        drivesById[remoteFolder.driveId] = {
          id: remoteFolder.driveId,
          name: remoteFolder.name,
          isSharedDrive: remoteFolder.isInSharedDrive,
        };
      }
    }
  }

  const drives = Object.values(drivesById);

  return filterDrivesByRecentChanges(drives);

  async function filterDrivesByRecentChanges(
    drives: LightGoogleDrive[]
  ): Promise<LightGoogleDrive[]> {
    if (drives.length === 0) {
      return drives;
    }

    // Drives with no adaptive state must sync once. Otherwise, quiet drives
    // back off to twice the age of their last relevant change, clamped between
    // the base and max intervals. A relevant change resets both timestamps, so
    // the next interval returns to the base cadence.
    const syncTokens = await GoogleDriveSyncTokenModel.findAll({
      attributes: ["driveId", "lastSyncAt", "lastRelevantChangeAt"],
      where: {
        connectorId,
        driveId: drives.map((drive) => drive.id),
      },
    });
    const syncTokenByDriveId = new Map(
      syncTokens.map((syncToken) => [syncToken.driveId, syncToken])
    );
    const nowMs = Date.now();

    const isDriveDueForIncrementalSync = (drive: LightGoogleDrive) => {
      const syncToken = syncTokenByDriveId.get(drive.id);
      if (!syncToken?.lastSyncAt || !syncToken.lastRelevantChangeAt) {
        return true;
      }

      const intervalMs = Math.min(
        Math.max(
          GDRIVE_QUIET_DRIVE_BACKOFF_MULTIPLIER *
            (syncToken.lastSyncAt.getTime() -
              syncToken.lastRelevantChangeAt.getTime()),
          GDRIVE_BASE_INCREMENTAL_SYNC_INTERVAL_MS
        ),
        GDRIVE_MAX_INCREMENTAL_SYNC_INTERVAL_MS
      );

      return nowMs - syncToken.lastSyncAt.getTime() >= intervalMs;
    };

    return drives.filter(isDriveDueForIncrementalSync);
  }
}

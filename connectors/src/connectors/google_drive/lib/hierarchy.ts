import type { ModelId } from "@dust-tt/types";
import { cacheWithRedis } from "@dust-tt/types";
import type { OAuth2Client } from "googleapis-common";

import { getGoogleDriveObject } from "@connectors/connectors/google_drive/lib/google_drive_api";
import mainLogger from "@connectors/logger/logger";
import type { GoogleDriveObjectType } from "@connectors/types/google_drive";
import { GoogleDriveFolders } from "@connectors/lib/models/google_drive";
import { Op } from "sequelize";
import {
  getDriveFileId,
  getInternalId,
} from "@connectors/connectors/google_drive/temporal/utils";
import assert from "assert";

// Please consider using the memoized version getFileParentsMemoized instead of this one.
async function getFileParents(
  connectorId: ModelId,
  authCredentials: OAuth2Client,
  driveFile: GoogleDriveObjectType,
  /* eslint-disable @typescript-eslint/no-unused-vars */
  startSyncTs: number
): Promise<string[]> {
  const logger = mainLogger.child({
    provider: "google_drive",
    connectorId: connectorId,
  });

  const parents: string[] = [driveFile.id];
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
    parents.push(parent.id);
    currentObject = parent;
  }

  // Avoid inserting parents outside of what we sync by checking GoogleDriveFolder.
  const syncedFolders = await GoogleDriveFolders.findAll({
    where: {
      connectorId: connectorId,
      folderId: {
        [Op.in]: parents.map(getDriveFileId),
      },
    },
  });
  // we should return parents up to the most toplevel folder that is synced
  // e.g. parents = [node_itself, A, B, C, D, E] and user selected C for sync:
  // we should return [node_itself, A, B, C]
  const syncedFolderIds = syncedFolders.map((folder) =>
    getInternalId(folder.folderId)
  );
  const sliceIndex = parents
    .reverse()
    .findIndex((parent) => syncedFolderIds.includes(parent));
  assert(sliceIndex !== -1, "No synced folder in node parents");
  return parents.slice(0, parents.length - sliceIndex);
}

/**
 * This returns the list of parentIds in expected format for upsert,
 * starting with the id of the "driveFile" itself up to the root drive id.
 * [ driveFileId, directParentId, .... , rootDriveId ]
 *
 * Result is cached in redis for the current sync workflow, for one hour.
 */
export const getFileParentsMemoized = cacheWithRedis(
  getFileParents,
  (
    connectorId: ModelId,
    authCredentials: OAuth2Client,
    driveFile: GoogleDriveObjectType,
    startSyncTs: number
  ) => {
    const cacheKey = `gdrive-parents-${connectorId}-${startSyncTs}-${driveFile.id}`;

    return cacheKey;
  },
  60 * 10 * 1000
);

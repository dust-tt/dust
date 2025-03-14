import type { OAuth2Client } from "googleapis-common";
import { Op } from "sequelize";

import { getGoogleDriveObject } from "@connectors/connectors/google_drive/lib/google_drive_api";
import { GoogleDriveFolders } from "@connectors/lib/models/google_drive";
import mainLogger from "@connectors/logger/logger";
import type { ModelId } from "@connectors/types";
import type { GoogleDriveObjectType } from "@connectors/types";
import { cacheWithRedis } from "@connectors/types";

// TODO(nodes-core): monitor and follow-up with either normalizing
// the situation or throwing an error
//
// special id for nodes that are outside of users selection This should never
// happen, but it does so for now we monitor
const GOOGLE_OUTSIDE_SYNC_PARENT_ID = "gdrive_outside_sync";

// Please consider using the memoized version getFileParentsMemoized instead of this one.
async function getFileParents(
  connectorId: ModelId,
  authCredentials: OAuth2Client,
  driveFile: GoogleDriveObjectType,
  startSyncTs: number | string,
  { includeAllRemoteParents }: { includeAllRemoteParents?: boolean } = {}
): Promise<string[]> {
  const logger = mainLogger.child({
    provider: "google_drive",
    connectorId: connectorId,
  });

  const parents: string[] = [driveFile.id];
  let currentObject = driveFile;
  while (currentObject.parent) {
    const parent = await getGoogleDriveObject({
      authCredentials,
      driveObjectId: currentObject.parent,
      cacheKey: { connectorId, ts: startSyncTs },
    });
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

  if (includeAllRemoteParents) {
    return parents;
  }

  // Avoid inserting parents outside of what we sync by checking GoogleDriveFolder.
  const syncedFolders = await GoogleDriveFolders.findAll({
    where: {
      connectorId: connectorId,
      folderId: {
        [Op.in]: parents,
      },
    },
    attributes: ["folderId"],
  });
  // we should return parents up to the most toplevel folder that is synced
  // e.g. parents = [node_itself, A, B, C, D, E] and user selected C for sync:
  // we should return [node_itself, A, B, C]
  const syncedFolderIds = syncedFolders.map((folder) => folder.folderId);
  const sliceIndex = [...parents]
    .reverse()
    .findIndex((parent) => syncedFolderIds.includes(parent));

  if (sliceIndex === -1) {
    logger.info(
      {
        parents: parents.join(", "),
      },
      "Node outside of selected sync folders"
    );
    return [driveFile.id, GOOGLE_OUTSIDE_SYNC_PARENT_ID];
  }
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
    startSyncTs: number | string,
    { includeAllRemoteParents }: { includeAllRemoteParents?: boolean } = {}
  ) => {
    const cacheKey = `gdrive-parents-${connectorId}-${startSyncTs}-${driveFile.id}-${includeAllRemoteParents}`;

    return cacheKey;
  },
  60 * 10 * 1000
);

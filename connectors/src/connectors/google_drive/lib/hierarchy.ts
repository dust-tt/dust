import type { ModelId } from "@dust-tt/types";
import { cacheWithRedis } from "@dust-tt/types";
import type { OAuth2Client } from "googleapis-common";

import { getGoogleDriveObject } from "@connectors/connectors/google_drive/lib/google_drive_api";
import mainLogger from "@connectors/logger/logger";
import type { GoogleDriveObjectType } from "@connectors/types/google_drive";

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

  return parents;
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

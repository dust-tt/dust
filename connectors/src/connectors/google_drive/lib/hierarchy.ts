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

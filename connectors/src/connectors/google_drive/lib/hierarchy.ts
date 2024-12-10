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

  if (!driveFile.parent) {
    return [];
  }

  const parent = await getGoogleDriveObject(authCredentials, driveFile.parent);
  if (!parent) {
    // If we got a 404 error we stop the iteration as the parent disappeared.
    logger.info("Parent not found in `getFileParents`", {
      parentId: driveFile.parent,
      fileId: driveFile.id,
    });
    return [];
  }

  const parents = await getFileParentsMemoized(
    connectorId,
    authCredentials,
    parent,
    startSyncTs
  );

  return [parent, ...parents];
}

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

export const getFileParentsForUpsert = async (
  connectorId: ModelId,
  authCredentials: OAuth2Client,
  driveFile: GoogleDriveObjectType,
  startSyncTs: number
) => {
  const parents = (
    await getFileParentsMemoized(
      connectorId,
      authCredentials,
      driveFile,
      startSyncTs
    )
  ).map((f) => f.id);
  return [driveFile.id, ...parents];
};

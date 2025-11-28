import PQueue from "p-queue";
import { Op } from "sequelize";

import { fixParentsConsistency } from "@connectors/connectors/google_drive/lib";
import { getGoogleDriveObject } from "@connectors/connectors/google_drive/lib/google_drive_api";
import { FILES_GC_CONCURRENCY } from "@connectors/connectors/google_drive/temporal/activities/common/constants";
import {
  deleteFile,
  deleteOneFile,
  objectIsInFolderSelection,
} from "@connectors/connectors/google_drive/temporal/activities/common/utils";
import { getFoldersToSync } from "@connectors/connectors/google_drive/temporal/activities/get_folders_to_sync";
import { getAuthObject } from "@connectors/connectors/google_drive/temporal/utils";
import { GoogleDriveFiles } from "@connectors/lib/models/google_drive";
import { getActivityLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";

/**
 * @param lastSeenTs Garbage collect all files that have not been seen since this timestamp.
 */
export async function garbageCollector(
  connectorId: ModelId,
  lastSeenTs: number
): Promise<number> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const authCredentials = await getAuthObject(connector.connectionId);
  const localLogger = getActivityLogger(connector).child({
    lastSeenTs,
  });

  localLogger.info("Google Drive: Starting garbage collector");

  const ts = lastSeenTs || Date.now();

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
        const driveFile = await getGoogleDriveObject({
          connectorId,
          authCredentials,
          driveObjectId: file.driveFileId,
          cacheKey: { connectorId, ts },
        });
        if (!driveFile) {
          // Could not find the file on Gdrive, deleting our local reference to it.
          await deleteFile(file);
          return null;
        }
        const isInFolderSelection = await objectIsInFolderSelection(
          connectorId,
          authCredentials,
          driveFile,
          selectedFolders,
          lastSeenTs
        );

        if (isInFolderSelection === false || driveFile.trashed) {
          await deleteOneFile(connectorId, driveFile);
        } else {
          await file.update({
            lastSeenTs: new Date(),
          });
        }
      });
    })
  );

  // TODO(nodes-core): Run fixParents in dry run mode to check parentIds validity
  await fixParentsConsistency({
    connector,
    files,
    checkFromGoogle: false,
    execute: false,
    startSyncTs: ts,
    logger: localLogger,
  });

  return files.length;
}

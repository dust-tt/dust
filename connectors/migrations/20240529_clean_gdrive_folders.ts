import { QueryTypes } from "sequelize";

import { getGoogleDriveObject } from "@connectors/connectors/google_drive/lib/google_drive_api";
import {
  getAuthObject,
  getInternalId,
} from "@connectors/connectors/google_drive/temporal/utils";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import {
  GoogleDriveFiles,
  GoogleDriveFolders,
} from "@connectors/lib/models/google_drive";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { connectorsSequelize } from "@connectors/resources/storage";

const { LIVE } = process.env;

async function main() {
  // get all folders that have no row in google_drive_files such that the
  // folder's folderId is the same as the file's driveFileId
  // not easy to do in sequelize, so direct query
  const query = `
  SELECT "folders".*
  FROM "google_drive_folders" AS folders
  LEFT JOIN "google_drive_files" AS files
  ON folders."folderId" = files."driveFileId"
  WHERE files."driveFileId" IS NULL
  ORDER BY folders."updatedAt" DESC;
`;

  const results = await connectorsSequelize.query(query, {
    type: QueryTypes.SELECT,
  });

  // Map the results to GoogleDriveFolders instances
  const unusedFolders = results.map((result) =>
    // @ts-expect-error typescript cannot correctly infer result's type
    GoogleDriveFolders.build(result, { isNewRecord: false })
  );

  logger.info(`Found ${unusedFolders.length} unused folders`);

  // loop across folders, check if we can get the google drive object from
  // google API if we can't, delete the folder. Otherwise, backfill the
  // google_drive_files row
  for (const folder of unusedFolders) {
    const { connectorId, folderId } = folder;
    const connector = await ConnectorResource.fetchById(connectorId);

    if (!connector) {
      logger.info(
        { connectorId, folderId },
        `Connector not found, deleting folder (live: ${LIVE})`
      );
      if (LIVE) {
        await GoogleDriveFolders.destroy({ where: { connectorId, folderId } });
      }
      continue;
    }

    const authCredentials = await (async () => {
      try {
        return await getAuthObject(connector.connectionId);
      } catch (e) {
        if (e instanceof ExternalOAuthTokenError) {
          logger.info(
            { connectorId, folderId },
            `Auth revoked, deleting folder (live: ${LIVE})`
          );
          if (LIVE) {
            await GoogleDriveFolders.destroy({
              where: { connectorId, folderId },
            });
          }
        }
      }
    })();

    if (!authCredentials) {
      continue;
    }

    const file = await getGoogleDriveObject({
      connectorId,
      authCredentials,
      driveObjectId: folderId,
    });

    if (!file) {
      logger.info(
        { connectorId, folderId },
        `Folder not found on google, deleting folder (live: ${LIVE})`
      );
      if (LIVE) {
        await GoogleDriveFolders.destroy({ where: { connectorId, folderId } });
      }
      continue;
    }

    logger.info(
      { connectorId, folderId },
      `Folder found on google, backfilling google_drive_files (live: ${LIVE})`
    );
    if (LIVE) {
      await GoogleDriveFiles.create({
        connectorId,
        driveFileId: folderId,
        name: file.name,
        mimeType: file.mimeType,
        dustFileId: getInternalId(folderId),
      });
    }
  }
}

main()
  .then(() => console.log("Done"))
  .catch(console.error);

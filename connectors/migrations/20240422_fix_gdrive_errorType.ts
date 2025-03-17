import { getGoogleDriveObject } from "@connectors/connectors/google_drive/lib/google_drive_api";
import { getAuthObject } from "@connectors/connectors/google_drive/temporal/utils";
import logger from "@connectors/logger/logger";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

const { LIVE } = process.env;

async function main() {
  // Select all connectors with an associated githubconnectorstate that has codeSyncEnabled set to true

  const connectors = await ConnectorModel.findAll({
    where: {
      type: "google_drive",
      errorType: "oauth_token_revoked",
    },
  });

  logger.info(
    `Found ${connectors.length} connectors with errorType: oauth_token_revoked`
  );

  const toReEnable = [];
  for (const connector of connectors) {
    try {
      const auth = await getAuthObject(connector.connectionId);
      const gDriveObject = await getGoogleDriveObject({
        connectorId: connector.id,
        authCredentials: auth,
        driveObjectId: "root",
      });
      logger.info(
        {
          connectorId: connector.id,
          // gDriveObject being null still means we have a valid access token
          fileName: gDriveObject?.name,
        },
        `Successfully fetched root folder for connector`
      );
      toReEnable.push(connector.id);
    } catch (e) {
      // no-op, this is expected
    }
  }

  if (LIVE) {
    for (const id of toReEnable) {
      await ConnectorModel.update(
        {
          errorType: null,
        },
        {
          where: {
            id,
          },
        }
      );
    }
  }
  logger.info(
    {
      toReEnable,
    },
    "Done!"
  );
}
main()
  .then(() => console.log("Done"))
  .catch(console.error);

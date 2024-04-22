import { getGoogleDriveObject } from "@connectors/connectors/google_drive/lib/google_drive_api";
import { getAuthObject } from "@connectors/connectors/google_drive/temporal/utils";
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

  console.log(
    `Found ${connectors.length} connectors with errorTyhpe: oauth_token_revoked`
  );

  const toReEnable = [];
  for (const connector of connectors) {
    try {
      const auth = await getAuthObject(connector.connectionId);
      const gDriveObject = await getGoogleDriveObject(auth, "root");
      console.log(
        `Successfully fetched root folder for connector ${connector.id}. Fetched: ${gDriveObject?.name}`
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
  console.log("Done!", toReEnable);
}
main()
  .then(() => console.log("Done"))
  .catch(console.error);

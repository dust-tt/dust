import { launchGithubFullSyncWorkflow } from "@connectors/connectors/github/temporal/client";
import { GithubConnectorState } from "@connectors/lib/models/github";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

const { LIVE } = process.env;

async function main() {
  // Select all connectors with an associated githubconnectorstate that has codeSyncEnabled set to true
  const connectors = await ConnectorModel.findAll({
    include: [
      {
        model: GithubConnectorState,
        where: {
          codeSyncEnabled: true,
        },
      },
    ],
  });

  console.log(`Found ${connectors.length} connectors with codeSyncEnabled`);
  // for all connectors, launch a full resync of code only
  // batches of 10 connectors, sleeping 5s between batches
  for (let i = 0; i < connectors.length; i += 10) {
    const batch = connectors.slice(i, i + 10);
    for (const connector of batch) {
      console.log(
        `Resyncing code for connector ${connector.id} (${
          LIVE ? "LIVE" : "DRY"
        })`
      );
      LIVE &&
        (await launchGithubFullSyncWorkflow({
          connectorId: connector.id,
          syncCodeOnly: true,
          forceCodeResync: true,
        }));
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
main()
  .then(() => console.log("Done"))
  .catch(console.error);

import { NotionConnectorState } from "@connectors/lib/models/notion";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

async function main() {
  const connectors = await ConnectorModel.findAll();
  console.log(`Found ${connectors.length} connectors`);
  for (const connector of connectors) {
    console.log(`Processing connector ${connector.id} (${connector.type})...`);
    if (
      connector.lastSyncSuccessfulTime &&
      !connector.firstSuccessfulSyncTime
    ) {
      console.log(
        `Backfilling firstSuccessfulSyncTime for connector ${connector.id}...`
      );

      await connector.update({
        firstSuccessfulSyncTime: connector.lastSyncSuccessfulTime,
      });
    }

    if (connector.type === "notion") {
      const notionState = await NotionConnectorState.findOne({
        where: { connectorId: connector.id },
      });
      if (!notionState) {
        console.log(
          `Creating NotionConnectorState for connector ${connector.id}...`
        );
        await NotionConnectorState.create({
          connectorId: connector.id,
          useDualWorkflow: true,
        });
      }
    }
  }
}

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

import { GoogleDriveConfig } from "@connectors/lib/models/google_drive";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

async function main() {
  const gDriveConnectors = await ConnectorModel.findAll({
    where: {
      type: "google_drive",
    },
  });

  for (const connector of gDriveConnectors) {
    const config = await GoogleDriveConfig.create({
      connectorId: connector.id,
      pdfEnabled: false,
      csvEnabled: false,
      largeFilesEnabled: false,
    });
    console.log(
      `Created config for connector ${config.connectorId} with id ${config.id} and pdfEnabled ${config.pdfEnabled}`
    );
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

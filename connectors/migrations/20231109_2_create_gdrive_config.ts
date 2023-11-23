import { Connector } from "@connectors/lib/models";
import { GoogleDriveConfig } from "@connectors/lib/models/google_drive";

async function main() {
  const gDriveConnectors = await Connector.findAll({
    where: {
      type: "google_drive",
    },
  });

  for (const connector of gDriveConnectors) {
    const config = await GoogleDriveConfig.create({
      connectorId: connector.id,
      pdfEnabled: false,
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

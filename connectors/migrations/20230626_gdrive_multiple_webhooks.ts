import { connectorsSequelize } from "@connectors/resources/storage";

async function main() {
  await connectorsSequelize.query(
    "drop index google_drive_webhooks_connector_id"
  );
  await connectorsSequelize.query(
    'UPDATE google_drive_webhooks SET "renewAt" = "expiresAt"'
  );
}

main()
  .then(() => {
    console.log("Done");
  })
  .catch(console.error);

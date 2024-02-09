import { sequelizeConnection } from "@connectors/resources/storage";

async function main() {
  await sequelizeConnection.query(
    "drop index google_drive_webhooks_connector_id"
  );
  await sequelizeConnection.query(
    'UPDATE google_drive_webhooks SET "renewAt" = "expiresAt"'
  );
}

main()
  .then(() => {
    console.log("Done");
  })
  .catch(console.error);

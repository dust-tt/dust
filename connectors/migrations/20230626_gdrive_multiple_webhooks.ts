import { sequelize_conn } from "@connectors/lib/models";

async function main() {
  await sequelize_conn.query("drop index google_drive_webhooks_connector_id");
  await sequelize_conn.query(
    'UPDATE google_drive_webhooks SET "renewAt" = "expiresAt"'
  );
}

main()
  .then(() => {
    console.log("Done");
  })
  .catch(console.error);

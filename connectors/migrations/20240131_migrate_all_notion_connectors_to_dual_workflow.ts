import { sequelize_conn } from "@connectors/lib/models";

async function main() {
  await sequelize_conn.query(`
        UPDATE notion_connector_states SET "useDualWorkflow" = true;
    `);
}

main()
  .then(() => {
    console.error("\x1b[32m%s\x1b[0m", `Done`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("\x1b[31m%s\x1b[0m", `Error: ${err.message}`);
    console.log(err);
    process.exit(1);
  });

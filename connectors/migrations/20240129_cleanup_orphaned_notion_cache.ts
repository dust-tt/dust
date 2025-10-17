import { connectorsSequelize } from "@connectors/resources/storage";

async function main() {
  await connectorsSequelize.query(`
        DELETE FROM notion_connector_page_cache_entries WHERE "connectorId" IS NULL;
        DELETE FROM notion_connector_block_cache_entries WHERE "connectorId" IS NULL;
        DELETE FROM notion_connector_resources_to_check_cache_entries WHERE "connectorId" IS NULL;
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

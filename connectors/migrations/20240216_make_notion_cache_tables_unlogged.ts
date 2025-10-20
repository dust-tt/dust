import { connectorsSequelize } from "@connectors/resources/storage";

async function main() {
  await connectorsSequelize.query(`
        ALTER TABLE notion_connector_page_cache_entries SET UNLOGGED;
        ALTER TABLE notion_connector_block_cache_entries SET UNLOGGED;
        ALTER TABLE notion_connector_resources_to_check_cache_entries SET UNLOGGED;
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

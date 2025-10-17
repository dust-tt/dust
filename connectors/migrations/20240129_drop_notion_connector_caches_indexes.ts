import { connectorsSequelize } from "@connectors/resources/storage";

async function main() {
  await connectorsSequelize.query(`
        DROP INDEX IF EXISTS "uq_notion_block_id_conn_id_page_id";
        DROP INDEX IF EXISTS "notion_connector_page_cache_entries_notion_page_id_connector_id";
        DROP INDEX IF EXISTS "uq_notion_to_check_notion_id_conn_id";
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

import { connectorsSequelize } from "@connectors/resources/storage";

async function main() {
  await connectorsSequelize.query(`
    UPDATE "notion_pages"
    SET "titleSearchVector" = to_tsvector('english', unaccent(coalesce("title", '')));
  `);
  await connectorsSequelize.query(`
    UPDATE "notion_databases"
    SET "titleSearchVector" = to_tsvector('english', unaccent(coalesce("title", '')));
  `);
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

import { sequelize_conn } from "@connectors/lib/models";

async function main() {
  await sequelize_conn.query(`
    UPDATE "notion_pages"
    SET "titleSearchVector" = to_tsvector('english', unaccent(coalesce("title", '')));
  `);
  await sequelize_conn.query(`
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

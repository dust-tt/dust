import { Sequelize } from "sequelize";

const { CORE_DATABASE_URI } = process.env;

async function main() {
  if (!CORE_DATABASE_URI) throw new Error("CORE_DATABASE_URI is not defined");

  const coreSequelize = new Sequelize(CORE_DATABASE_URI, { logging: false });

  // the table `data_sources_documents` has a `tags_json` column of type TEXT that contains a JSON array of strings
  // there is a new tags_array column of type TEXT[] that will replace the tags_json column
  // this migration will copy the tags_json column into the tags_array column
  // the new column has already been added to the model in the codebase

  let recordsAffected = 0;

  for (;;) {
    // Run update query on a batch of records
    /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
    const [_, metaData] = (await coreSequelize.query(`
      UPDATE data_sources_documents
      SET tags_array = ARRAY(SELECT json_array_elements_text(tags_json::json))
      WHERE id IN (
        SELECT id
        FROM data_sources_documents
        WHERE (tags_json IS NOT NULL AND tags_json != '[]') AND (tags_array IS NULL OR tags_array = '{}')
        LIMIT 1000
      );
    `)) as [unknown, { rowCount?: number }];

    if (!metaData) throw new Error("metaData is undefined");

    console.log(`Updated ${metaData.rowCount || 0} records.`);

    if (metaData.rowCount === 0) {
      console.log("No more records to update");
      // No more records to update
      break;
    }

    recordsAffected += metaData.rowCount || 0;
  }

  console.log(`Updated ${recordsAffected} records total`);
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

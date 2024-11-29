import { Sequelize } from "sequelize";

// To be run from connectors with `CORE_DATABASE_URI`
const { CORE_DATABASE_URI, LIVE = false } = process.env;

async function main() {
  const core_sequelize = new Sequelize(CORE_DATABASE_URI as string, {
    logging: false,
  });

  if (LIVE) {
    const query = `
    UPDATE data_sources_documents 
    SET parents = array_prepend(document_id, parents) 
    WHERE document_id <> ALL(parents)
    AND EXISTS (
      SELECT 1 FROM data_sources 
      WHERE data_sources.id = data_sources_documents.data_source 
      AND data_sources."connectorProvider" = 'intercom'
    );`;

    await core_sequelize.query(query);
  } else {
    const query = `
    SELECT document_id, parents
    FROM data_sources_documents 
    WHERE document_id <> ALL(parents)
    AND EXISTS (
      SELECT 1 FROM data_sources 
      WHERE data_sources.id = data_sources_documents.data_source 
      AND data_sources."connectorProvider" = 'intercom'
    );`;

    const [results] = await core_sequelize.query(query);
    console.log(`Would update ${results.length} documents`);
    console.log("Sample of affected rows:", results.slice(0, 5));
  }
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

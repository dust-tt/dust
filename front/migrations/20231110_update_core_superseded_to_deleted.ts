import { Sequelize } from "sequelize";

// To be run from connectors with `CORE_DATABASE_URI`
const { CORE_DATABASE_URI, LIVE = false } = process.env;

async function main() {
  const core_sequelize = new Sequelize(CORE_DATABASE_URI as string, {
    logging: false,
  });

  const deletedDocumentsData = await core_sequelize.query(
    `SELECT * FROM data_sources_documents WHERE status = 'deleted'`
  );

  const deletedDocuments = deletedDocumentsData[0] as {
    id: number;
    created: number;
    data_source: number;
    document_id: string;
  }[];

  console.log(
    `Found ${deletedDocuments.length} deleted core documents to process`
  );

  for (const d of deletedDocuments) {
    await processDocument(
      core_sequelize,
      d.created,
      d.data_source,
      d.document_id
    );
  }

  const chunks = [];
  for (let i = 0; i < deletedDocuments.length; i += 32) {
    chunks.push(deletedDocuments.slice(i, i + 32));
  }

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i}/${chunks.length}...`);
    const chunk = chunks[i];
    await Promise.all(
      chunk.map(async (d) => {
        return processDocument(
          core_sequelize,
          d.created,
          d.data_source,
          d.document_id
        );
      })
    );
  }
}

async function processDocument(
  core_sequelize: Sequelize,
  deletedAt: number,
  data_source: number,
  document_id: string
) {
  // These are the versions we want to mark as `deleted` as they precede the `deleted` version we found.
  const supersededBeforeData = await core_sequelize.query(
    `SELECT * FROM data_sources_documents WHERE data_source = :data_source AND document_id = :document_id AND status = 'superseded' AND created <= :deletedAt`,
    {
      replacements: {
        data_source: data_source,
        document_id: document_id,
        deletedAt: deletedAt,
      },
    }
  );

  // We check we don't have a latest in there for sanity.
  const latestBeforeData = await core_sequelize.query(
    `SELECT * FROM data_sources_documents WHERE data_source = :data_source AND document_id = :document_id AND status = 'latest' AND created <= :deletedAt`,
    {
      replacements: {
        data_source: data_source,
        document_id: document_id,
        deletedAt: deletedAt,
      },
    }
  );

  // Just as FYI is there data after the deletion (the file was deleted and re-upserted)
  const afterData = await core_sequelize.query(
    `SELECT * FROM data_sources_documents WHERE data_source = :data_source AND document_id = :document_id AND created > :deletedAt`,
    {
      replacements: {
        data_source: data_source,
        document_id: document_id,
        deletedAt: deletedAt,
      },
    }
  );

  if (afterData[0].length > 0) {
    console.log(
      `Skipping ${afterData[0].length} after deletion for ${document_id}`
    );
  }

  if (latestBeforeData[0].length > 0) {
    throw new Error(
      `Unexpected latest version found before deleted version for ${document_id}`
    );
  }

  console.log(
    `Updating ${supersededBeforeData[0].length} superseded for ${document_id}`
  );

  if (LIVE && supersededBeforeData[0].length > 0) {
    // Actually mark as deleted
    await core_sequelize.query(
      `UPDATE data_sources_documents SET status = 'deleted' WHERE data_source = :data_source AND document_id = :document_id AND status = 'superseded' AND created <= :deletedAt`,
      {
        replacements: {
          data_source: data_source,
          document_id: document_id,
          deletedAt: deletedAt,
        },
      }
    );
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

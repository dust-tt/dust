import { Sequelize } from "sequelize";

const { CORE_DATABASE_URI, LIVE = false } = process.env;

async function main() {
  const core_sequelize = new Sequelize(CORE_DATABASE_URI as string, {
    logging: false,
  });
  console.log("Retrieving core runs");
  const data = await core_sequelize.query(
    "SELECT id, document_id, tags_json, source_url FROM data_sources_documents"
  );

  const documents = data[0] as {
    id: string;
    document_id: string;
    tags_json: string;
    source_url: string;
  }[];
  console.log(`Chunking ${documents.length}`);

  console.log("Chunking");
  const chunkSize = 16;
  const chunks = [];
  for (let i = 0; i < documents.length; i += chunkSize) {
    chunks.push(documents.slice(i, i + chunkSize));
  }

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i}/${chunks.length}...`);
    const chunk = chunks[i];
    if (!chunk) {
      continue;
    }
    await Promise.all(
      chunk.map((d) => {
        return (async () => {
          const tags = JSON.parse(d.tags_json) as string[];
          if (tags.length === 0) {
            if (!LIVE) {
              console.log(`Skipping (no tags): ${d.document_id}`);
            }
            return;
          }
          if (!d.document_id.startsWith("slack-")) {
            if (!LIVE) {
              console.log(`Skipping (not slack): ${d.document_id}`);
            }
          }

          const parts = d.document_id.split("-");
          const pre = [];
          const post = [];
          let isPost = false;
          for (let i = 0; i < parts.length; i++) {
            if (parts[i] === "thread" || parts[i] === "messages") {
              isPost = true;
            }
            if (isPost) {
              post.push(parts[i]);
            } else {
              if (pre.length < 2) {
                pre.push(parts[i]);
              }
            }
          }

          const newDocumentId = [...pre, ...post].join("-");

          if (newDocumentId !== d.document_id) {
            console.log(`Updating ${d.document_id}`);
            console.log(`  document_id: ${newDocumentId}`);

            if (LIVE) {
              return core_sequelize.query(
                `UPDATE data_sources_documents SET "document_id" = :documentId WHERE id = :id`,
                {
                  replacements: {
                    documentId: newDocumentId,
                    id: d.id,
                  },
                }
              );
            }
          }
        })();
      })
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

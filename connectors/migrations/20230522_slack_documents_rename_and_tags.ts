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
          let channelId: string | null = null;
          let channelName: string | null = null;
          let title: string | null = null;
          let threadId: string | null = null;
          for (const i in tags) {
            const t = tags[i];
            if (!t) {
              continue;
            }
            if (t.startsWith("channelId:")) {
              const cId = t.split(":")[1];
              if (cId) {
                channelId = cId;
              }
            }
            if (t.startsWith("channelName:")) {
              const cName = t.split(":")[1];
              if (cName) {
                channelName = cName;
              }
            }
            if (t.startsWith("title:")) {
              const tt = t.split(":")[1];
              if (tt) {
                title = tt;
              }
            }
            if (t.startsWith("threadId:")) {
              const tId = t.split(":")[1];
              if (tId) {
                threadId = tId;
              }
            }
          }

          if (!channelId || !channelName) {
            if (!LIVE) {
              console.log(`Skipping (no channel): ${d.document_id}`);
            }
            return;
          }

          if (threadId) {
            if (d.document_id.startsWith("slack-")) {
              if (!LIVE) {
                console.log(`Skipping (already updated): ${d.document_id}`);
              }
              return;
            }
            // Threaded slack document update.
            console.log(`Updating (thread) ${d.document_id}`);
            const parts = d.document_id.split("-");
            parts[0] = channelId;
            parts.splice(0, 0, "slack");
            const newDocumentId = parts.join("-");
            console.log(`  document_id: ${newDocumentId}`);
            const newTags = [
              `channelId:${channelId}`,
              `channelName:${channelName}`,
              `title:${title}`,
              `threadId:${threadId}`,
            ];
            console.log(`  tags: ${JSON.stringify(newTags)}`);

            if (LIVE) {
              return core_sequelize.query(
                `UPDATE data_sources_documents SET "document_id" = :documentId, "tags_json" = :tagsJson WHERE id = :id`,
                {
                  replacements: {
                    documentId: newDocumentId,
                    tagsJson: JSON.stringify(newTags),
                    id: d.id,
                  },
                }
              );
            }
          } else {
            if (d.document_id.startsWith("slack-")) {
              if (!LIVE) {
                console.log(`Skipping (already updated): ${d.document_id}`);
              }
              return;
            }
            // Non-threaded slack document update.
            console.log(`Updating (non-thread) ${d.document_id}`);
            const parts = d.document_id.split("-");
            parts[0] = channelId;
            parts.splice(0, 0, "slack");
            const newDocumentId = parts.join("-");
            console.log(`  document_id: ${newDocumentId}`);
            if (!title) {
              title = d.document_id;
              console.log(`  title: ${title}`);
            }
            const newTags = [
              `channelId:${channelId}`,
              `channelName:${channelName}`,
              `title:${title}`,
            ];
            console.log(`  tags: ${JSON.stringify(newTags)}`);

            if (LIVE) {
              return core_sequelize.query(
                `UPDATE data_sources_documents SET "document_id" = :documentId, "tags_json" = :tagsJson WHERE id = :id`,
                {
                  replacements: {
                    documentId: newDocumentId,
                    tagsJson: JSON.stringify(newTags),
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

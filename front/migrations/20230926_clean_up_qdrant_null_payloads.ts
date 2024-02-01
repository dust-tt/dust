import { QdrantClient } from "@qdrant/js-client-rest";

const { QDRANT_API_KEY, QDRANT_URL } = process.env;

const client = new QdrantClient({
  url: QDRANT_URL,
  apiKey: QDRANT_API_KEY,
});

async function cleanup(collections: { name: string }[]) {
  console.log(`Cleaning up ${collections.length} collections.`);
  for (const c of collections) {
    let done = 0;
    let offset:
      | number
      | undefined
      | null
      | string
      | Record<string, unknown> = 0;
    while (offset !== null && offset !== undefined) {
      const res = await client.scroll(c.name, {
        filter: {
          must: [
            {
              is_empty: {
                key: "document_id_hash",
              },
            },
          ],
        },
        with_payload: true,
        limit: 1024,
        offset,
      });

      const points = res.points.map((p) => p.id);
      const r = await client.delete(c.name, { wait: true, points });
      console.log(`Deleted ${points.length} points from ${c.name} res=${r}`);

      offset = res.next_page_offset;
      done += res.points.length;
    }

    const rr = await client.getCollection(c.name);
    console.log("DONE", done);
    console.log(rr);
  }
}

async function run() {
  const result = await client.getCollections();
  const collections = result.collections;
  // const collections = COLLECTION_NAMES;

  const collectionsWithNulls: { name: string }[] = [];

  console.log(`Processing ${collections.length} collections.`);
  let i = 0;
  for (const c of collections) {
    let done = 0;
    let offset:
      | number
      | undefined
      | null
      | string
      | Record<string, unknown> = 0;
    while (offset !== null && offset !== undefined) {
      const res = await client.scroll(c.name, {
        filter: {
          must: [
            {
              is_empty: {
                key: "document_id_hash",
              },
            },
          ],
        },
        with_payload: true,
        limit: 1024,
        offset,
      });

      offset = res.next_page_offset;
      done += res.points.length;
    }
    if (done > 0) {
      console.log(`NULL_FOUND [${c.name}] found=${done}`);
      collectionsWithNulls.push(c);
    }
    i++;
    if (i % 32 === 0) {
      console.log(`PROCESS [${i}/${collections.length}] sleeping 1s`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return collectionsWithNulls;
}

void (async () => {
  await cleanup(await run());
})();

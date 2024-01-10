import { QdrantClient } from "@qdrant/js-client-rest";

const { QDRANT_API_KEY, QDRANT_URL } = process.env;

const BUGGY_COLLECTION_NAMES: string[] = [];

const client = new QdrantClient({
  url: QDRANT_URL,
  apiKey: QDRANT_API_KEY,
});

async function run() {
  const result = await client.getCollections();
  const collections = result.collections;

  console.log(`Processing ${collections.length} collections.`);
  let i = 0;
  for (const c of collections) {
    // console.log(c);
    const chunkHashes: { [key: string]: string | number } = {};
    const duplicates: (string | number)[] = [];

    if (BUGGY_COLLECTION_NAMES.includes(c.name)) {
      console.log(`SKIPPING ${c.name}`);
      continue;
    }
    let offset:
      | number
      | undefined
      | null
      | string
      | Record<string, unknown> = 0;
    while (offset !== null && offset !== undefined) {
      const res = await client.scroll(c.name, {
        limit: 1024,
        offset,
      });

      res.points.forEach((p) => {
        if (p.payload) {
          const chunkHash = p.payload["chunk_hash"] as string;
          if (!chunkHash || chunkHash.length === 0) {
            console.log(`EMPTY ${p.payload["data_source_id"]} ${p.id}`);
            return;
          }
          const pointId = p.id;
          if (chunkHashes[chunkHash]) {
            // console.log(
            //   `DUPLICATE ${chunkHash} ${p.payload["data_source_id"]} ${pointId} ${chunkHashes[chunkHash]}`
            // );
            duplicates.push(pointId);
          } else {
            chunkHashes[chunkHash] = pointId;
          }
        }
      });

      offset = res.next_page_offset;
    }

    console.log(
      `Found ${duplicates.length} duplicates and ${
        Object.keys(chunkHashes).length
      } unique chunks in ${c.name}.`
    );

    if (duplicates.length > 0) {
      const chunkSize = 1024;
      const chunks: (string | number)[][] = [];
      for (let j = 0; j < duplicates.length; j += chunkSize) {
        chunks.push(duplicates.slice(j, j + chunkSize));
      }
      for (let j = 0; j < chunks.length; j++) {
        await client.delete(c.name, { wait: true, points: chunks[j] });
        console.log(`DELETED ${chunks[j].length} points from ${c.name}`);
      }
      console.log(`DELETED TOTAL ${duplicates.length} points from ${c.name}`);
    }

    i++;
    if (i % 32 === 0) {
      console.log(`PROCESS [${i}/${collections.length}] sleeping 1s`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

void (async () => {
  await run();
})();

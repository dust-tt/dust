/* Following a typo on points payload in our Qdrant database in which the field
time*st*amp was written time*t*amp This migration creates a new field for every
point, correctly named time*st*amp and with the value of the existing time*t*amp
field*/
import { QdrantClient } from "@qdrant/js-client-rest";

// if reusing, set env vars to those values, don't hardcode the values in the code
// also as a safety delete the env vars (if persisted one way or another) after the migration
// !! Since the client used is the REST client, ensure the port in QDRANT URL is to the REST API (not gRPC), usually 6333 (not 6334)
const { QDRANT_URL, QDRANT_API_KEY } = process.env;

const prodClient = new QdrantClient({
  url: QDRANT_URL,
  apiKey: QDRANT_API_KEY,
});

async function migrateCollection(
  client: QdrantClient,
  collectionName: string,
  batchSize = 250,
  offset?: string | number | undefined | null | Record<string, unknown>
) {
  const currentTime = Date.now();
  let updated = 0;
  const nb_points = await client.count(collectionName);
  console.log(
    "Migrating Collection ",
    collectionName,
    "\nNumber of points: ",
    nb_points.count
  );
  // scroll points excluding those with timestamp field until none are left
  do {
    console.log("Current offset: ", offset);
    const { points, next_page_offset } = await client.scroll(collectionName, {
      limit: batchSize,
      offset,
      with_vector: false,
      filter: {
        must: [{ is_empty: { key: "timestamp" } }],
      },
    });

    // update the points
    const updatePromises = points.map(async (point) => {
      const payload = { timestamp: point.payload?.timetamp };
      await client.setPayload(collectionName, { payload, points: [point.id] });
    });
    // wait for all points of the batch to be updated to avoid flooding the server
    await Promise.all(updatePromises);
    offset = next_page_offset;
    updated += points.length;
  } while (offset !== null);
  console.log(
    "Updated points: ",
    updated,
    "\nTime: ",
    Date.now() - currentTime
  );
}

/* Migrate all collections
 * Points that do not need an update are ignored
 * Therefore can be safely restarted if it fails
 */
async function migrateCollections(client: QdrantClient) {
  const result = await client.getCollections();
  for (const collection of result.collections) {
    await migrateCollection(client, collection.name);
  }
}

void migrateCollections(prodClient);

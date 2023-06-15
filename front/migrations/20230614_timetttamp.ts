/* Following a typo on points payload in our Qdrant database in which the field
time*st*amp was written time*t*amp This migration creates a new field for every
point, correctly named time*st*amp and with the value of the existing time*t*amp
field*/

import { QdrantClient } from "@qdrant/js-client-rest";

const localClient = new QdrantClient({ url: "http://localhost:6333" });

// you should set env vars to those values, not hardcode them
// also as a safety delete the env vars (if persisted one way or another) after the migration
const { QDRANT_PROD_URL, QDRANT_PROD_API_KEY } = process.env;
const prodClient = new QdrantClient({
  url: QDRANT_PROD_URL,
  apiKey: QDRANT_PROD_API_KEY,
});

const dustSlackInternalId =
  "ds_08e9f4f34877ac15c890abac5c730c71f40d87e720f6a9f9dd066b729bba6380";

async function checkCollections(client: QdrantClient) {
  const result = await client.getCollections();
  // get the number of collections
  console.log(result.collections.length);
  let totalPoints = 0;
  // for each collection
  for (const collection of result.collections) {
    // get the number of points
    const count_response = await client.count(collection.name);
    totalPoints += count_response.count;

    // get the first 10 points
    const points_response = await client.scroll(collection.name, {
      filter: {
        should: [
          { key: "data_source_id", match: { value: "managed-slack" } },
          { key: "data_source_id", match: { value: "managed-notion" } },
        ],
      },
    });
    const points = points_response.points;
    if (points.length > 0 && points[0]) {
      // get the first point
      const point = points[0];
      // print the collection name and the point's payload

      console.log(
        collection.name,
        count_response.count,
        "\n",
        point.payload?.["data_source_id"],
        point.payload
      );
      // console.log(collection, count_response.count);
    }
    console.log(collection.name, count_response.count);
  }
  console.log(totalPoints);
}

async function createCollection() {
  // get slack collection from prod
  const slackCollection = await prodClient.getCollection(dustSlackInternalId);
  console.log(slackCollection.config.params);
  // create similar collection on local
  await localClient.createCollection(
    "real-managed-slack-dust",
    slackCollection.config.params
  );
}

async function copy100points() {
  // scroll 100 points from prod
  const points_response = await prodClient.scroll(dustSlackInternalId, {
    limit: 100,
    with_vector: true,
  });
  const points = points_response.points;
  // get points ids, vectors and payloads
  const ids = points.map((p) => p.id);
  const vectors = points.map((p) => p.vector);
  const payloads = points.map((p) => p.payload);
  console.log(points_response);
  // add points to local
  await localClient.upsert("real-managed-slack-dust", {
    batch: { ids, vectors, payloads },
  });
}

async function scroll10points(client: QdrantClient, collectionName: string) {
  // scroll 10 points from local to check that they are there and don't have the timestamp field
  const points_response = await client.scroll(collectionName, {
    limit: 10,
    with_vector: true,
    filter: {},
  });
  console.log(points_response.points[0].vector);
  console.log(points_response.points.map((p) => p.payload));
}

async function migrateCollection(
  client: QdrantClient,
  collectionName: string,
  batchSize = 250,
  offset?: string | number | undefined | null | Record<string, unknown>
) {
  let currentTime = Date.now();
  let points;
  let updated = 0;
  let nb_points = await client.count(collectionName);
  console.log("Migrating Collection ", collectionName);
  console.log("Number of points: ", nb_points.count);
  // scroll points excluding those with timestamp field until none are left
  do {
    console.log("Current offset: ", offset);
    const points_response = await client.scroll(collectionName, {
      limit: batchSize,
      offset,
      with_vector: false,
      filter: {
        must: [{ is_empty: { key: "timestamp" } }],
      },
    });
    points = points_response.points;
    // for each point use set payload to add the timestamp field
    const updatePromises = points.map(async (point) => {
      const payload = { timestamp: point.payload?.timetamp };
      // update the point
      await client.setPayload(collectionName, { payload, points: [point.id] });
    });
    // wait for all points of the batch to be updated to avoid flooding the server
    await Promise.all(updatePromises);
    // update the offset
    offset = points_response.next_page_offset;
    updated += points.length;
  } while (points.length > 0 && offset !== null);
  console.log("Updated points: ", updated);
  console.log("Time: ", Date.now() - currentTime);
}

async function testMigration() {
  await localClient.deleteCollection("real-managed-slack-dust");
  await createCollection();
  await copy100points();
  await scroll10points(localClient, "real-managed-slack-dust");
  await migrateCollection(localClient, "real-managed-slack-dust");
  await scroll10points(localClient, "real-managed-slack-dust");
}

/* Migrate all collections
 * Ignores points that do not need an update
 * Therefore can be safely restarted if it fails
 */
async function migrateCollections(client: QdrantClient) {
  // get all collections
  const result = await client.getCollections();
  // for each collection
  for (const collection of result.collections) {
    // migrate it
    await migrateCollection(client, collection.name);
  }
}
testMigration();

/* Following a typo on points payload in our Qdrant database in which the field
time*st*amp was written time*t*amp This migration creates a new field for every
point, correctly named time*st*amp and with the value of the existing time*t*amp
field*/

import { QdrantClient } from "@qdrant/js-client-rest";

const qdrant = new QdrantClient({ url: "http://localhost:6333" });

async function migrateCollections(client: QdrantClient) {
  const result = await client.getCollections();
  // get the number of collections
  console.log(result.collections.length);
  // for each collection
  for (const collection of result.collections) {
    // get the first 10 points
    const points_response = await client.scroll(collection.name, 
        { filter: { should: [
            { key: "data_source_id", match: { value: "managed-slack" }},
            { key: "data_source_id", match: { value: "managed-notion" }}] }});
    const points = points_response.points;
    if (points.length > 0) {
      // get the first point
      const point = points[0];
      // print the collection name and the point's payload
      console.log(collection.name, point.payload['data_source_id'], point.payload);
    }
  }
}

migrateCollections(qdrant);

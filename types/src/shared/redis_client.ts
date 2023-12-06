import { createClient } from "redis";

export async function redisClient(redisUrl: string) {
  const client = createClient({
    url: redisUrl,
  });
  client.on("error", (err) => console.log("Redis Client Error", err));

  await client.connect();

  return client;
}

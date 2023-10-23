import { createClient } from "redis";

export async function redisClient() {
  const { REDIS_URI } = process.env;
  if (!REDIS_URI) {
    throw new Error("REDIS_URI is not defined");
  }
  const client = createClient({
    url: REDIS_URI,
  });
  client.on("error", (err) => console.log("Redis Client Error", err));

  await client.connect();

  return client;
}

import { createClient } from "redis";

let REDIS_CLIENT: ReturnType<typeof createClient> | undefined = undefined;

export async function redisClient() {
  if (REDIS_CLIENT) {
    return REDIS_CLIENT;
  }
  const {REDIS_URI} = process.env;
  if (!REDIS_URI) {
    throw new Error("REDIS_URI is not defined");
  }
  const client = createClient({
    url: REDIS_URI,
  });
  client.on("error", (err) => console.log("Redis Client Error", err));

  await client.connect();
  REDIS_CLIENT = client;

  return REDIS_CLIENT;
}

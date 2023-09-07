import { createClient } from "redis";

let REDIS_CLIENT: ReturnType<typeof createClient> | undefined = undefined;

export async function redisClient() {
  if (REDIS_CLIENT) {
    return REDIS_CLIENT;
  }
  const client = createClient();
  client.on("error", (err) => console.log("Redis Client Error", err));

  await client.connect();
  REDIS_CLIENT = client;

  return REDIS_CLIENT;
}

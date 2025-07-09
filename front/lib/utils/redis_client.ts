import { createClient } from "redis";

import { getStatsDClient } from "./statsd";

export type RedisUsageTagsType = "cache_with_redis" | "rate_limiter";

export async function redisClient({
  origin,
  redisUri,
}: {
  origin: RedisUsageTagsType;
  redisUri: string;
}) {
  const statsDClient = getStatsDClient();

  const client = createClient({
    url: redisUri,
  });
  client.on("error", (err) => console.log("Redis Client Error", err));
  client.on("connect", () => {
    statsDClient.increment("redis.connection.count", 1, [origin]);
  });
  client.on("end", () => {
    statsDClient.decrement("redis.connection.count", 1, [origin]);
  });

  await client.connect();

  return client;
}

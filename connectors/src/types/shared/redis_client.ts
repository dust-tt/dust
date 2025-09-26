import type { RedisClientType } from "redis";
import { createClient } from "redis";

import logger from "@connectors/logger/logger";
import { statsDClient } from "@connectors/logger/withlogging";

// We have two distinct Redis URIs: REDIS_URI and REDIS_CACHE_URI.
// These are singletons for each URI.
let client: RedisClientType | null = null;
let cacheClient: RedisClientType | null = null;

type RedisUsageTagsType =
  | "notion_gc"
  | "google_drive_incremental_sync"
  | "throttle"
  | "lock"
  | "rate_limiter";

const REDIS_CACHE_USAGE_TAG = "cache_with_redis";

type RedisCacheUsageTagsType = typeof REDIS_CACHE_USAGE_TAG;

async function createRedisClient({
  origin,
  redisUri,
}: {
  origin: RedisUsageTagsType | RedisCacheUsageTagsType;
  redisUri?: string;
}): Promise<RedisClientType> {
  const client: RedisClientType = createClient({
    url: redisUri,
    isolationPoolOptions: {
      acquireTimeoutMillis: 10000, // Max time to wait for a connection: 10 seconds.
      max: 500, // Maximum number of concurrent connections for streaming.
      evictionRunIntervalMillis: 15000, // Check for idle connections every 15 seconds.
      idleTimeoutMillis: 30000, // Connections idle for more than 30 seconds will be eligible for eviction.
    },
  });
  client.on("error", (err) =>
    logger.error({ err, origin }, "Redis Client Error")
  );
  client.on("connect", () => {
    statsDClient.increment("redis.connection.count", 1, [`origin:${origin}`]);
  });
  client.on("end", () => {
    statsDClient.decrement("redis.connection.count", 1, [`origin:${origin}`]);
  });

  await client.connect();

  return client;
}

export async function redisClient({
  origin,
}: {
  origin: RedisUsageTagsType | RedisCacheUsageTagsType;
}) {
  const isCache = origin === REDIS_CACHE_USAGE_TAG;

  const targetClient = isCache ? cacheClient : client;
  if (targetClient) {
    return targetClient;
  }

  const { REDIS_URI, REDIS_CACHE_URI } = process.env;
  const redisUri = isCache ? REDIS_CACHE_URI : REDIS_URI;
  if (!redisUri) {
    throw new Error(
      `${isCache ? "REDIS_CACHE_URI" : "REDIS_URI"} is not defined`
    );
  }

  client = await createRedisClient({ origin, redisUri });

  return client;
}

export async function closeRedisClients() {
  await client?.quit();
  client = null;
  await cacheClient?.quit();
  cacheClient = null;
}

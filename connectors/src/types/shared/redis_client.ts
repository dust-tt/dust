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

type RedisCacheUsageTagsType = "cache_with_redis";

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
  client.on("error", (err) => logger.info({ err }, "Redis Client Error"));
  client.on("ready", () => logger.info({}, "Redis Client Ready"));
  client.on("connect", () => {
    logger.info({ origin }, "Redis Client Connected");
    statsDClient.increment("redis.connection.count", 1, [`origin:${origin}`]);
  });
  client.on("end", () => {
    logger.info({ origin }, "Redis Client End");
    statsDClient.decrement("redis.connection.count", 1, [`origin:${origin}`]);
  });

  await client.connect();

  return client;
}

export async function redisClient({ origin }: { origin: RedisUsageTagsType }) {
  if (client) {
    return client;
  }

  const { REDIS_URI } = process.env;
  if (!REDIS_URI) {
    throw new Error("REDIS_URI is not defined");
  }

  client = await createRedisClient({ origin, redisUri: REDIS_URI });

  return client;
}

export async function redisCacheClient({
  origin,
}: {
  origin: RedisCacheUsageTagsType;
}) {
  if (cacheClient) {
    return cacheClient;
  }

  const REDIS_CACHE_URI = process.env.REDIS_CACHE_URI;
  if (!REDIS_CACHE_URI) {
    throw new Error("REDIS_CACHE_URI is not set");
  }

  cacheClient = await createRedisClient({ origin, redisUri: REDIS_CACHE_URI });

  return cacheClient;
}

export async function closeRedisClients() {
  await client?.quit();
  await cacheClient?.quit();
}

import type { RedisClientType } from "redis";
import { createClient } from "redis";

import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";

const clients: Record<"cache" | "standard", RedisClientType | null> = {
  cache: null,
  standard: null,
};

export type RedisUsageTagsType =
  | "action_validation"
  | "agent_recent_authors"
  | "agent_usage"
  | "assistant_generation"
  | "cancel_message_generation"
  | "conversation_events"
  | "lock"
  | "mcp_client_side_request"
  | "mcp_client_side_results"
  | "mentions_count"
  | "message_events"
  | "notion_url_sync"
  | "public_api_limits"
  | "reasoning_generation"
  | "retry_agent_message"
  | "update_authors"
  | "user_message_events"
  | "cache_with_redis"
  | "rate_limiter";

const getRedisURIAndKeyForUsage = (
  usage: RedisUsageTagsType
): { key: keyof typeof clients; uri: string } => {
  switch (usage) {
    case "cache_with_redis":
      return { key: "cache", uri: config.getRedisCacheURI() };
    default:
      return { key: "standard", uri: config.getRedisURI() };
  }
};

export async function getRedisClient({
  origin,
}: {
  origin: RedisUsageTagsType;
}): Promise<RedisClientType> {
  const { key, uri } = getRedisURIAndKeyForUsage(origin);

  let client = clients[key];

  if (client === null) {
    client = createClient({
      url: uri,
      isolationPoolOptions: {
        acquireTimeoutMillis: 10000, // Max time to wait for a connection: 10 seconds.
        min: 1,
        max: 800, // Maximum number of concurrent connections for streaming.
        evictionRunIntervalMillis: 15000, // Check for idle connections every 15 seconds.
        idleTimeoutMillis: 30000, // Connections idle for more than 30 seconds will be eligible for eviction.
      },
    });

    client.on("error", (err) => logger.info({ err }, "Redis Client Error"));
    client.on("ready", () => logger.info({}, "Redis Client Ready"));
    client.on("connect", () => {
      logger.info({ origin }, "Redis Client Connected");
      statsDClient.increment("redis.connection.count", 1, [origin]);
    });
    client.on("end", () => {
      logger.info({ origin }, "Redis Client End");
      statsDClient.decrement("redis.connection.count", 1, [origin]);
    });

    await client.connect();
    clients[key] = client;
    return client;
  }

  return client;
}

export async function runOnRedis<T>(
  opts: { origin: RedisUsageTagsType },
  fn: (client: RedisClientType) => PromiseLike<T>
): Promise<T> {
  const client = await getRedisClient(opts);

  return fn(client);
}

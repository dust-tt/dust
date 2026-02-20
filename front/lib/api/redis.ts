import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import type { RedisClientType } from "redis";
export type { RedisClientType };

import { createClient } from "redis";

const clients = new Map<string, RedisClientType>();

export interface RedisClientOptions {
  socket?: {
    reconnectStrategy?: (retries: number) => number | Error;
  };
  isolationPoolOptions?: {
    min?: number;
    max?: number;
    acquireTimeoutMillis?: number;
    evictionRunIntervalMillis?: number;
    idleTimeoutMillis?: number;
  };
}

const DEFAULT_ISOLATION_POOL_OPTIONS = {
  acquireTimeoutMillis: 10000,
  min: 1,
  max: 8000,
  evictionRunIntervalMillis: 15000,
  idleTimeoutMillis: 30000,
};

export type RedisUsageTagsType =
  | "agent_recent_authors"
  | "agent_usage"
  | "assistant_generation"
  | "cache_with_redis"
  | "cancel_message_generation"
  | "conversation_events"
  | "daily_usage_tracking"
  | "email_context"
  | "force_reload_commits"
  | "key_usage_tracking"
  | "lock"
  | "mcp_client_side_request"
  | "mcp_client_side_results"
  | "mentions_count"
  | "message_events"
  | "notion_url_sync"
  | "poke_cache_lookup"
  | "public_api_limits"
  | "rate_limiter"
  | "reasoning_generation"
  | "retry_agent_message"
  | "update_authors"
  | "user_message_events";

async function createRedisClient({
  origin,
  redisUri,
  options,
}: {
  origin: RedisUsageTagsType;
  redisUri: string;
  options?: RedisClientOptions;
}): Promise<RedisClientType> {
  const newClient: RedisClientType = createClient({
    url: redisUri,
    socket: options?.socket,
    isolationPoolOptions:
      options?.isolationPoolOptions ?? DEFAULT_ISOLATION_POOL_OPTIONS,
    disableClientInfo: true,
  });
  newClient.on("error", (err) => logger.info({ err }, "Redis Client Error"));
  newClient.on("ready", () => logger.info({}, "Redis Client Ready"));
  newClient.on("connect", () => {
    logger.info({ origin }, "Redis Client Connected");
    statsDClient.increment("redis.connection.count", 1, [`origin:${origin}`]);
  });
  newClient.on("end", () => {
    logger.info({ origin }, "Redis Client End");
    statsDClient.decrement("redis.connection.count", 1, [`origin:${origin}`]);
  });

  await newClient.connect();
  return newClient;
}

async function getRedisClientByUri({
  origin,
  redisUri,
}: {
  origin: RedisUsageTagsType;
  redisUri: string;
}): Promise<RedisClientType> {
  const existingClient = clients.get(redisUri);
  if (existingClient) {
    return existingClient;
  }

  const newClient = await createRedisClient({ origin, redisUri });
  clients.set(redisUri, newClient);
  return newClient;
}

// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
export async function createRedisStreamClient({
  origin,
  options,
}: {
  origin: RedisUsageTagsType;
  options?: RedisClientOptions;
}): Promise<RedisClientType> {
  const redisUri = config.getRedisUri();
  return createRedisClient({ origin, redisUri, options });
}

// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
export async function getRedisStreamClient({
  origin,
}: {
  origin: RedisUsageTagsType;
}): Promise<RedisClientType> {
  const redisUri = config.getRedisUri();
  return getRedisClientByUri({ origin, redisUri });
}

// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
export async function getRedisCacheClient({
  origin,
}: {
  origin: RedisUsageTagsType;
}): Promise<RedisClientType> {
  const redisCacheUri = config.getRedisCacheUri();
  return getRedisClientByUri({ origin, redisUri: redisCacheUri });
}

export async function runOnRedis<T>(
  opts: { origin: RedisUsageTagsType },
  fn: (client: RedisClientType) => PromiseLike<T>
): Promise<T> {
  const client = await getRedisStreamClient(opts);
  return fn(client);
}

export async function runOnRedisCache<T>(
  opts: { origin: RedisUsageTagsType },
  fn: (client: RedisClientType) => PromiseLike<T>
): Promise<T> {
  const client = await getRedisCacheClient(opts);
  return fn(client);
}

export async function closeRedisClients(): Promise<void> {
  for (const [, client] of clients) {
    await client.quit();
  }
  clients.clear();
}

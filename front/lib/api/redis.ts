import type { RedisClientType } from "redis";
import { createClient } from "redis";

import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/withlogging";

let client: RedisClientType;

type RedisUsageTagsType =
  | "agent_recent_authors"
  | "agent_usage"
  | "assistant_generation"
  | "cancel_message_generation"
  | "conversation_events"
  | "mentions_count"
  | "message_events"
  | "retry_agent_message"
  | "update_authors"
  | "user_message_events";

export async function getRedisClient({
  origin,
}: {
  origin: RedisUsageTagsType;
}): Promise<RedisClientType> {
  if (!client) {
    const { REDIS_URI } = process.env;
    if (!REDIS_URI) {
      throw new Error("REDIS_URI is not defined");
    }

    client = createClient({
      url: REDIS_URI,
      isolationPoolOptions: {
        acquireTimeoutMillis: 10000, // Max time to wait for a connection: 10 seconds.
        min: 1,
        max: 500, // Maximum number of concurrent connections for streaming.
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

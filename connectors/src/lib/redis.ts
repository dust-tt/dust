import type { RedisClientType } from "redis";
import { createClient } from "redis";

import logger from "@connectors/logger/logger";
import { statsDClient } from "@connectors/logger/withlogging";

let client: RedisClientType;

type RedisUsageTagsType = "notion_gc";

export async function redisClient({
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

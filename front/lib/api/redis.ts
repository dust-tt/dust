import type { RedisClientType } from "redis";
import { createClient } from "redis";

import logger from "@app/logger/logger";

let client: RedisClientType;

export async function getRedisClient(): Promise<RedisClientType> {
  if (!client) {
    const { REDIS_URI } = process.env;
    if (!REDIS_URI) {
      throw new Error("REDIS_URI is not defined");
    }

    client = createClient({
      url: REDIS_URI,
      isolationPoolOptions: {
        acquireTimeoutMillis: 10000, // 10 seconds.
        // We support up to 200 concurrent connections for streaming.
        max: 200,
      },
    });
    client.on("error", (err) => logger.info({ err }, "Redis Client Error"));
    client.on("ready", () => logger.info({}, "Redis Client Ready"));
    client.on("connect", () => logger.info({}, "Redis Client Connected"));
    client.on("end", () => logger.info({}, "Redis Client End"));

    await client.connect();
  }

  return client;
}

export async function runOnRedis<T>(
  fn: (client: RedisClientType) => PromiseLike<T>
): Promise<T> {
  const client = await getRedisClient();

  return fn(client);
}

import type { RedisClientType } from "redis";
import { createClient } from "redis";

import logger from "@connectors/logger/logger";

let client: RedisClientType;

export async function redisClient(): Promise<RedisClientType> {
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
    client.on("connect", () => logger.info({}, "Redis Client Connected"));
    client.on("end", () => logger.info({}, "Redis Client End"));

    await client.connect();
  }

  return client;
}

export async function lockWithRedis<T>(
  lockKey: string,
  timeoutSecs: number,
  fn: () => Promise<T>
): Promise<T> {
  const client = await redisClient();
  let lockAcquired = false;
  try {
    const start = new Date();

    let result: null | number = null;
    do {
      result = await client.incr(lockKey);
      if (result === 1) {
        // Lock acquired. Release will be done by the finally block.
        await client.expire(lockKey, timeoutSecs);
        lockAcquired = true;
        return await fn();
      } else {
        // The lock is already acquired by another process.
        // We decrement the lock key and wait, we'll try again.
        await client.decr(lockKey);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } while (new Date().getTime() - start.getTime() < timeoutSecs * 1000);
  } finally {
    if (lockAcquired) {
      // Release the lock only if it was successfully acquired.
      await client.decr(lockKey);
    }
  }

  throw new Error(
    `Failed to acquire lock for key: ${lockKey} after ${timeoutSecs} seconds`
  );
}

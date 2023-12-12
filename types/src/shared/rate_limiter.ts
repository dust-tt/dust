import { v4 as uuidv4 } from "uuid";

import { LoggerInterface } from "../shared/logger";
import { redisClient } from "../shared/redis_client";
import { getStatsDClient } from "./statsd";

export class RateLimitError extends Error {}

export async function rateLimiter({
  key,
  maxPerTimeframe,
  timeframeSeconds,
  logger,
  redisUri,
}: {
  key: string;
  maxPerTimeframe: number;
  timeframeSeconds: number;
  logger: LoggerInterface;
  redisUri?: string;
}): Promise<number> {
  const statsDClient = getStatsDClient();
  if (!redisUri) {
    const REDIS_URI = process.env.REDIS_URI;
    if (!REDIS_URI) {
      throw new Error("REDIS_CACHE_URI is not set");
    }
    redisUri = REDIS_URI;
  }
  let redis: undefined | Awaited<ReturnType<typeof redisClient>> = undefined;
  const now = new Date();
  const tags = [`rate_limiter:${key}`];
  try {
    redis = await redisClient(redisUri);
    const redisKey = `rate_limiter:${key}`;

    const zcountRes = await redis.zCount(
      redisKey,
      new Date().getTime() - timeframeSeconds * 1000,
      "+inf"
    );
    const remaining = maxPerTimeframe - zcountRes;
    if (remaining > 0) {
      await redis.zAdd(redisKey, {
        score: new Date().getTime(),
        value: uuidv4(),
      });
      await redis.expire(redisKey, timeframeSeconds * 2);
    } else {
      statsDClient.increment("ratelimiter.exceeded.count", 1, tags);
    }
    const totalTimeMs = new Date().getTime() - now.getTime();

    statsDClient.distribution(
      "ratelimiter.latency.distribution",
      totalTimeMs,
      tags
    );

    return remaining > 0 ? remaining : 0;
  } catch (e) {
    statsDClient.increment("ratelimiter.error.count", 1, tags);
    logger.error(
      {
        key,
        maxPerTimeframe,
        timeframeSeconds,
        error: e,
      },
      `RateLimiter error`
    );

    // in case of error on our side, we allow the request.
    return 1;
  } finally {
    if (redis) {
      await redis.quit();
    }
  }
}

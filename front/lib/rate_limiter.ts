import StatsD from "hot-shots";
import { v4 as uuidv4 } from "uuid";

import { redisClient } from "@app/lib/redis";
import logger from "@app/logger/logger";

export const statsDClient = new StatsD();
export async function rateLimiter(
  key: string,
  maxPerTimeframe: number,
  timeframeSeconds: number
): Promise<number> {
  let redis: undefined | Awaited<ReturnType<typeof redisClient>> = undefined;
  const now = new Date();
  const tags = [`rate_limiter:${key}`];
  try {
    redis = await redisClient();
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

    return remaining;
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

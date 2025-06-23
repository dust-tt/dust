import { v4 as uuidv4 } from "uuid";

import { getRedisClient } from "@app/lib/api/redis";
import { getStatsDClient } from "@app/lib/utils/statsd";
import type { LoggerInterface, Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

export class RateLimitError extends Error {}

export const RATE_LIMITER_PREFIX = "rate_limiter";

const makeRateLimiterKey = (key: string) => `${RATE_LIMITER_PREFIX}:${key}`;

interface RateLimiterOptionsBase {
  key: string;
}

export async function rateLimiter({
  key,
  maxPerTimeframe,
  timeframeSeconds,
  logger,
}: {
  logger: LoggerInterface;
  maxPerTimeframe: number;
  timeframeSeconds: number;
} & RateLimiterOptionsBase): Promise<number> {
  const statsDClient = getStatsDClient();

  const now = new Date();
  const redisKey = makeRateLimiterKey(key);
  const tags: string[] = [];

  try {
    const redis = await getRedisClient({ origin: "rate_limiter" });

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

    // In case of error on our side, we allow the request.
    return 1;
  }
}

export async function expireRateLimiterKey({
  key,
}: RateLimiterOptionsBase): Promise<Result<boolean, Error>> {
  try {
    const redis = await getRedisClient({ origin: "rate_limiter" });
    const redisKey = makeRateLimiterKey(key);

    const isExpired = await redis.expire(redisKey, 0);

    return new Ok(isExpired);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

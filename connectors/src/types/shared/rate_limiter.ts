import type { LoggerInterface, Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { v4 as uuidv4 } from "uuid";

import { normalizeError } from "@connectors/types";

import { redisClient } from "./redis_client";
import { getStatsDClient } from "./statsd";

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

  const redis = await redisClient({ origin: "rate_limiter" });

  try {
    const zCountRes = await redis.zCount(
      redisKey,
      new Date().getTime() - timeframeSeconds * 1000,
      "+inf"
    );
    const remaining = maxPerTimeframe - zCountRes;
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
  const redis = await redisClient({ origin: "rate_limiter" });
  const redisKey = makeRateLimiterKey(key);

  try {
    const isExpired = await redis.expire(redisKey, 0);

    return new Ok(isExpired);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

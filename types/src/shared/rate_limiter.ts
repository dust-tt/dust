import { v4 as uuidv4 } from "uuid";

import { MaxMessagesTimeframeType } from "../front/plan";
import { LoggerInterface } from "../shared/logger";
import { redisClient, RedisUsageTagsType } from "../shared/redis_client";
import { Err, Ok, Result } from "./result";
import { getStatsDClient } from "./statsd";

export class RateLimitError extends Error {}

async function getRedisClient({
  origin,
  redisUri,
}: {
  origin: RedisUsageTagsType;
  redisUri?: string;
}) {
  const REDIS_URI = redisUri || process.env.REDIS_URI;
  if (!REDIS_URI) {
    throw new Error("REDIS_URI is not defined");
  }

  return redisClient({ origin, redisUri: REDIS_URI });
}

export const RATE_LIMITER_PREFIX = "rate_limiter";

const makeRateLimiterKey = (key: string) => `${RATE_LIMITER_PREFIX}:${key}`;

interface RateLimiterOptionsBase {
  key: string;
  redisUri?: string;
}

export async function rateLimiter({
  key,
  maxPerTimeframe,
  timeframeSeconds,
  logger,
  redisUri,
}: {
  logger: LoggerInterface;
  maxPerTimeframe: number;
  timeframeSeconds: number;
} & RateLimiterOptionsBase): Promise<number> {
  const statsDClient = getStatsDClient();

  const now = new Date();
  const redisKey = makeRateLimiterKey(key);
  const tags = [redisKey];

  let redis: undefined | Awaited<ReturnType<typeof redisClient>> = undefined;
  try {
    redis = await getRedisClient({ origin: "rate_limiter", redisUri });

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
  } finally {
    if (redis) {
      await redis.quit();
    }
  }
}

export async function expireRateLimiterKey({
  key,
  redisUri,
}: RateLimiterOptionsBase): Promise<Result<boolean, Error>> {
  let redis: undefined | Awaited<ReturnType<typeof redisClient>> = undefined;

  try {
    redis = await getRedisClient({ origin: "rate_limiter", redisUri });
    const redisKey = makeRateLimiterKey(key);

    const isExpired = await redis.expire(redisKey, 0);

    return new Ok(isExpired);
  } catch (err) {
    return new Err(err as Error);
  } finally {
    if (redis) {
      await redis.quit();
    }
  }
}

export function getTimeframeSecondsFromLiteral(
  timeframeLiteral: MaxMessagesTimeframeType
): number {
  switch (timeframeLiteral) {
    case "day":
      return 60 * 60 * 24; // 1 day.

    // Lifetime is intentionally mapped to a 30-day period.
    case "lifetime":
      return 60 * 60 * 24 * 30; // 30 days.

    default:
      return 0;
  }
}

import type { RedisUsageTagsType } from "@app/lib/utils/redis_client";
import { redisClient } from "@app/lib/utils/redis_client";
import { getStatsDClient } from "@app/lib/utils/statsd";
import type { LoggerInterface, Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

export class RateLimitError extends Error {}

let rateLimiterRedisClient: Awaited<ReturnType<typeof redisClient>> | undefined;

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

  if (!rateLimiterRedisClient) {
    rateLimiterRedisClient = await redisClient({
      origin,
      redisUri: REDIS_URI,
    });
  }

  return rateLimiterRedisClient;
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
  const tags: string[] = [];

  // Lua script for atomic rate limiting
  const luaScript = `
    local current_time = redis.call('TIME')
    local key = KEYS[1]
    local window = tonumber(ARGV[1])
    local ttl = window + 60
    local limit = tonumber(ARGV[2])

    local trim_time = tonumber(current_time[1]) - window
    redis.call('ZREMRANGEBYSCORE', key, 0, trim_time)
    local request_count = redis.call('ZCARD', key)

    if request_count < limit then
      redis.call('ZADD', key, current_time[1], current_time[1] .. current_time[2])
      redis.call('EXPIRE', key, ttl)
      return limit - request_count;
    else
      return 0

    end
  `;

  let redis: undefined | Awaited<ReturnType<typeof redisClient>> = undefined;
  try {
    redis = await getRedisClient({ origin: "rate_limiter", redisUri });
    const remaining = (await redis.eval(luaScript, {
      keys: [redisKey],
      arguments: [timeframeSeconds.toString(), maxPerTimeframe.toString()],
    })) as number;

    const totalTimeMs = new Date().getTime() - now.getTime();
    statsDClient.distribution(
      "ratelimiter.latency.distribution",
      totalTimeMs,
      tags
    );

    if (remaining <= 0) {
      statsDClient.increment("ratelimiter.exceeded.count", 1, tags);
    }

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
    return 1; // Allow request if error is on our side
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
    return new Err(normalizeError(err));
  }
}

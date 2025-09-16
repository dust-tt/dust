import { v4 as uuidv4 } from "uuid";
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
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
    local key = KEYS[1]
    local window_seconds = tonumber(ARGV[1])
    local limit = tonumber(ARGV[2])
    local value = ARGV[3]

    -- Use Redis server time to avoid client clock skew
    local t = redis.call('TIME') -- { seconds, microseconds }
    local sec = tonumber(t[1])
    local usec = tonumber(t[2])

    local now_ms = sec * 1000 + math.floor(usec / 1000)
    local window_ms = window_seconds * 1000
    local trim_before = now_ms - window_ms

    -- Current count in window
    local count = redis.call('ZCOUNT', key, trim_before, '+inf')

    if count < limit then
      -- Allow: record this request at now_ms
      redis.call('ZADD', key, now_ms, value)
      -- Keep the key around a bit longer than the window to allow trims
      local ttl_ms = window_ms + 60000
      redis.call('PEXPIRE', key, ttl_ms)
      -- Return remaining BEFORE consuming to match previous behavior
      return limit - count
    else
      -- Block
      return 0
    end

  `;

  let redis: undefined | Awaited<ReturnType<typeof redisClient>> = undefined;
  try {
    redis = await getRedisClient({ origin: "rate_limiter", redisUri });
    const remaining = (await redis.eval(luaScript, {
      keys: [redisKey],
      arguments: [timeframeSeconds.toString(), maxPerTimeframe.toString(), uuidv4()],
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

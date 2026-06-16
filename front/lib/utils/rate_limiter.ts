import { getRedisStreamClient } from "@app/lib/api/redis";
import { getStatsDClient } from "@app/lib/utils/statsd";
import type {
  MaxAwuCreditsTimeframeType,
  MaxMessagesTimeframeType,
} from "@app/types/plan";
import type { LoggerInterface } from "@app/types/shared/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { v4 as uuidv4 } from "uuid";

export class RateLimitError extends Error {}

export const RATE_LIMITER_PREFIX = "rate_limiter";

const makeRateLimiterKey = (key: string) => `${RATE_LIMITER_PREFIX}:${key}`;

type RateLimiterArgs = {
  key: string;
  logger: LoggerInterface;
  maxPerTimeframe: number;
  timeframeSeconds: number;
  incrementBy?: number;
};

export async function rateLimiter({
  key,
  maxPerTimeframe,
  timeframeSeconds,
  logger,
  incrementBy = 1,
}: RateLimiterArgs): Promise<number> {
  const now = new Date();
  const redisKey = makeRateLimiterKey(key);
  const tags: string[] = [];

  if (!Number.isInteger(incrementBy) || incrementBy <= 0) {
    throw new Error("incrementBy must be a positive integer.");
  }
  if (!Number.isInteger(maxPerTimeframe) || maxPerTimeframe < 0) {
    throw new Error("maxPerTimeframe must be a non-negative integer.");
  }
  if (!Number.isInteger(timeframeSeconds) || timeframeSeconds <= 0) {
    throw new Error("timeframeSeconds must be a positive integer.");
  }

  const luaScript = `
    local key = KEYS[1]
    local window_seconds = tonumber(ARGV[1])
    local limit = tonumber(ARGV[2])
    local increment_by = tonumber(ARGV[3])

    -- Use Redis server time to avoid client clock skew
    local t = redis.call('TIME') -- { seconds, microseconds }
    local sec = tonumber(t[1])
    local usec = tonumber(t[2])

    local now_ms = sec * 1000 + math.floor(usec / 1000)
    local window_ms = window_seconds * 1000
    local trim_before = now_ms - window_ms

    local count = redis.call('ZCOUNT', key, trim_before, '+inf')

    if count + increment_by <= limit then
      -- Allow: record one entry per consumed unit at now_ms.
      for i = 1, increment_by do
        redis.call('ZADD', key, now_ms, ARGV[3 + i])
      end
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

  try {
    const redis = await getRedisStreamClient({ origin: "rate_limiter" });
    const values = Array.from({ length: incrementBy }, () => uuidv4());
    const remaining = (await redis.eval(luaScript, {
      keys: [redisKey],
      arguments: [
        timeframeSeconds.toString(),
        maxPerTimeframe.toString(),
        incrementBy.toString(),
        ...values,
      ],
    })) as number;

    const totalTimeMs = new Date().getTime() - now.getTime();
    getStatsDClient().distribution(
      "ratelimiter.latency.distribution",
      totalTimeMs,
      tags
    );

    if (remaining <= 0) {
      getStatsDClient().increment("ratelimiter.exceeded.count", 1, tags);
    }

    return remaining;
  } catch (e) {
    getStatsDClient().increment("ratelimiter.error.count", 1, tags);
    logger.error(
      {
        key,
        maxPerTimeframe,
        timeframeSeconds,
        incrementBy,
        error: e,
      },
      `RateLimiter error`
    );
    return 1; // Allow request if error is on our side
  }
}

export async function expireRateLimiterKey({
  key,
}: {
  key: string;
}): Promise<Result<boolean, Error>> {
  try {
    const redis = await getRedisStreamClient({ origin: "rate_limiter" });
    const redisKey = makeRateLimiterKey(key);

    const isExpired = await redis.expire(redisKey, 0);

    return new Ok(isExpired);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

export async function getRateLimiterCount({
  key,
  timeframeSeconds,
}: {
  key: string;
  timeframeSeconds: number;
}): Promise<Result<number, Error>> {
  if (!Number.isInteger(timeframeSeconds) || timeframeSeconds <= 0) {
    return new Err(new Error("timeframeSeconds must be a positive integer."));
  }

  try {
    const redis = await getRedisStreamClient({ origin: "rate_limiter" });
    const redisKey = makeRateLimiterKey(key);

    const windowMs = timeframeSeconds * 1000;
    const trimBeforeMs = Date.now() - windowMs;

    const count = await redis.zCount(redisKey, trimBeforeMs, "+inf");

    return new Ok(count);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

export function getTimeframeSecondsFromLiteral(
  timeframeLiteral: MaxMessagesTimeframeType | MaxAwuCreditsTimeframeType
): number {
  switch (timeframeLiteral) {
    case "day":
      return 60 * 60 * 24; // 1 day.

    case "week":
      return 60 * 60 * 24 * 7; // 7 days.

    case "month":
    // Lifetime is intentionally mapped to a 30-day period.
    case "lifetime":
      return 60 * 60 * 24 * 30; // 30 days.

    default:
      assertNever(timeframeLiteral);
  }
}

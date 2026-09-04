import { getRedisStreamClient } from "@app/lib/api/redis";
import { roundCreditsToMicroCredits } from "@app/lib/credits/units";
import { statsDMetrics } from "@app/lib/utils/statsd";
import type {
  MaxAwuCreditsTimeframeType,
  MaxMessagesTimeframeType,
} from "@app/types/plan";
import type { LoggerInterface } from "@app/types/shared/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import chunk from "lodash/chunk";
import { v4 as uuidv4 } from "uuid";

export class RateLimitError extends Error {}

export const RATE_LIMITER_PREFIX = "rate_limiter";

// Grace period kept after the window boundary before the Redis key expires, so
// a read straddling the boundary still sees a just-closed window rather than a
// premature miss.
const FIXED_WINDOW_EXPIRE_GRACE_MS = 60_000;

const RATE_LIMITER_COUNTS_BATCH_SIZE = 300;

// A resolved fixed window: a stable label identifying the current window and
// the absolute UTC end of that window. The label is appended to the Redis key
// so each window is a distinct key that naturally expires; `windowEndMs` drives
// `PEXPIREAT`. Callers resolve these bounds however they like — pure calendar
// math or an external anchor such as a billing contract — keeping this counter
// agnostic of window semantics.
export type FixedWindowBounds = { label: string; windowEndMs: number };

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
    statsDMetrics.distribution(
      "ratelimiter.latency.distribution",
      totalTimeMs,
      tags
    );

    if (remaining <= 0) {
      statsDMetrics.increment("ratelimiter.exceeded.count", 1, tags);
    }

    return remaining;
  } catch (e) {
    statsDMetrics.increment("ratelimiter.error.count", 1, tags);
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

/**
 * Unconditionally records `incrementBy` AWU credits against `key`, with no limit guard.
 *
 * `incrementBy` is a (possibly fractional) credit amount: it is converted to integer microCredits
 * and stored as a single sorted-set entry carrying the amount (`<microCredits>:<uuid>`), summed on
 * read by `getWeightedRateLimiterCount`. Unlike `rateLimiter`, which drops the write entirely when
 * count + incrementBy would exceed the limit, this always persists the entry. Use this for post-hoc
 * recording of a cost that already happened (e.g. AWU credits for a message that already ran) —
 * enforcement must happen beforehand via `getWeightedRateLimiterCount` + a limit check, not by
 * relying on this function to gatekeep.
 */
export async function addRateLimiterCount({
  key,
  timeframeSeconds,
  incrementBy,
  logger,
}: {
  key: string;
  timeframeSeconds: number;
  incrementBy: number;
  logger: LoggerInterface;
}): Promise<void> {
  // Fail open on a non-positive/non-finite amount: recording runs on the
  // message-finalize path (including Temporal retries), so a bad increment must
  // never throw and break finalization — skip instead.
  if (!Number.isFinite(incrementBy) || incrementBy <= 0) {
    return;
  }
  if (!Number.isInteger(timeframeSeconds) || timeframeSeconds <= 0) {
    throw new Error("timeframeSeconds must be a positive integer.");
  }

  const microCredits = roundCreditsToMicroCredits(incrementBy);
  if (microCredits <= 0) {
    return;
  }

  const redisKey = makeRateLimiterKey(key);
  const windowMs = timeframeSeconds * 1000;

  const luaScript = `
    local key = KEYS[1]
    local window_ms = tonumber(ARGV[1])
    local member = ARGV[2]

    -- Use Redis server time to avoid client clock skew
    local t = redis.call('TIME') -- { seconds, microseconds }
    local now_ms = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)

    -- Always record unconditionally: no limit check, no dropped writes. A single
    -- entry carries the amount (microCredits prefix + uuid for uniqueness); the
    -- reader sums the prefixes via getWeightedRateLimiterCount.
    redis.call('ZADD', key, now_ms, member)

    -- Keep the key around a bit longer than the window to allow trims
    redis.call('PEXPIRE', key, window_ms + 60000)
  `;

  try {
    const redis = await getRedisStreamClient({ origin: "rate_limiter" });
    const member = `${microCredits}:${uuidv4()}`;
    await redis.eval(luaScript, {
      keys: [redisKey],
      arguments: [windowMs.toString(), member],
    });
  } catch (e) {
    statsDMetrics.increment("ratelimiter.error.count", 1, ["operation:add"]);
    logger.error({ key, incrementBy, error: e }, "addRateLimiterCount error");
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

export async function getRateLimiterCounts({
  keys,
  timeframeSeconds,
}: {
  keys: string[];
  timeframeSeconds: number;
}): Promise<Result<Map<string, number>, Error>> {
  if (!Number.isInteger(timeframeSeconds) || timeframeSeconds <= 0) {
    return new Err(new Error("timeframeSeconds must be a positive integer."));
  }
  if (keys.length === 0) {
    return new Ok(new Map());
  }

  try {
    const redis = await getRedisStreamClient({ origin: "rate_limiter" });
    const windowMs = timeframeSeconds * 1000;
    const trimBeforeMs = Date.now() - windowMs;

    const uniqueKeys = Array.from(new Set(keys));
    const countByKey = new Map<string, number>();
    for (const batchKeys of chunk(uniqueKeys, RATE_LIMITER_COUNTS_BATCH_SIZE)) {
      const pipeline = redis.multi();
      for (const key of batchKeys) {
        pipeline.zCount(makeRateLimiterKey(key), trimBeforeMs, "+inf");
      }
      const replies = await pipeline.exec();
      for (const [index, key] of batchKeys.entries()) {
        const reply = replies[index];
        if (typeof reply !== "number") {
          return new Err(
            new Error(`Non-numeric rate-limiter count reply for key ${key}.`)
          );
        }
        countByKey.set(key, reply);
      }
    }

    return new Ok(countByKey);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

// TODO: @jd 20260825 - Remove this once all legacy plans are gone
// (or if we get rid of the premium limit)
export async function getRateLimiterTimestamps({
  key,
  timeframeSeconds,
}: {
  key: string;
  timeframeSeconds: number;
}): Promise<Result<number[], Error>> {
  if (!Number.isInteger(timeframeSeconds) || timeframeSeconds <= 0) {
    return new Err(new Error("timeframeSeconds must be a positive integer."));
  }

  try {
    const redis = await getRedisStreamClient({ origin: "rate_limiter" });
    const redisKey = makeRateLimiterKey(key);
    const trimBeforeMs = Date.now() - timeframeSeconds * 1000;
    const entries = await redis.zRangeWithScores(
      redisKey,
      trimBeforeMs,
      "+inf",
      { BY: "SCORE" }
    );

    return new Ok(entries.map(({ score }) => score));
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

export type WeightedRateLimiterUsage = {
  count: number;
  oldestTimestampMs: number | null;
};

/**
 * Reads the weighted total (in microCredits) and oldest timestamp of the
 * amount-carrying entries written by `addRateLimiterCount`. Each entry is
 * `<microCredits>:<uuid>`, so unlike `getRateLimiterCount` (which counts rows),
 * this sums the amount prefix of every entry still inside the rolling window.
 * The scan runs server-side in Lua so only the aggregate and oldest timestamp
 * cross the wire. Malformed members are skipped from the total.
 */
export async function getWeightedRateLimiterUsage({
  key,
  timeframeSeconds,
}: {
  key: string;
  timeframeSeconds: number;
}): Promise<Result<WeightedRateLimiterUsage, Error>> {
  if (!Number.isInteger(timeframeSeconds) || timeframeSeconds <= 0) {
    return new Err(new Error("timeframeSeconds must be a positive integer."));
  }

  const redisKey = makeRateLimiterKey(key);
  const windowMs = timeframeSeconds * 1000;

  const luaScript = `
    local key = KEYS[1]
    local window_ms = tonumber(ARGV[1])

    -- Use Redis server time to avoid client clock skew (matches the writer).
    local t = redis.call('TIME') -- { seconds, microseconds }
    local now_ms = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
    local trim_before = now_ms - window_ms

    -- Sum the '<microCredits>:<uuid>' amount prefixes of the entries still
    -- inside the window, server-side, so only the total crosses the wire.
    local entries = redis.call('ZRANGEBYSCORE', key, trim_before, '+inf', 'WITHSCORES')
    local total = 0
    local oldest_timestamp_ms = -1
    for i = 1, #entries, 2 do
      local member = entries[i]
      local score = tonumber(entries[i + 1])
      local sep = string.find(member, ':', 1, true)
      if sep then
        local amount = tonumber(string.sub(member, 1, sep - 1))
        if amount then
          if oldest_timestamp_ms == -1 and score then
            oldest_timestamp_ms = score
          end
          total = total + amount
        end
      end
    end
    return { total, oldest_timestamp_ms }
  `;

  try {
    const redis = await getRedisStreamClient({ origin: "rate_limiter" });
    const [count, oldestTimestampMs] = (await redis.eval(luaScript, {
      keys: [redisKey],
      arguments: [windowMs.toString()],
    })) as [number, number];

    return new Ok({
      count,
      oldestTimestampMs: oldestTimestampMs === -1 ? null : oldestTimestampMs,
    });
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

export async function getWeightedRateLimiterCount({
  key,
  timeframeSeconds,
}: {
  key: string;
  timeframeSeconds: number;
}): Promise<Result<number, Error>> {
  const result = await getWeightedRateLimiterUsage({ key, timeframeSeconds });
  if (result.isErr()) {
    return result;
  }
  return new Ok(result.value.count);
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

/**
 * Unconditionally records `incrementBy` units against a fixed-window counter
 * identified by `bounds`. Unlike the rolling `addRateLimiterCount`, the key
 * encodes the current window (via `bounds.label`) and is a plain `INCRBY` with
 * `PEXPIREAT` set to `bounds.windowEndMs` — enforcement (reading the count and
 * comparing to a limit) happens beforehand via `getFixedWindowCount`, not here.
 */
export async function addFixedWindowCount({
  key,
  bounds,
  incrementBy,
  logger,
}: {
  key: string;
  bounds: FixedWindowBounds;
  incrementBy: number;
  logger: LoggerInterface;
}): Promise<void> {
  // Fail open on invalid input, matching the Redis-error path below: recording
  // runs on the message-send path, so a bad increment must never throw and
  // break the send — log and skip instead.
  if (!Number.isInteger(incrementBy) || incrementBy <= 0) {
    statsDMetrics.increment("ratelimiter.error.count", 1, [
      "operation:add_fixed_window",
    ]);
    logger.error(
      { key, label: bounds.label, incrementBy },
      "addFixedWindowCount: incrementBy must be a positive integer, skipping"
    );
    return;
  }

  const redisKey = makeRateLimiterKey(`${key}:${bounds.label}`);
  const expireAtMs = bounds.windowEndMs + FIXED_WINDOW_EXPIRE_GRACE_MS;

  const luaScript = `
    local key = KEYS[1]
    local increment_by = tonumber(ARGV[1])
    local expire_at_ms = tonumber(ARGV[2])

    local total = redis.call('INCRBY', key, increment_by)
    redis.call('PEXPIREAT', key, expire_at_ms)
    return total
  `;

  try {
    const redis = await getRedisStreamClient({ origin: "rate_limiter" });
    await redis.eval(luaScript, {
      keys: [redisKey],
      arguments: [incrementBy.toString(), expireAtMs.toString()],
    });
  } catch (e) {
    statsDMetrics.increment("ratelimiter.error.count", 1, [
      "operation:add_fixed_window",
    ]);
    logger.error(
      { key, label: bounds.label, incrementBy, error: e },
      "addFixedWindowCount error"
    );
  }
}

/**
 * Overwrites the fixed-window counter for `key` in the window identified by
 * `bounds` with an absolute `value` (SET, not INCRBY). Use for backfill /
 * resync from an external source of truth — regular accounting should use
 * `addFixedWindowCount`. Returns a Result so callers can report failures.
 */
export async function setFixedWindowCount({
  key,
  bounds,
  value,
  logger,
}: {
  key: string;
  bounds: FixedWindowBounds;
  value: number;
  logger: LoggerInterface;
}): Promise<Result<void, Error>> {
  if (!Number.isInteger(value) || value < 0) {
    return new Err(new Error("value must be a non-negative integer."));
  }

  const redisKey = makeRateLimiterKey(`${key}:${bounds.label}`);
  const expireAtMs = bounds.windowEndMs + FIXED_WINDOW_EXPIRE_GRACE_MS;

  const luaScript = `
    local key = KEYS[1]
    local value = tonumber(ARGV[1])
    local expire_at_ms = tonumber(ARGV[2])

    redis.call('SET', key, value)
    redis.call('PEXPIREAT', key, expire_at_ms)
  `;

  try {
    const redis = await getRedisStreamClient({ origin: "rate_limiter" });
    await redis.eval(luaScript, {
      keys: [redisKey],
      arguments: [value.toString(), expireAtMs.toString()],
    });
    return new Ok(undefined);
  } catch (e) {
    statsDMetrics.increment("ratelimiter.error.count", 1, [
      "operation:set_fixed_window",
    ]);
    logger.error(
      { key, label: bounds.label, value, error: e },
      "setFixedWindowCount error"
    );
    return new Err(normalizeError(e));
  }
}

/**
 * Atomically seeds the fixed-window counter for `key` in the window identified
 * by `bounds` to `value`, but only if it does not already exist, and returns the
 * effective count afterwards (the seeded `value`, or the current value when a
 * concurrent `addFixedWindowCount` already created it).
 *
 * Unlike `setFixedWindowCount`, this never overwrites a live counter: use it for
 * lazy backfill on a read miss, where an `addFixedWindowCount` (INCRBY) landing
 * while the seed value is being computed must not be clobbered (which would
 * undercount usage). Returns a Result so callers can fall back on failure.
 */
export async function seedFixedWindowCountIfAbsent({
  key,
  bounds,
  value,
  logger,
}: {
  key: string;
  bounds: FixedWindowBounds;
  value: number;
  logger: LoggerInterface;
}): Promise<Result<number, Error>> {
  if (!Number.isInteger(value) || value < 0) {
    return new Err(new Error("value must be a non-negative integer."));
  }

  const redisKey = makeRateLimiterKey(`${key}:${bounds.label}`);
  const expireAtMs = bounds.windowEndMs + FIXED_WINDOW_EXPIRE_GRACE_MS;

  // Seed-if-absent + read-back in one atomic step: SET NX only writes (and sets
  // the expiry) when the key is missing, otherwise the concurrently-written
  // value is read back untouched. Returns the effective count either way.
  const luaScript = `
    local key = KEYS[1]
    local value = tonumber(ARGV[1])
    local expire_at_ms = tonumber(ARGV[2])

    local seeded = redis.call('SET', key, value, 'NX')
    if seeded then
      redis.call('PEXPIREAT', key, expire_at_ms)
      return value
    end

    return redis.call('GET', key)
  `;

  try {
    const redis = await getRedisStreamClient({ origin: "rate_limiter" });
    const effective = await redis.eval(luaScript, {
      keys: [redisKey],
      arguments: [value.toString(), expireAtMs.toString()],
    });
    // A well-formed counter is always a non-negative integer. Guard against a
    // nil/malformed reply rather than letting `Number(null)` collapse to a
    // silent 0.
    if (effective === null || effective === undefined) {
      return new Err(new Error("Empty fixed-window count reply."));
    }
    const count = Number(effective);
    if (!Number.isSafeInteger(count) || count < 0) {
      return new Err(
        new Error(`Non-integer fixed-window count: ${String(effective)}`)
      );
    }
    return new Ok(count);
  } catch (e) {
    statsDMetrics.increment("ratelimiter.error.count", 1, [
      "operation:seed_fixed_window",
    ]);
    logger.error(
      { key, label: bounds.label, value, error: e },
      "seedFixedWindowCountIfAbsent error"
    );
    return new Err(normalizeError(e));
  }
}

/**
 * Reads a fixed-window counter, lazily seeding it from `fetchSeedValue` on a
 * read miss (count 0). Shared by the spend-cap backups so their read/seed flow
 * stays in one place (`getFixedWindowCount` → return if positive → fetch seed →
 * `seedFixedWindowCountIfAbsent` → effective count).
 *
 * Returns the effective count, or `null` when the Redis read errored (callers
 * fail open). A `null` from `fetchSeedValue` (the seed source couldn't be
 * determined — e.g. an Elasticsearch outage) is treated as "nothing to seed"
 * and yields 0, so the counter is never overwritten from a failed read.
 */
export async function readFixedWindowCountWithLazySeed({
  key,
  bounds,
  fetchSeedValue,
  logger,
}: {
  key: string;
  bounds: FixedWindowBounds;
  fetchSeedValue: () => Promise<number | null>;
  logger: LoggerInterface;
}): Promise<number | null> {
  const countResult = await getFixedWindowCount({ key, bounds });
  if (countResult.isErr()) {
    return null;
  }
  if (countResult.value > 0) {
    return countResult.value;
  }

  const seedValue = await fetchSeedValue();
  if (seedValue === null || seedValue <= 0) {
    return 0;
  }
  const seedResult = await seedFixedWindowCountIfAbsent({
    key,
    bounds,
    value: seedValue,
    logger,
  });
  return seedResult.isOk() ? seedResult.value : seedValue;
}

/**
 * Reads the current fixed-window count for `key` in the window identified by
 * `bounds`. Returns 0 when the window has no entries yet. Mirrors
 * `getRateLimiterCount` but for the boundary-bucketed counter written by
 * `addFixedWindowCount`.
 */
export async function getFixedWindowCount({
  key,
  bounds,
}: {
  key: string;
  bounds: FixedWindowBounds;
}): Promise<Result<number, Error>> {
  try {
    const redis = await getRedisStreamClient({ origin: "rate_limiter" });
    const redisKey = makeRateLimiterKey(`${key}:${bounds.label}`);

    const raw = await redis.get(redisKey);
    const count = raw === null ? 0 : Number(raw);

    if (!Number.isFinite(count)) {
      return new Err(new Error(`Non-numeric fixed-window count: ${raw}`));
    }

    return new Ok(count);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

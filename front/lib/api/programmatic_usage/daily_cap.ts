import { searchAnalytics } from "@app/lib/api/elasticsearch";
import type { UsageAggregations } from "@app/lib/api/programmatic_usage/common";
import {
  getSecondsUntilMidnightUTC,
  getShouldTrackTokenUsageCostsESFilter,
  MARKUP_MULTIPLIER,
} from "@app/lib/api/programmatic_usage/common";
import { runOnRedis } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { executeWithLock } from "@app/lib/lock";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { estypes } from "@elastic/elasticsearch";

// $1,000 in microUSD - default daily cap for non-PAYG workspaces, also used as
// minimum daily cap for PAYG workspaces
const DEFAULT_DAILY_CAP_MICRO_USD = 1_000_000_000;

// 20% of PAYG cap - fraction used to compute default daily cap for PAYG
const PAYG_DAILY_CAP_FRACTION = 0.2;

const DAILY_USAGE_REDIS_ORIGIN = "daily_usage_tracking" as const;
const getDailyUsageRedisKey = (workspaceId: string) =>
  `workspace-daily-usage:${workspaceId}`;

/**
 * Get the default daily cap based on PAYG status.
 * - Non-PAYG: $1,000/day
 * - PAYG: max($1,000, 20% of PAYG cap)/day
 */
export async function getDefaultDailyCapMicroUsd(
  auth: Authenticator
): Promise<number> {
  const config =
    await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);

  const paygCapMicroUsd = config?.paygCapMicroUsd ?? null;

  if (paygCapMicroUsd === null) {
    return DEFAULT_DAILY_CAP_MICRO_USD;
  }

  const fractionOfPaygCap = Math.floor(
    paygCapMicroUsd * PAYG_DAILY_CAP_FRACTION
  );
  return Math.max(DEFAULT_DAILY_CAP_MICRO_USD, fractionOfPaygCap);
}

/**
 * Get the effective daily cap (configured or default).
 */
export async function getEffectiveDailyCapMicroUsd(
  auth: Authenticator
): Promise<number> {
  const config =
    await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);

  if (
    config?.dailyCapMicroUsd !== null &&
    config?.dailyCapMicroUsd !== undefined
  ) {
    return config.dailyCapMicroUsd;
  }

  return getDefaultDailyCapMicroUsd(auth);
}

/**
 * Get today's usage from Elasticsearch (used to initialize Redis).
 * Today is defined as UTC day.
 * Returns cost WITH markup applied to match Redis increments.
 */
async function getTodayUsageFromESMicroUsd(
  auth: Authenticator
): Promise<Result<number, Error>> {
  const now = new Date();
  const todayStartMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0
  );

  const baseFilter = getShouldTrackTokenUsageCostsESFilter(auth);

  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [baseFilter, { range: { timestamp: { gte: todayStartMs } } }],
    },
  };

  const result = await searchAnalytics<never, UsageAggregations>(query, {
    aggregations: {
      total_cost: { sum: { field: "tokens.cost_micro_usd" } },
    },
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(`ES query failed: ${result.error.message}`));
  }

  // ES stores raw cost; apply markup to match Redis increments
  const rawCost = result.value.aggregations?.total_cost?.value ?? 0;
  const costWithMarkup = Math.round(rawCost * MARKUP_MULTIPLIER);
  return new Ok(costWithMarkup);
}

/**
 * Get daily usage from Redis cache, initializing from ES if missing.
 * Uses locking to prevent multiple concurrent ES queries on cache miss.
 * Fails close: returns Err on Redis/ES errors to block API calls.
 */
async function getDailyUsageMicroUsd(
  auth: Authenticator
): Promise<Result<number, Error>> {
  const workspace = auth.getNonNullableWorkspace();
  const redisKey = getDailyUsageRedisKey(workspace.sId);

  let redis;
  try {
    redis = await runOnRedis(
      { origin: DAILY_USAGE_REDIS_ORIGIN },
      async (client) => client
    );
  } catch (err) {
    return new Err(normalizeError(err));
  }

  let cached;
  try {
    cached = await redis.get(redisKey);
  } catch (err) {
    return new Err(normalizeError(err));
  }

  if (cached !== null) {
    return new Ok(parseInt(cached, 10));
  }

  // Cache miss - use lock to prevent multiple concurrent ES queries
  const lockKey = `daily-usage-init:${workspace.sId}`;
  try {
    await executeWithLock(
      lockKey,
      async () => {
        // Double-check cache after acquiring lock (another request may have populated it)
        const cachedAfterLock = await redis.get(redisKey);
        if (cachedAfterLock !== null) {
          return;
        }

        const usageResult = await getTodayUsageFromESMicroUsd(auth);
        if (usageResult.isErr()) {
          throw usageResult.error;
        }

        const ttlSeconds = getSecondsUntilMidnightUTC();
        await redis.set(redisKey, usageResult.value.toString(), {
          EX: ttlSeconds,
        });
      },
      10_000 // 10s timeout for lock acquisition
    );
  } catch (err) {
    return new Err(normalizeError(err));
  }

  // Read the value that was just set (or was set by another request)
  let finalCached;
  try {
    finalCached = await redis.get(redisKey);
  } catch (err) {
    return new Err(normalizeError(err));
  }

  if (finalCached === null) {
    return new Err(
      new Error("Failed to read daily usage after initialization")
    );
  }

  return new Ok(parseInt(finalCached, 10));
}

/**
 * Increment daily usage counter after programmatic cost is tracked.
 */
export async function incrementDailyUsageMicroUsd(
  workspaceId: string,
  amountMicroUsd: number
): Promise<void> {
  if (amountMicroUsd <= 0) {
    return;
  }

  try {
    await runOnRedis({ origin: DAILY_USAGE_REDIS_ORIGIN }, async (redis) => {
      const key = getDailyUsageRedisKey(workspaceId);
      const exists = await redis.exists(key);
      if (exists) {
        await redis.incrBy(key, amountMicroUsd);
      }
      // If key does not exist, skip increment.
      // This can happen if the key expired at midnight UTC while processing.
      // The usage will be picked up on the next cap check via ES.
    });
  } catch (err) {
    // Fail silently: Redis unavailable should not block the API call
    logger.error(
      {
        workspaceId,
        amountMicroUsd,
        error: err,
      },
      "[Daily Cap Tracking] Failed to increment daily usage in Redis"
    );
  }
}

/**
 * Check if a workspace has reached its daily usage cap.
 * Returns true if:
 * - usage >= cap
 * - Redis/ES query fails (fail close)
 */
export async function hasReachedDailyUsageCap(
  auth: Authenticator
): Promise<boolean> {
  const workspace = auth.getNonNullableWorkspace();
  const cap = await getEffectiveDailyCapMicroUsd(auth);

  const usageResult = await getDailyUsageMicroUsd(auth);

  if (usageResult.isErr()) {
    logger.error(
      {
        workspaceId: workspace.sId,
        error: usageResult.error.message,
      },
      "[Daily Cap Tracking] Failed to get daily usage, failing close"
    );
    return true;
  }

  const usage = usageResult.value;
  const hasReached = usage >= cap;

  if (hasReached) {
    logger.info(
      {
        workspaceId: workspace.sId,
        usageMicroUsd: usage,
        capMicroUsd: cap,
      },
      "[Daily Cap Tracking] Workspace has reached daily usage cap"
    );
  }

  return hasReached;
}

/**
 * Get the remaining daily cap in microUsd for a workspace.
 * Returns max(0, cap - usage).
 * Returns 0 on Redis/ES errors (fail close).
 */
export async function getRemainingDailyCapMicroUsd(
  auth: Authenticator
): Promise<number> {
  const cap = await getEffectiveDailyCapMicroUsd(auth);
  const usageResult = await getDailyUsageMicroUsd(auth);

  if (usageResult.isErr()) {
    const workspace = auth.getNonNullableWorkspace();
    logger.error(
      {
        workspaceId: workspace.sId,
        error: usageResult.error.message,
      },
      "[Daily Cap Tracking] Failed to get daily usage for remaining cap, failing close"
    );
    return 0;
  }

  return Math.max(0, cap - usageResult.value);
}

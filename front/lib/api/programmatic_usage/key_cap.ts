import { searchAnalytics } from "@app/lib/api/elasticsearch";
import type { UsageAggregations } from "@app/lib/api/programmatic_usage/common";
import {
  getSecondsUntilMidnightUTC,
  MARKUP_MULTIPLIER,
} from "@app/lib/api/programmatic_usage/common";
import { runOnRedis } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { KeyResource } from "@app/lib/resources/key_resource";
import { cacheWithRedis, invalidateCacheWithRedis } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import type { estypes } from "@elastic/elasticsearch";

const KEY_CAP_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchKeyMonthlyCap({
  workspace,
  keyId,
}: {
  workspace: LightWorkspaceType;
  keyId: ModelId;
}): Promise<number | null> {
  const key = await KeyResource.fetchByWorkspaceAndId({ workspace, id: keyId });

  if (!key) {
    return null;
  }

  return key.monthlyCapMicroUsd;
}

export const keyCapCacheResolver = ({ keyId }: { keyId: ModelId }) =>
  `key-cap:${keyId}`;

/**
 * Get the monthly cap for a key, with Redis caching.
 * Returns null if the key has no cap (unlimited) or doesn't exist.
 */
export const getKeyMonthlyCapCached = cacheWithRedis(
  fetchKeyMonthlyCap,
  keyCapCacheResolver,
  { ttlMs: KEY_CAP_CACHE_TTL_MS }
);

/**
 * Invalidate the Redis cache for a key's monthly cap.
 * Should be called when updating the cap via the API.
 */
export const invalidateKeyCapCache = invalidateCacheWithRedis(
  fetchKeyMonthlyCap,
  keyCapCacheResolver
);

/**
 * Get the total usage in microUsd for a key over the last 29 days.
 * Queries Elasticsearch for messages with this key's name.
 * Today's usage is tracked via Redis increments, so we only fetch 29 days.
 */
async function getLast29DaysKeyUsageMicroUsd(
  keyId: ModelId,
  workspace: LightWorkspaceType
): Promise<Result<number, Error>> {
  const key = await KeyResource.fetchByWorkspaceAndId({ workspace, id: keyId });

  if (!key || !key.name) {
    return new Ok(0);
  }

  const twentyNineDaysAgoMs = Date.now() - 29 * 24 * 60 * 60 * 1000;

  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        { term: { api_key_name: key.name } },
        { term: { workspace_id: workspace.sId } },
        { range: { timestamp: { gte: twentyNineDaysAgoMs } } },
        { terms: { status: AGENT_MESSAGE_STATUSES_TO_TRACK } },
      ],
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

// Per-key usage tracking uses a hybrid Redis + ES approach:
// - Redis holds real-time usage counter, incremented after each agentic loop
// - ES is queried only once per day (at cache miss) for the previous 29 days
// - Redis keys expire at midnight UTC, triggering a fresh ES sync daily
const KEY_USAGE_REDIS_ORIGIN = "key_usage_tracking";
const getKeyUsageRedisKey = (keyId: ModelId) => `key-usage:${keyId}`;

/**
 * Get usage from Redis cache, initializing from ES if missing.
 * Fails close: returns Err on Redis/ES errors to block API calls.
 */
async function getKeyUsageMicroUsd({
  workspace,
  keyId,
}: {
  workspace: LightWorkspaceType;
  keyId: ModelId;
}): Promise<Result<number, Error>> {
  const redisKey = getKeyUsageRedisKey(keyId);

  const redis = await runOnRedis(
    { origin: KEY_USAGE_REDIS_ORIGIN },
    async (client) => client
  );

  const cached = await redis.get(redisKey);
  if (cached !== null) {
    return new Ok(parseInt(cached, 10));
  }

  const usageResult = await getLast29DaysKeyUsageMicroUsd(keyId, workspace);
  if (usageResult.isErr()) {
    return usageResult;
  }

  const ttlSeconds = getSecondsUntilMidnightUTC();
  await redis.set(redisKey, usageResult.value.toString(), { EX: ttlSeconds });

  return new Ok(usageResult.value);
}

/**
 * Increment usage counter after agentic loop completes.
 */
export async function incrementRedisKeyUsageMicroUsd(
  keyId: ModelId,
  amountMicroUsd: number
): Promise<void> {
  if (amountMicroUsd <= 0) {
    return;
  }

  try {
    await runOnRedis({ origin: KEY_USAGE_REDIS_ORIGIN }, async (redis) => {
      const key = getKeyUsageRedisKey(keyId);
      const exists = await redis.exists(key);
      if (exists) {
        await redis.incrBy(key, amountMicroUsd);
      } else {
        // Key does not exist in redis, skip increment
        // This can happen if the key was reset at midnight UTC
        // while the agentic loop was running. In this case,
        // the usage will be picked up on the next cap check via ES.
      }
    });
  } catch (err) {
    // Fail silently: Redis unavailable should not block the API call
    logger.error(
      {
        keyId,
        amountMicroUsd,
        error: err,
      },
      "[Key Cap Tracking] Failed to increment key usage in Redis"
    );
  }
}

/**
 * Check if a key has reached its monthly usage cap.
 * Returns false if:
 * - No key is present in the authenticator
 * - The key has no cap (unlimited)
 *
 * Returns true if:
 * - usage >= cap
 * - Redis/ES query fails (fail close)
 */
export async function hasKeyReachedUsageCap(
  auth: Authenticator
): Promise<boolean> {
  const keyAuth = auth.key();

  if (!keyAuth) {
    return false;
  }

  const workspace = auth.getNonNullableWorkspace();
  const cap = await getKeyMonthlyCapCached({
    workspace,
    keyId: keyAuth.id,
  });

  if (cap === null) {
    return false;
  }

  const usageResult = await getKeyUsageMicroUsd({
    workspace,
    keyId: keyAuth.id,
  });

  if (usageResult.isErr()) {
    logger.error(
      {
        keyId: keyAuth.id,
        error: usageResult.error.message,
      },
      "[Key Cap Tracking] Failed to get key usage, failing close"
    );
    return true;
  }

  const usage = usageResult.value;
  const hasReached = usage >= cap;

  if (hasReached) {
    logger.info(
      {
        keyId: keyAuth.id,
        keyName: keyAuth.name,
        usageMicroUsd: usage,
        capMicroUsd: cap,
      },
      "[Key Cap Tracking] Key has reached usage cap"
    );
  }

  return hasReached;
}

/**
 * Get the remaining cap in microUsd for a key.
 * Returns null if the key has no cap (unlimited).
 * Returns max(0, cap - usage) if the key has a cap.
 * Returns 0 on Redis/ES errors (fail close).
 */
export async function getRemainingKeyCapMicroUsd(
  auth: Authenticator
): Promise<number | null> {
  const keyAuth = auth.key();

  if (!keyAuth) {
    return null;
  }

  const workspace = auth.getNonNullableWorkspace();
  const cap = await getKeyMonthlyCapCached({ workspace, keyId: keyAuth.id });

  if (cap === null) {
    return null;
  }

  const usageResult = await getKeyUsageMicroUsd({
    workspace,
    keyId: keyAuth.id,
  });

  if (usageResult.isErr()) {
    logger.error(
      {
        keyId: keyAuth.id,
        error: usageResult.error.message,
      },
      "[Key Cap Tracking] Failed to get key usage for remaining cap, failing close"
    );
    return 0;
  }

  return Math.max(0, cap - usageResult.value);
}

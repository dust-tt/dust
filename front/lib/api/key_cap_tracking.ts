import type { estypes } from "@elastic/elasticsearch";

import { searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { KeyResource } from "@app/lib/resources/key_resource";
import {
  cacheWithRedis,
  invalidateCacheWithRedis,
} from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import type { ModelId } from "@app/types";

import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "./programmatic_usage_tracking";

const KEY_CAP_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchKeyMonthlyCap(keyId: ModelId): Promise<number | null> {
  const key = await KeyResource.fetchByModelId(keyId);

  if (!key) {
    return null;
  }

  return key.monthlyCapMicroUsd;
}

const keyCapCacheResolver = (keyId: ModelId) => `key-cap:${keyId}`;

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

type UsageAggregations = {
  total_cost?: estypes.AggregationsSumAggregate;
};

/**
 * Get the total usage in microUsd for a key over the last 30 days.
 * Queries Elasticsearch for messages with this key's name.
 * Fails open (returns 0) on ES errors to avoid blocking API calls.
 */
export async function getLast30DaysKeyUsageMicroUsd(
  keyId: ModelId
): Promise<number> {
  // Get the key name for ES query
  const key = await KeyResource.fetchByModelId(keyId);

  if (!key || !key.name) {
    // Key not found or has no name - can't query ES
    return 0;
  }

  const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        { term: { api_key_name: key.name } },
        { range: { timestamp: { gte: thirtyDaysAgoMs } } },
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
    // Fail open: log the error but don't block API calls
    logger.error(
      {
        keyId,
        error: result.error.message,
      },
      "[Key Cap Tracking] Failed to query ES for key usage, failing open"
    );
    return 0;
  }

  const totalCost = result.value.aggregations?.total_cost?.value ?? 0;
  return Math.round(totalCost);
}

/**
 * Check if a key has reached its monthly usage cap.
 * Returns false if:
 * - No key is present in the authenticator
 * - The key has no cap (unlimited)
 * - ES query fails (fail open)
 *
 * Returns true if usage >= cap.
 */
export async function hasKeyReachedUsageCap(
  auth: Authenticator
): Promise<boolean> {
  const keyAuth = auth.key();

  if (!keyAuth) {
    return false;
  }

  const cap = await getKeyMonthlyCapCached(keyAuth.id);

  if (cap === null) {
    // No cap set (unlimited)
    statsDClient.increment("api_key.cap.check", 1, [
      `result:no_cap`,
      `key_id:${keyAuth.id}`,
    ]);
    return false;
  }

  const usage = await getLast30DaysKeyUsageMicroUsd(keyAuth.id);
  const hasReached = usage >= cap;

  statsDClient.increment("api_key.cap.check", 1, [
    `result:${hasReached ? "reached" : "under_cap"}`,
    `key_id:${keyAuth.id}`,
  ]);

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
 */
export async function getRemainingKeyCapMicroUsd(
  auth: Authenticator
): Promise<number | null> {
  const keyAuth = auth.key();

  if (!keyAuth) {
    return null;
  }

  const cap = await getKeyMonthlyCapCached(keyAuth.id);

  if (cap === null) {
    // No cap set (unlimited)
    return null;
  }

  const usage = await getLast30DaysKeyUsageMicroUsd(keyAuth.id);
  return Math.max(0, cap - usage);
}

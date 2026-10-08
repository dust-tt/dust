import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import type { UsageAggregations } from "@app/lib/api/programmatic_usage/common";
import {
  getSecondsUntilMidnightUTC,
  MARKUP_MULTIPLIER,
} from "@app/lib/api/programmatic_usage/common";
import { runOnRedis } from "@app/lib/api/redis";
import { USAGE_TYPE_PROGRAMMATIC } from "@app/lib/metronome/constants";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import type { estypes } from "@elastic/elasticsearch";

/**
 * Get the total usage in microUsd for a key over the last 29 days.
 * Queries Elasticsearch for messages with this key's name.
 * Today's usage is tracked via Redis increments, so we only fetch 29 days.
 */
async function getLast29DaysKeyUsageMicroUsd({
  workspace,
  keyName,
}: {
  workspace: LightWorkspaceType;
  keyName: string;
}): Promise<Result<number, Error>> {
  if (!keyName) {
    return new Ok(0);
  }

  const twentyNineDaysAgoMs = Date.now() - 29 * 24 * 60 * 60 * 1000;

  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        { term: { api_key_name: keyName } },
        { term: { workspace_id: workspace.sId } },
        { range: { completed_at: { gte: twentyNineDaysAgoMs } } },
        { term: { usage_type: USAGE_TYPE_PROGRAMMATIC } },
      ],
    },
  };

  const result = await searchConsumptionAnalytics<never, UsageAggregations>(
    query,
    {
      aggregations: {
        total_cost: { sum: { field: "micro_usd" } },
      },
      size: 0,
    }
  );

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

export type UsageTrackedKey = { id: ModelId; name: string };

/**
 * Get usage from Redis cache, initializing from ES if missing.
 * Fails close: returns Err on Redis/ES errors to block API calls.
 */
export async function getKeyUsageMicroUsd({
  workspace,
  key,
}: {
  workspace: LightWorkspaceType;
  key: UsageTrackedKey;
}): Promise<Result<number, Error>> {
  const redisKey = getKeyUsageRedisKey(key.id);

  const redis = await runOnRedis(
    { origin: KEY_USAGE_REDIS_ORIGIN },
    async (client) => client
  );

  let cached: string | null;
  try {
    cached = await redis.get(redisKey);
  } catch (err) {
    return new Err(normalizeError(err));
  }
  if (cached !== null) {
    return new Ok(parseInt(cached, 10));
  }

  const usageResult = await getLast29DaysKeyUsageMicroUsd({
    workspace,
    keyName: key.name,
  });
  if (usageResult.isErr()) {
    return usageResult;
  }

  const ttlSeconds = getSecondsUntilMidnightUTC();
  try {
    await redis.set(redisKey, usageResult.value.toString(), {
      EX: ttlSeconds,
    });
  } catch (err) {
    return new Err(normalizeError(err));
  }

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

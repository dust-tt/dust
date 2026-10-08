import { getKeyUsageMicroUsd } from "@app/lib/api/programmatic_usage/key_usage";
import type { Authenticator } from "@app/lib/auth";
import { KeyResource } from "@app/lib/resources/key_resource";
import { cacheWithRedis, invalidateCacheWithRedis } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";

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

const keyCapCacheResolver = ({ keyId }: { keyId: ModelId }) =>
  `key-cap:${keyId}`;

/**
 * Get the monthly cap for a key, with Redis caching.
 * Returns null if the key has no cap (unlimited) or doesn't exist.
 */
const getKeyMonthlyCapCached = cacheWithRedis(
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
  const keyAuth = auth.keyForUsageAttribution();

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
    keyName: keyAuth.name,
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
  const keyAuth = auth.keyForUsageAttribution();

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
    keyName: keyAuth.name,
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

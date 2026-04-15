import { getMetronomeClient } from "@app/lib/metronome/client";
import { getProductAiUsageUserId } from "@app/lib/metronome/constants";
import { cacheWithRedis, invalidateCacheWithRedis } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type { ContractV2 } from "@metronome/sdk/resources";

// No TTL — active contract only changes when a contract starts/ends.
// Invalidated explicitly via invalidateContractCache on contract.start/end webhooks.
// Null values are NOT cached: when no contract is found we want a fresh fetch next time.

/**
 * Fetch the active Metronome contract for a workspace.
 * Returns null (uncached) when no contract exists or when the API call fails.
 */
async function fetchActiveContract(
  workspaceId: string,
  metronomeCustomerId: string
): Promise<ContractV2 | null> {
  try {
    const client = getMetronomeClient();
    const response = await client.v2.contracts.list({
      customer_id: metronomeCustomerId,
    });

    if (response.data.length === 0) {
      return null;
    }

    logger.info(
      { workspaceId, metronomeCustomerId },
      "[Metronome Contract] Active contract fetched"
    );

    return response.data[0];
  } catch (err) {
    logger.warn(
      { workspaceId, metronomeCustomerId, err },
      "[Metronome Contract] Failed to fetch — treating as legacy (fail-open)"
    );
    return null;
  }
}

const getCachedActiveContract = cacheWithRedis(
  fetchActiveContract,
  (workspaceId) => workspaceId,
  { cacheNullValues: false }
);

/**
 * Returns the active Metronome contract for a workspace.
 * Returns null when no contract exists, Redis is unavailable, or the fetch fails.
 */
export async function getActiveContract(
  workspaceId: string,
  metronomeCustomerId: string
): Promise<ContractV2 | null> {
  return await getCachedActiveContract(workspaceId, metronomeCustomerId);
}

/**
 * Returns true if the workspace is on a legacy Metronome plan.
 * Legacy plans are billed by seat and do not enforce AWU credit limits.
 * Fails open (returns true) when the plan cannot be determined.
 */
export async function isLegacyPlan(
  workspaceId: string,
  metronomeCustomerId: string
): Promise<boolean> {
  const contract = await getActiveContract(workspaceId, metronomeCustomerId);
  if (!contract) {
    return true;
  }
  const subscriptions = contract.subscriptions ?? [];
  const aiUsageUserId = getProductAiUsageUserId();
  return !subscriptions.some(
    (s) => s.subscription_rate.product.id === aiUsageUserId
  );
}

/**
 * Invalidate the cached contract for a workspace.
 * Call this whenever a customer's contract is changed (e.g. plan upgrade/migration).
 */
export const invalidateContractCache = invalidateCacheWithRedis(
  fetchActiveContract,
  (workspaceId: string) => workspaceId
);

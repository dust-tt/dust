import { getMetronomeClient } from "@app/lib/metronome/client";
import { getProductAiUsageUserId } from "@app/lib/metronome/constants";
import { cacheWithRedis, invalidateCacheWithRedis } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type { ContractV2 } from "@metronome/sdk/resources";

// No TTL — contracts only change when a contract starts/ends.
// Invalidated explicitly via invalidateContractCache on contract.start/end webhooks.
// Null values are NOT cached: when no contract is found we want a fresh fetch next time.

/**
 * Fetch a Metronome contract.
 * When contractId is provided, fetches that specific contract via retrieve (cached by contractId).
 * Otherwise, lists all contracts and returns the first one (cached by metronomeCustomerId).
 * Returns null (uncached) when no contract exists or when the API call fails.
 */
async function fetchActiveContract(
  metronomeCustomerId: string,
  contractId?: string
): Promise<ContractV2 | null> {
  try {
    const client = getMetronomeClient();

    if (contractId) {
      const response = await client.v2.contracts.retrieve({
        customer_id: metronomeCustomerId,
        contract_id: contractId,
      });

      logger.info(
        { metronomeCustomerId, contractId },
        "[Metronome Contract] Contract fetched by ID"
      );

      return response.data ?? null;
    }

    const response = await client.v2.contracts.list({
      customer_id: metronomeCustomerId,
    });

    if (response.data.length === 0) {
      return null;
    }

    logger.info(
      { metronomeCustomerId },
      "[Metronome Contract] Active contract fetched"
    );

    return response.data[0];
  } catch (err) {
    logger.warn(
      { metronomeCustomerId, contractId, err },
      "[Metronome Contract] Failed to fetch — treating as legacy (fail-open)"
    );
    return null;
  }
}

const getCachedActiveContract = cacheWithRedis(
  fetchActiveContract,
  (metronomeCustomerId, contractId) => contractId ?? metronomeCustomerId,
  { cacheNullValues: false }
);

/**
 * Returns a Metronome contract.
 * When contractId is provided, fetches that specific contract (cached by contractId).
 * Otherwise, returns the first active contract (cached by metronomeCustomerId).
 * Returns null when not found, Redis is unavailable, or the fetch fails.
 */
export async function getActiveContract(
  metronomeCustomerId: string,
  contractId?: string
): Promise<ContractV2 | null> {
  return await getCachedActiveContract(metronomeCustomerId, contractId);
}

/**
 * Returns true if the workspace is on a legacy Metronome plan.
 * Legacy plans are billed by seat and do not enforce AWU credit limits.
 * Fails open (returns true) when the plan cannot be determined.
 */
export async function isLegacyPlan(
  metronomeCustomerId: string
): Promise<boolean> {
  const contract = await getActiveContract(metronomeCustomerId);
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
  (metronomeCustomerId: string) => metronomeCustomerId
);

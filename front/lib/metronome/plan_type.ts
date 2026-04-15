import { getMetronomeClient } from "@app/lib/metronome/client";
import { getProductAiUsageUserId } from "@app/lib/metronome/constants";
import { cacheWithRedis, invalidateCacheWithRedis } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";

// No TTL — contract subscriptions only change when a contract starts/ends.
// Invalidated explicitly via invalidateContractSubscriptionsCache on contract.start/end webhooks.

export type ContractSubscription = {
  id: string;
  productId: string;
};

/**
 * Fetch the subscriptions from the active contract.
 * Returns an empty array if there is no active contract or no subscriptions.
 *
 * Fails open: returns [] if the contract cannot be determined,
 * so that credit enforcement is skipped rather than blocking the user.
 */
async function fetchContractSubscriptions(
  workspaceId: string,
  metronomeCustomerId: string
): Promise<ContractSubscription[]> {
  try {
    const client = getMetronomeClient();
    const response = await client.v2.contracts.list({
      customer_id: metronomeCustomerId,
    });

    if (response.data.length === 0) {
      return [];
    }

    const contract = response.data[0];
    const subscriptions = contract.subscriptions ?? [];

    const result = subscriptions
      .filter((s) => s.id !== undefined)
      .map((s) => ({
        id: s.id as string,
        productId: s.subscription_rate.product.id,
      }));

    logger.info(
      {
        workspaceId,
        metronomeCustomerId,
        subscriptionCount: result.length,
      },
      "[Metronome ContractSubscriptions] Contract subscriptions fetched"
    );

    return result;
  } catch (err) {
    logger.warn(
      { workspaceId, metronomeCustomerId, err },
      "[Metronome ContractSubscriptions] Failed to fetch contract — treating as legacy (fail-open)"
    );
    return [];
  }
}

const getCachedContractSubscriptions = cacheWithRedis(
  fetchContractSubscriptions,
  (workspaceId) => workspaceId,
  {}
);

/**
 * Returns the subscriptions from the active contract.
 * Returns an empty array if there is no active contract or the contract cannot be determined.
 */
export async function getContractSubscriptions(
  workspaceId: string,
  metronomeCustomerId: string
): Promise<ContractSubscription[]> {
  const cached = await getCachedContractSubscriptions(
    workspaceId,
    metronomeCustomerId
  );
  // null means Redis was unavailable — fail-open (treat as no subscriptions).
  return cached ?? [];
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
  const subscriptions = await getContractSubscriptions(
    workspaceId,
    metronomeCustomerId
  );
  const aiUsageUserId = getProductAiUsageUserId();
  return !subscriptions.some((s) => s.productId === aiUsageUserId);
}

/**
 * Invalidate the cached contract subscriptions for a workspace.
 * Call this whenever a customer's contract is changed (e.g. plan upgrade/migration).
 */
export const invalidateContractSubscriptionsCache = invalidateCacheWithRedis(
  fetchContractSubscriptions,
  (workspaceId: string) => workspaceId
);

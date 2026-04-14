import { getMetronomeClient } from "@app/lib/metronome/client";
import { getProductAiUsageUserId } from "@app/lib/metronome/constants";
import { cacheWithRedis, invalidateCacheWithRedis } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";

// No TTL — plan type only changes when a contract starts/ends.
// Invalidated explicitly via invalidateLegacyPlanCache on contract.start/end webhooks.

/**
 * Fetch whether the workspace is on a legacy plan.
 * Legacy plans do NOT include the "AI Usage (User)" product in their subscriptions.
 * New (credit-based) plans DO include it.
 *
 * Fails open: returns `true` (legacy) if the contract cannot be determined,
 * so that credit enforcement is skipped rather than blocking the user.
 */
async function fetchIsLegacyPlan(
  workspaceId: string,
  metronomeCustomerId: string
): Promise<boolean> {
  try {
    const client = getMetronomeClient();
    const response = await client.v2.contracts.list({
      customer_id: metronomeCustomerId,
    });

    if (response.data.length === 0) {
      // No active contract — treat as legacy (skip credit check).
      return true;
    }

    const contract = response.data[0];
    const subscriptions: Array<{
      subscription_rate: { product: { id: string } };
    }> = contract.subscriptions ?? [];

    const aiUsageUserId = getProductAiUsageUserId();
    const hasAiUsageUser = subscriptions.some(
      (s) => s.subscription_rate.product.id === aiUsageUserId
    );

    logger.info(
      { workspaceId, metronomeCustomerId, isLegacy: !hasAiUsageUser },
      "[Metronome PlanType] Plan type determined"
    );

    return !hasAiUsageUser;
  } catch (err) {
    logger.warn(
      { workspaceId, metronomeCustomerId, err },
      "[Metronome PlanType] Failed to fetch contract — treating as legacy (fail-open)"
    );
    return true;
  }
}

const getCachedIsLegacyPlan = cacheWithRedis(
  fetchIsLegacyPlan,
  (workspaceId) => workspaceId,
  {}
);

/**
 * Returns true if the workspace is on a legacy Metronome plan.
 * Legacy plans are billed by seat and do not enforce AWU credit limits.
 * Fails open (returns true) when the plan cannot be determined.
 */
export async function isLegacyPlan(
  workspaceId: string,
  metronomeCustomerId: string
): Promise<boolean> {
  const cached = await getCachedIsLegacyPlan(workspaceId, metronomeCustomerId);
  // null means Redis was unavailable — fail-open (treat as legacy).
  return cached ?? true;
}

/**
 * Invalidate the cached plan type for a workspace.
 * Call this whenever a customer's contract is changed (e.g. plan upgrade/migration).
 */
export const invalidateLegacyPlanCache = invalidateCacheWithRedis(
  fetchIsLegacyPlan,
  (workspaceId: string) => workspaceId
);

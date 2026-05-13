import { getMetronomeClient } from "@app/lib/metronome/client";
import { getProductProgrammaticUsageId } from "@app/lib/metronome/constants";
import { SubscriptionModel } from "@app/lib/models/plan";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { cacheWithRedis, invalidateCacheWithRedis } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type { ContractV2 } from "@metronome/sdk/resources";

// Commits and credits are stripped before caching — their balances/ledgers change
// every billing cycle and are never read here.
export type CachedContract = Omit<ContractV2, "commits" | "credits">;

// No TTL — contracts only change when a contract starts/ends.
// Invalidated explicitly via invalidateContractCache on contract.start/end webhooks.
// Null values are NOT cached: when no contract is found we want a fresh fetch next time.

/**
 * Fetch the active Metronome contract for a workspace.
 * Resolves metronomeCustomerId from the workspace table and contractId from
 * the active subscription. Returns null when either is missing or on failure.
 */
async function fetchActiveContract(
  workspaceId: string
): Promise<CachedContract | null> {
  try {
    const workspace = await WorkspaceModel.findOne({
      attributes: ["id", "metronomeCustomerId"],
      where: { sId: workspaceId },
    });
    if (!workspace?.metronomeCustomerId) {
      return null;
    }

    const subscription = await SubscriptionModel.findOne({
      attributes: ["metronomeContractId"],
      where: { workspaceId: workspace.id, status: "active" },
    });
    if (!subscription?.metronomeContractId) {
      return null;
    }

    const client = getMetronomeClient();
    const response = await client.v2.contracts.retrieve({
      customer_id: workspace.metronomeCustomerId,
      contract_id: subscription.metronomeContractId,
    });

    logger.info(
      {
        workspaceId,
        metronomeCustomerId: workspace.metronomeCustomerId,
        contractId: subscription.metronomeContractId,
      },
      "[Metronome Contract] Contract fetched"
    );

    if (!response.data) {
      return null;
    }
    const { commits: _commits, credits: _credits, ...contract } = response.data;
    return contract;
  } catch (err) {
    logger.warn(
      { workspaceId, err },
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
 * Cached by workspaceId. Returns null when not found or on failure.
 */
export async function getActiveContract(
  workspaceId: string
): Promise<CachedContract | null> {
  return await getCachedActiveContract(workspaceId);
}

/**
 * Returns true if the contract's rate card prices the `Programmatic Usage`
 * product. Legacy plans bill programmatic usage in programmatic-USD credits;
 * new plans price all usage in AWU and never reference this product.
 *
 * Cached by rate card ID — rate cards rarely change.
 */
async function fetchHasProgrammaticUsageRate(
  rateCardId: string
): Promise<boolean> {
  try {
    const client = getMetronomeClient();
    const response = await client.v1.contracts.rateCards.retrieveRateSchedule({
      rate_card_id: rateCardId,
      starting_at: new Date().toISOString(),
      selectors: [{ product_id: getProductProgrammaticUsageId() }],
      limit: 1,
    });
    return (response.data ?? []).some((rate) => rate.entitled);
  } catch (err) {
    logger.warn(
      { rateCardId, err },
      "[Metronome Contract] Failed to fetch rate schedule — treating as legacy (fail-open)"
    );
    return true;
  }
}

const getCachedHasProgrammaticUsageRate = cacheWithRedis(
  fetchHasProgrammaticUsageRate,
  (rateCardId) => `metronome:has-programmatic-usage-rate:${rateCardId}`,
  { ttlMs: 6 * 60 * 60 * 1000 }
);

/**
 * Returns true if the workspace is on a legacy Metronome plan.
 *
 * Legacy plans price the `Programmatic Usage` product (programmatic-USD credit
 * type); new plans bill all usage in AWU. Fails open (returns true) when the
 * plan cannot be determined.
 */
export async function isLegacyPlan(workspaceId: string): Promise<boolean> {
  const contract = await getActiveContract(workspaceId);
  if (!contract?.rate_card_id) {
    return true;
  }
  return await getCachedHasProgrammaticUsageRate(contract.rate_card_id);
}

/**
 * Invalidate the cached contract for a workspace.
 * Call this whenever a customer's contract is changed (e.g. plan upgrade/migration).
 */
export const invalidateContractCache = invalidateCacheWithRedis(
  fetchActiveContract,
  (workspaceId: string) => workspaceId
);

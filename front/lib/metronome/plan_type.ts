import { getMetronomeContractById } from "@app/lib/metronome/client";
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
 * Resolve a workspace's Metronome customer id and the contract id of its
 * active subscription. Returns null when either is missing.
 */
export async function resolveActiveMetronomeIds(workspaceId: string): Promise<{
  metronomeCustomerId: string;
  metronomeContractId: string;
} | null> {
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

  return {
    metronomeCustomerId: workspace.metronomeCustomerId,
    metronomeContractId: subscription.metronomeContractId,
  };
}

/**
 * Fetch the active Metronome contract for a workspace.
 * Resolves metronomeCustomerId from the workspace table and contractId from
 * the active subscription. Returns null when either is missing or on failure.
 */
async function fetchActiveContract(
  workspaceId: string
): Promise<CachedContract | null> {
  try {
    const ids = await resolveActiveMetronomeIds(workspaceId);
    if (!ids) {
      return null;
    }
    const { metronomeCustomerId, metronomeContractId } = ids;

    const result = await getMetronomeContractById({
      metronomeCustomerId,
      metronomeContractId,
    });
    if (result.isErr()) {
      throw result.error;
    }

    logger.info(
      { workspaceId, metronomeCustomerId, contractId: metronomeContractId },
      "[Metronome Contract] Contract fetched"
    );

    const { commits: _commits, credits: _credits, ...contract } = result.value;
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
 * Invalidate the cached contract for a workspace.
 * Call this whenever a customer's contract is changed (e.g. plan upgrade/migration).
 */
export const invalidateContractCache = invalidateCacheWithRedis(
  fetchActiveContract,
  (workspaceId: string) => workspaceId
);

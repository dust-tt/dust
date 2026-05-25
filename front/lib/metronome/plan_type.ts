import { getMetronomeContractById } from "@app/lib/metronome/client";
import { SubscriptionModel } from "@app/lib/models/plan";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { cacheWithRedis, invalidateCacheWithRedis } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type { ContractV2 } from "@metronome/sdk/resources";

// Commits and credits are stripped before caching — their balances/ledgers change
// every billing cycle and are never read here.
export type CachedContract = Omit<ContractV2, "commits" | "credits">;

// Non-null contracts have no TTL — they only change when a contract
// starts/ends, and those webhooks call invalidateContractCache.
// Null values (no contract OR upstream Metronome error) get a short TTL so
// that during a Metronome outage we don't stampede the API on every request.
// The window has to be short enough that recovery is observed quickly but
// long enough to actually break the burst — 60s is a fine middle ground.
const ACTIVE_CONTRACT_NULL_TTL_MS = 60 * 1000;

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

    const result = await getMetronomeContractById({
      metronomeCustomerId: workspace.metronomeCustomerId,
      metronomeContractId: subscription.metronomeContractId,
    });
    if (result.isErr()) {
      throw result.error;
    }

    logger.info(
      {
        workspaceId,
        metronomeCustomerId: workspace.metronomeCustomerId,
        contractId: subscription.metronomeContractId,
      },
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
  { cacheNullValues: true, nullTtlMs: ACTIVE_CONTRACT_NULL_TTL_MS }
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

import {
  getMetronomeClient,
  updateSubscriptionQuantity,
} from "@app/lib/metronome/client";
import {
  getProductMauId,
  getProductMauTierIds,
} from "@app/lib/metronome/constants";
import { countActiveUsersForPeriodInWorkspace } from "@app/lib/plans/usage/mau";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";

// ---------------------------------------------------------------------------
// MAU_TIERS parsing
// ---------------------------------------------------------------------------

interface TierBoundary {
  /** Start of this tier (inclusive). */
  start: number;
  /** End of this tier (exclusive). undefined = unlimited. */
  end: number | undefined;
  /** If true, this tier's quantity is always 1 (floor tier). */
  isFloor: boolean;
}

/**
 * Parse the MAU_TIERS custom field value into tier boundaries.
 *
 * Format: "FLOOR-101-201" or "0-101-201"
 * - "FLOOR" as first element means tier 1 quantity is always 1.
 * - Numbers are the start of each tier.
 *
 * Returns undefined if the field is missing or empty.
 */
/**
 * Parse the MAU_TIERS custom field value into tier boundaries.
 *
 * Format: "FLOOR-4-6-8" or "1-4-6-8"
 * - "FLOOR" means tier 1 has a floor (minimum charge via recurring commit).
 *   Floor tier starts at 1 (MAUs are 1-indexed).
 * - Numbers are the start of each tier (inclusive, 1-indexed).
 *
 * Example "FLOOR-4-6-8" → tiers:
 *   [{start:1, end:4, isFloor:true}, {start:4, end:6}, {start:6, end:8}, {start:8, end:undefined}]
 *   With 15 MAUs → quantities: 3, 2, 2, 8
 */
export function parseMauTiers(
  mauTiersField: string | undefined
): TierBoundary[] | undefined {
  if (!mauTiersField) {
    return undefined;
  }

  const parts = mauTiersField.split("-");
  if (parts.length === 0) {
    return undefined;
  }

  const isFloorFirst = parts[0] === "FLOOR";

  // Collect all numeric boundary starts.
  // For "FLOOR-4-6-8": starts = [1, 4, 6, 8] (floor starts at 1)
  // For "1-4-6-8": starts = [1, 4, 6, 8]
  const starts: number[] = [];
  if (isFloorFirst) {
    starts.push(1); // Floor tier starts at MAU 1.
  }
  for (const part of parts) {
    if (part !== "FLOOR") {
      starts.push(parseInt(part, 10));
    }
  }

  // Build tier boundaries: each tier goes from starts[i] to starts[i+1] (exclusive).
  return starts.map((start, i) => ({
    start,
    end: i + 1 < starts.length ? starts[i + 1] : undefined,
    isFloor: i === 0 && isFloorFirst,
  }));
}

/**
 * Distribute a total MAU count across tier boundaries.
 * Returns the quantity for each tier.
 */
/**
 * Distribute a total MAU count across tier boundaries.
 *
 * Tiers are 1-indexed (start/end represent MAU numbers, not zero-based indices).
 * Example: tiers [{start:1,end:4}, {start:4,end:6}, {start:6}], totalMau=15
 *   → [3, 2, 10] (MAUs 1-3, 4-5, 6-15)
 */
export function distributeMauAcrossTiers(
  totalMau: number,
  tiers: TierBoundary[]
): number[] {
  return tiers.map((tier) => {
    if (totalMau < tier.start) {
      return 0;
    }
    // For 1-indexed tiers: count = min(totalMau, lastInTier) - firstInTier + 1
    // lastInTier = (end - 1) if end is defined, else totalMau
    const lastInTier = tier.end !== undefined ? tier.end - 1 : totalMau;
    const count = Math.min(totalMau, lastInTier) - tier.start + 1;
    return Math.max(count, 0);
  });
}

// ---------------------------------------------------------------------------
// Contract MAU info extraction
// ---------------------------------------------------------------------------

interface SimpleMauInfo {
  type: "simple";
  subscriptionId: string;
  threshold: number;
}

interface TieredMauInfo {
  type: "tiered";
  tierSubscriptionIds: string[];
  threshold: number;
  tiers: TierBoundary[];
}

type MauInfo = SimpleMauInfo | TieredMauInfo;

/**
 * Retrieve a contract and extract MAU info.
 *
 * - If MAU_TIERS custom field is set → tiered mode (MAU Tier 1-6 products).
 * - Otherwise → simple mode (single MAU product).
 * - MAU_THRESHOLD custom field controls the threshold (default 1).
 */
async function getContractMauInfo(
  metronomeCustomerId: string,
  contractId: string
): Promise<MauInfo | undefined> {
  const client = getMetronomeClient();

  const response = await client.v2.contracts.retrieve({
    customer_id: metronomeCustomerId,
    contract_id: contractId,
  });
  const contract = response.data;
  if (!contract?.subscriptions?.length) {
    return undefined;
  }

  const customFields = (
    contract as typeof contract & {
      custom_fields?: Record<string, string>;
    }
  ).custom_fields;
  const threshold = parseInt(customFields?.MAU_THRESHOLD ?? "1", 10);
  const safeThreshold = isNaN(threshold) ? 1 : threshold;

  // Build product → subscription mapping.
  const subscriptionByProductId = new Map<string, string>();
  for (const sub of contract.subscriptions) {
    const productId = (
      sub as { subscription_rate: { product: { id: string } }; id: string }
    ).subscription_rate.product.id;
    const subId = (sub as { id: string }).id;
    subscriptionByProductId.set(productId, subId);
  }

  // Check for MAU_TIERS custom field → tiered mode.
  const mauTiersField = customFields?.MAU_TIERS;
  const tiers = parseMauTiers(mauTiersField);

  if (tiers) {
    const tierProductIds = getProductMauTierIds();
    const tierSubscriptionIds: string[] = [];
    for (let i = 0; i < tiers.length; i++) {
      const subId = subscriptionByProductId.get(tierProductIds[i]);
      if (!subId) {
        logger.warn(
          { contractId, tierIndex: i, productId: tierProductIds[i] },
          "[Metronome] MAU tier subscription not found"
        );
        return undefined;
      }
      tierSubscriptionIds.push(subId);
    }

    return {
      type: "tiered",
      tierSubscriptionIds,
      threshold: safeThreshold,
      tiers,
    };
  }

  // Simple mode: single MAU product.
  const mauSubId = subscriptionByProductId.get(getProductMauId());
  if (!mauSubId) {
    return undefined;
  }

  return { type: "simple", subscriptionId: mauSubId, threshold: safeThreshold };
}

/**
 * Sync the Metronome MAU subscription quantities.
 *
 * Two modes based on the MAU_TIERS custom field on the contract:
 * - Simple (no MAU_TIERS): single MAU product, set quantity to total MAU count.
 * - Tiered (MAU_TIERS set): multiple MAU Tier products, distribute count across tiers.
 *
 * MAU_THRESHOLD custom field controls the MAU counting threshold (default 1).
 */
export async function syncMauCount({
  metronomeCustomerId,
  contractId,
  workspace,
  startingAt,
}: {
  metronomeCustomerId: string;
  contractId: string;
  workspace: LightWorkspaceType;
  startingAt?: string;
}): Promise<Result<void, Error>> {
  const mauInfo = await getContractMauInfo(metronomeCustomerId, contractId);
  if (!mauInfo) {
    logger.warn(
      { workspaceId: workspace.sId, contractId },
      "[Metronome] No MAU subscription found on contract — cannot sync MAU"
    );
    return new Err(new Error("No MAU subscription found on contract"));
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const mauCount = await countActiveUsersForPeriodInWorkspace({
    messagesPerMonthForMau: mauInfo.threshold,
    since: thirtyDaysAgo,
    workspace,
  });

  const totalMau = Math.max(mauCount, 1);

  // Uniqueness key prevents duplicate updates within the same hour.
  const hourKey = startingAt ?? new Date().toISOString().slice(0, 13); // "YYYY-MM-DDTHH"

  if (mauInfo.type === "simple") {
    return updateSubscriptionQuantity({
      metronomeCustomerId,
      contractId,
      subscriptionId: mauInfo.subscriptionId,
      quantity: totalMau,
      uniquenessKey: `mau-sync-${contractId}-${hourKey}`,
      startingAt,
    });
  }

  // Tiered mode: distribute MAU across tier subscriptions.
  const tierQuantities = distributeMauAcrossTiers(totalMau, mauInfo.tiers);

  for (let i = 0; i < mauInfo.tierSubscriptionIds.length; i++) {
    const result = await updateSubscriptionQuantity({
      metronomeCustomerId,
      contractId,
      subscriptionId: mauInfo.tierSubscriptionIds[i],
      quantity: Math.max(tierQuantities[i], 0),
      startingAt,
      uniquenessKey: `mau-sync-${contractId}-tier${i}-${hourKey}`,
    });
    if (result.isErr()) {
      return result;
    }
  }

  return new Ok(undefined);
}

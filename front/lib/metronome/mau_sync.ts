import { updateSubscriptionQuantity } from "@app/lib/metronome/client";
import {
  getProductMauId,
  getProductMauTierIds,
} from "@app/lib/metronome/constants";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import { countActiveUsersForPeriodInWorkspace } from "@app/lib/plans/usage/mau";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";

// ---------------------------------------------------------------------------
// MAU_TIERS parsing
// ---------------------------------------------------------------------------

export interface TierBoundary {
  /** Start of this tier (inclusive, 1-indexed). */
  start: number;
  /** End of this tier (exclusive). undefined = unlimited. */
  end: number | undefined;
  /** If true, this tier has a floor (minimum charge via recurring commit). */
  isFloor: boolean;
}

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
 * Compute the quantity for a single tier boundary given a total MAU count.
 * Tiers are 1-indexed (start/end represent MAU numbers).
 */
export function computeTierQuantity(
  totalMau: number,
  tier: TierBoundary
): number {
  if (totalMau < tier.start) {
    return 0;
  }
  const lastInTier = tier.end !== undefined ? tier.end - 1 : totalMau;
  const count = Math.min(totalMau, lastInTier) - tier.start + 1;
  return Math.max(count, 0);
}

/**
 * Distribute a total MAU count across tiered subscriptions.
 * Returns only subscriptions whose quantity needs updating (changed from current).
 * Each returned entry has `currentQuantity` set to the new target quantity.
 *
 * Example: subscriptions with tiers [{start:1,end:4}, {start:4,end:6}, {start:6}], totalMau=15
 *   → returns entries with quantities: 3, 2, 10
 */
export function distributeMauAcrossTiers(
  totalMau: number,
  subscriptions: SubscriptionInfo[]
): SubscriptionInfo[] {
  return subscriptions
    .map((sub) => {
      const newQuantity = computeTierQuantity(totalMau, sub.tier);
      return sub.currentQuantity !== newQuantity
        ? { ...sub, currentQuantity: newQuantity }
        : undefined;
    })
    .filter((sub) => sub !== undefined);
}

// ---------------------------------------------------------------------------
// Contract MAU info extraction
// ---------------------------------------------------------------------------

interface SubscriptionInfo {
  id: string;
  currentQuantity: number;
  /** Start of the next billing period — quantity updates target the next period only. */
  nextPeriodStart: string | undefined;
  tier: TierBoundary;
}

interface SimpleMauInfo {
  type: "simple";
  subscription: SubscriptionInfo;
  threshold: number;
}

interface TieredMauInfo {
  type: "tiered";
  subscriptions: SubscriptionInfo[];
  threshold: number;
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
  workspaceId: string
): Promise<MauInfo | undefined> {
  const contract = await getActiveContract(workspaceId);
  if (!contract?.subscriptions?.length) {
    return undefined;
  }

  const customFields = contract.custom_fields;
  const threshold = parseInt(customFields?.MAU_THRESHOLD ?? "1", 10);
  const safeThreshold = isNaN(threshold) ? 1 : threshold;

  // Build product → subscription info mapping.
  const subscriptionByProductId = new Map<
    string,
    { id: string; currentQuantity: number; nextPeriodStart: string | undefined }
  >();
  for (const sub of contract.subscriptions) {
    const productId = sub.subscription_rate.product.id;
    const qSchedule = sub.quantity_schedule ?? [];
    const currentQuantity =
      qSchedule.length > 0 ? qSchedule[qSchedule.length - 1].quantity : 0;
    const nextPeriodStart = sub.billing_periods?.next?.starting_at;
    if (sub.id) {
      subscriptionByProductId.set(productId, {
        id: sub.id,
        currentQuantity,
        nextPeriodStart,
      });
    }
  }

  // Check for MAU_TIERS custom field → tiered mode.
  const mauTiersField = customFields?.MAU_TIERS;
  const tiers = parseMauTiers(mauTiersField);

  if (tiers) {
    const tierProductIds = getProductMauTierIds();
    const subscriptions: SubscriptionInfo[] = [];
    for (let i = 0; i < tiers.length; i++) {
      const subInfo = subscriptionByProductId.get(tierProductIds[i]);
      if (!subInfo) {
        logger.warn(
          {
            workspaceId,
            contractId: contract.id,
            tierIndex: i,
            productId: tierProductIds[i],
          },
          "[Metronome] MAU tier subscription not found"
        );
        return undefined;
      }
      subscriptions.push({ ...subInfo, tier: tiers[i] });
    }

    return {
      type: "tiered",
      subscriptions,
      threshold: safeThreshold,
    };
  }

  // Simple mode: single MAU product (default tier covers all MAUs).
  const mauSubInfo = subscriptionByProductId.get(getProductMauId());
  if (!mauSubInfo) {
    return undefined;
  }

  return {
    type: "simple",
    subscription: {
      ...mauSubInfo,
      tier: { start: 1, end: undefined, isFloor: false },
    },
    threshold: safeThreshold,
  };
}

/**
 * Sync the Metronome MAU subscription quantities.
 *
 * Two modes based on the MAU_TIERS custom field on the contract:
 * - Simple (no MAU_TIERS): single MAU product, set quantity to total MAU count.
 * - Tiered (MAU_TIERS set): multiple MAU Tier products, distribute count across tiers.
 *
 * Skips updates when the quantity hasn't changed.
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
  const mauInfo = await getContractMauInfo(workspace.sId);
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

  // Get subscriptions that need updating (works for both simple and tiered).
  const subscriptions =
    mauInfo.type === "simple" ? [mauInfo.subscription] : mauInfo.subscriptions;
  const toUpdate = distributeMauAcrossTiers(totalMau, subscriptions);

  logger.info(
    { workspaceId: workspace.sId, contractId, toUpdate, totalMau },
    "[Metronome] Updating MAU quantities"
  );

  for (const sub of toUpdate) {
    // Target the next billing period — current period stays as-is.
    const effectiveStartingAt = sub.nextPeriodStart ?? startingAt;
    const result = await updateSubscriptionQuantity({
      metronomeCustomerId,
      contractId,
      subscriptionId: sub.id,
      quantity: sub.currentQuantity,
      startingAt: effectiveStartingAt,
    });
    if (result.isErr()) {
      return result;
    }
  }

  return new Ok(undefined);
}

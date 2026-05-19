import {
  getMetronomeContractById,
  getMetronomeSubscriptionAssignedSeatIds,
  updateSubscriptionQuantity,
  updateSubscriptionSeats,
} from "@app/lib/metronome/client";
import type { CachedContract } from "@app/lib/metronome/plan_type";
import {
  classifySeatTransition,
  getAwuAllocationForSeatType,
  getProductSeatTypes,
  getSeatTypeForSubscription,
  isMauContract,
} from "@app/lib/metronome/seat_types";
import type { BillingFrequency } from "@app/lib/metronome/types";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { MembershipSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * Returns true if the contract is seat-billed (any subscription should be
 * synced as a seat). MAU contracts are excluded up-front via the contract's
 * `MAU_THRESHOLD` custom field — seat and MAU billing are mutually exclusive.
 *
 * Beyond MAU, we require at least one subscription whose product is tagged
 * with `DUST_SEAT_TYPE` (resolved via the Redis-cached product map). Untagged
 * subscriptions don't count — a contract holding only non-seat subscriptions
 * (e.g. usage-only) doesn't trigger seat sync.
 */
export async function hasContractSeatSubscription(
  contract: CachedContract
): Promise<boolean> {
  if (isMauContract(contract)) {
    return false;
  }
  const subscriptions = contract.subscriptions ?? [];
  if (subscriptions.length === 0) {
    return false;
  }
  const productSeatTypes = await getProductSeatTypes();
  return subscriptions.some((s) =>
    productSeatTypes.has(s.subscription_rate.product.id)
  );
}

async function fetchCachedContract({
  metronomeCustomerId,
  metronomeContractId,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
}): Promise<Result<CachedContract, Error>> {
  const contractResult = await getMetronomeContractById({
    metronomeCustomerId,
    metronomeContractId,
  });
  if (contractResult.isErr()) {
    logger.warn(
      {
        error: contractResult.error,
        metronomeCustomerId,
        metronomeContractId,
      },
      "[Metronome] Failed to retrieve contract while syncing seats"
    );
    return new Err(contractResult.error);
  }
  return new Ok(contractResult.value);
}

/**
 * Per-user seat-type change that the caller wants to apply atomically with
 * the bulk sync. `syncSeatCount` decides whether to apply this immediately
 * or defer it to the next billing period based on the allocation comparison
 * — the caller doesn't make that decision.
 *
 * `pendingScheduledChange` lets the caller surface an existing future-scheduled
 * change so syncSeatCount can cancel it (or supersede it) in Metronome.
 */
export type SeatChangeRequest = {
  userId: string;
  previousSeatType: MembershipSeatType;
  newSeatType: MembershipSeatType;
  pendingScheduledChange?: {
    seatType: MembershipSeatType;
    at: Date;
  };
};

/**
 * Result returned by `syncSeatCount` when a `change` was passed. Tells the
 * caller what DB state to write next:
 *
 * - `noop`: no change required.
 * - `cancelled`: a previously-scheduled change was cancelled (caller should
 *   drop its DB future row).
 * - `immediate`: the user is now on `newSeatType` (caller should update
 *   the active row in place).
 * - `deferred`: the transition was scheduled in Metronome (caller should
 *   close the active row at `at` and insert a future row).
 */
export type SeatChangeOutcome =
  | { kind: "noop" }
  | { kind: "cancelled" }
  | { kind: "immediate" }
  | { kind: "deferred"; at: Date };

/**
 * Sync the Metronome seat subscription state to the current active
 * memberships. Always sets the absolute state per subscription — safe
 * against race conditions.
 *
 * When a per-user `change` is provided, the function also handles that
 * transition generically. The scheduling decision is based purely on the
 * allocation comparison resolved from the contract's recurring credits:
 *
 * - new allocation ≥ previous → applied immediately
 * - new allocation < previous → scheduled at the next billing period start
 *   so the user keeps the richer access they already paid for
 *
 * No knowledge of specific seat-type names (pro / max / free / …) is
 * baked in: adding a new seat tier in Metronome flows through as long as
 * the product carries the `DUST_SEAT_TYPE` custom field.
 *
 * Called from:
 * - membership create/revoke/update hooks
 * - contract provisioning after creation or migration
 * - admin-driven seat-type changes (via `updateMembershipSeatAndTrack`)
 */
export async function syncSeatCount({
  metronomeCustomerId,
  contractId,
  workspace,
  startingAt,
  contract,
  change,
}: {
  metronomeCustomerId: string;
  contractId: string;
  workspace: LightWorkspaceType;
  startingAt?: string;
  contract?: CachedContract;
  change?: SeatChangeRequest;
}): Promise<Result<{ change?: SeatChangeOutcome }, Error>> {
  let resolvedContract: CachedContract;
  if (contract) {
    resolvedContract = contract;
  } else {
    const fetched = await fetchCachedContract({
      metronomeCustomerId,
      metronomeContractId: contractId,
    });
    if (fetched.isErr()) {
      return new Err(fetched.error);
    }
    resolvedContract = fetched.value;
  }

  const productSeatTypes = await getProductSeatTypes();
  const seatSubscriptions = (resolvedContract.subscriptions ?? []).flatMap(
    (sub) => {
      if (!sub.id) {
        return [];
      }
      const seatType = getSeatTypeForSubscription(sub, productSeatTypes);
      if (!seatType) {
        return [];
      }
      return [{ sub, seatType }];
    }
  );

  if (seatSubscriptions.length === 0) {
    logger.warn(
      { workspaceId: workspace.sId, contractId },
      "[Metronome] No seat subscription found on contract — cannot sync seats"
    );
    return new Err(new Error("No seat subscription found on contract"));
  }

  const subscriptionIdBySeatType = new Map<MembershipSeatType, string>();
  for (const { sub, seatType } of seatSubscriptions) {
    if (sub.id) {
      subscriptionIdBySeatType.set(seatType, sub.id);
    }
  }

  // ---------------------------------------------------------------------
  // Per-user transition mode. The caller's DB row hasn't been updated yet
  // (the outcome we return drives that), so the bulk reconciliation below
  // would read stale DB state and reverse the change. Skip the bulk pass
  // entirely — bulk callers (creation/revocation/provisioning) don't pass
  // a `change`.
  // ---------------------------------------------------------------------
  if (change) {
    const outcome = await applySingleSeatChange({
      metronomeCustomerId,
      contractId,
      workspace,
      contract: resolvedContract,
      productSeatTypes,
      subscriptionIdBySeatType,
      change,
    });
    if (outcome.isErr()) {
      return new Err(outcome.error);
    }
    return new Ok({ change: outcome.value });
  }

  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
  });

  const sIdsBySeatType = new Map<MembershipSeatType, string[]>();
  for (const m of memberships) {
    const userId = m.user?.sId;
    if (!userId) {
      continue;
    }

    const bucket = sIdsBySeatType.get(m.seatType);
    if (bucket) {
      bucket.push(userId);
    } else {
      sIdsBySeatType.set(m.seatType, [userId]);
    }
  }

  // Surface memberships whose seat type has no matching subscription on the
  // contract — these will not be billed.
  const coveredSeatTypes = new Set(
    seatSubscriptions.map(({ seatType }) => seatType)
  );
  for (const [seatType, sIds] of sIdsBySeatType) {
    if (coveredSeatTypes.has(seatType)) {
      continue;
    }
    logger.warn(
      {
        workspaceId: workspace.sId,
        contractId,
        seatType,
        memberCount: sIds.length,
        userIds: sIds,
      },
      "[Metronome] Memberships with seat type not covered by any contract subscription — they will not be billed"
    );
  }

  for (const { sub, seatType } of seatSubscriptions) {
    const subscriptionId = sub.id!;
    const sIds = sIdsBySeatType.get(seatType) ?? [];
    const quantityMode = sub.quantity_management_mode ?? "QUANTITY_ONLY";

    if (quantityMode === "SEAT_BASED") {
      const currentResult = await getMetronomeSubscriptionAssignedSeatIds({
        metronomeCustomerId,
        contractId,
        subscriptionId,
      });
      if (currentResult.isErr()) {
        return new Err(currentResult.error);
      }

      const desired = new Set(sIds);
      const current = new Set(currentResult.value);
      const addSeatIds = sIds.filter((id) => !current.has(id));
      const removeSeatIds = currentResult.value.filter(
        (id) => !desired.has(id)
      );

      if (addSeatIds.length === 0 && removeSeatIds.length === 0) {
        continue;
      }

      logger.info(
        {
          workspaceId: workspace.sId,
          contractId,
          subscriptionId,
          seatType,
          addCount: addSeatIds.length,
          removeCount: removeSeatIds.length,
        },
        "[Metronome] Updating seat-based subscription assignments"
      );

      const updateResult = await updateSubscriptionSeats({
        metronomeCustomerId,
        contractId,
        fromSubscriptionId: subscriptionId,
        addSeatIds,
        removeSeatIds,
        addUnassignedSeats: removeSeatIds.length,
        removeUnassignedSeats: addSeatIds.length,
        startingAt,
      });
      if (updateResult.isErr()) {
        return new Err(updateResult.error);
      }
    } else {
      logger.info(
        {
          workspaceId: workspace.sId,
          contractId,
          subscriptionId,
          seatType,
          quantity: sIds.length,
        },
        "[Metronome] Updating seat quantity"
      );

      const updateResult = await updateSubscriptionQuantity({
        metronomeCustomerId,
        contractId,
        subscriptionId,
        quantity: sIds.length,
        startingAt,
      });
      if (updateResult.isErr()) {
        return new Err(updateResult.error);
      }
    }
  }

  return new Ok({});
}

/**
 * Apply a single-user seat-type change in Metronome. Classifies the
 * transition generically (`classifySeatTransition`) and applies one of:
 * - cancel a pending scheduled change (when user re-selects their current
 *   seat or supersedes a prior schedule)
 * - immediate add/move
 * - deferred move at the next billing period
 *
 * No knowledge of specific seat-type names is required — the decision is
 * driven entirely by the allocations resolved from the contract.
 */
async function applySingleSeatChange({
  metronomeCustomerId,
  contractId,
  workspace,
  contract,
  productSeatTypes,
  subscriptionIdBySeatType,
  change,
}: {
  metronomeCustomerId: string;
  contractId: string;
  workspace: LightWorkspaceType;
  contract: CachedContract;
  productSeatTypes: Map<string, MembershipSeatType>;
  subscriptionIdBySeatType: Map<MembershipSeatType, string>;
  change: SeatChangeRequest;
}): Promise<Result<SeatChangeOutcome, Error>> {
  const { userId, previousSeatType, newSeatType, pendingScheduledChange } =
    change;

  // Helper to schedule the inverse Metronome move that effectively cancels
  // a previously-scheduled change at the same date.
  async function cancelPendingInMetronome(pending: {
    seatType: MembershipSeatType;
    at: Date;
  }): Promise<Result<void, Error>> {
    const fromSubId = subscriptionIdBySeatType.get(pending.seatType);
    const toSubId = subscriptionIdBySeatType.get(previousSeatType);
    if (!fromSubId || !toSubId) {
      return new Err(
        new Error(
          `Missing subscription IDs to cancel scheduled change ${pending.seatType} → ${previousSeatType}`
        )
      );
    }
    return updateSubscriptionSeats({
      metronomeCustomerId,
      contractId,
      fromSubscriptionId: fromSubId,
      toSubscriptionId: toSubId,
      addSeatIds: [userId],
      removeSeatIds: [userId],
      startingAt: pending.at.toISOString(),
    });
  }

  // Selecting the current seat with a pending change → cancellation.
  if (previousSeatType === newSeatType) {
    if (!pendingScheduledChange) {
      return new Ok({ kind: "noop" });
    }
    const cancelResult = await cancelPendingInMetronome(pendingScheduledChange);
    if (cancelResult.isErr()) {
      logger.error(
        { workspaceId: workspace.sId, userId, error: cancelResult.error },
        "[Metronome] Failed to cancel scheduled seat change"
      );
      return new Err(cancelResult.error);
    }
    return new Ok({ kind: "cancelled" });
  }

  const plan = classifySeatTransition(
    contract,
    productSeatTypes,
    previousSeatType,
    newSeatType
  );
  if (!plan) {
    return new Err(
      new Error(
        `Cannot defer seat transition ${previousSeatType} → ${newSeatType}: no next billing period found on contract`
      )
    );
  }
  if (plan.kind === "noop") {
    return new Ok({ kind: "noop" });
  }

  // If a pending change is being superseded, cancel it first so the contract
  // ends up with exactly one scheduled state.
  if (pendingScheduledChange) {
    const cancelResult = await cancelPendingInMetronome(pendingScheduledChange);
    if (cancelResult.isErr()) {
      logger.error(
        { workspaceId: workspace.sId, userId, error: cancelResult.error },
        "[Metronome] Failed to supersede pending scheduled change"
      );
      return new Err(cancelResult.error);
    }
  }

  const fromSubId = subscriptionIdBySeatType.get(previousSeatType);
  const toSubId = subscriptionIdBySeatType.get(newSeatType);
  if (!toSubId) {
    return new Err(
      new Error(`No subscription found for seat type: ${newSeatType}`)
    );
  }

  const startingAt =
    plan.kind === "deferred" ? plan.at.toISOString() : undefined;

  // No `fromSubId` happens when the previous seat type isn't actually a
  // billed seat on this contract (e.g. legacy workspace seats). Treat as
  // an additive move.
  const result = fromSubId
    ? await updateSubscriptionSeats({
        metronomeCustomerId,
        contractId,
        fromSubscriptionId: fromSubId,
        toSubscriptionId: toSubId,
        addSeatIds: [userId],
        removeSeatIds: [userId],
        startingAt,
      })
    : await updateSubscriptionSeats({
        metronomeCustomerId,
        contractId,
        fromSubscriptionId: toSubId,
        addSeatIds: [userId],
        startingAt,
      });
  if (result.isErr()) {
    return new Err(result.error);
  }

  return new Ok(plan);
}

export type SeatData = {
  awuAllocation: number;
  billingFrequency: BillingFrequency | null;
};

/**
 * Query Metronome for all SEAT_BASED subscriptions on the contract and return
 * a map of userId → { awuAllocation, billingFrequency }. Makes a single
 * contract fetch and one seat-ID fetch per subscription.
 *
 * Returns an empty map on any error so callers degrade gracefully.
 */
export async function buildSeatDataByUserId({
  metronomeCustomerId,
  contractId,
}: {
  metronomeCustomerId: string;
  contractId: string;
}): Promise<Map<string, SeatData>> {
  const contractResult = await getMetronomeContractById({
    metronomeCustomerId,
    metronomeContractId: contractId,
  });
  if (contractResult.isErr()) {
    logger.warn(
      { error: contractResult.error, metronomeCustomerId, contractId },
      "[Metronome] Failed to fetch contract"
    );
    return new Map();
  }

  const contract = contractResult.value;
  const subscriptions = contract.subscriptions ?? [];
  const productSeatTypes = await getProductSeatTypes();

  const results = await concurrentExecutor(
    subscriptions,
    async (sub) => {
      if (sub.quantity_management_mode !== "SEAT_BASED" || !sub.id) {
        return null;
      }
      const seatType = getSeatTypeForSubscription(sub, productSeatTypes);
      if (!seatType) {
        return null;
      }
      const awuAllocation = getAwuAllocationForSeatType(
        contract,
        seatType,
        productSeatTypes
      );
      if (awuAllocation === 0) {
        return null;
      }

      const seatIdsResult = await getMetronomeSubscriptionAssignedSeatIds({
        metronomeCustomerId,
        contractId,
        subscriptionId: sub.id,
      });
      if (seatIdsResult.isErr()) {
        logger.warn(
          {
            error: seatIdsResult.error,
            metronomeCustomerId,
            contractId,
            subscriptionId: sub.id,
            seatType,
          },
          "[Metronome] Failed to fetch seat IDs"
        );
        return null;
      }

      const freq = sub.subscription_rate.billing_frequency;
      return {
        seatIds: seatIdsResult.value,
        awuAllocation,
        billingFrequency: freq === "MONTHLY" || freq === "ANNUAL" ? freq : null,
      };
    },
    { concurrency: 10 }
  );

  const seatDataByUserId = new Map<string, SeatData>();
  for (const result of results) {
    if (result) {
      for (const seatId of result.seatIds) {
        seatDataByUserId.set(seatId, {
          awuAllocation: result.awuAllocation,
          billingFrequency: result.billingFrequency,
        });
      }
    }
  }

  return seatDataByUserId;
}

import {
  ceilToMidnightUTC,
  getMetronomeContractById,
  getMetronomeSubscriptionAssignedSeatIds,
  updateSubscriptionQuantity,
  updateSubscriptionSeats,
} from "@app/lib/metronome/client";
import {
  getAwuAllocationForSeatType,
  getSeatTypeForProductId,
} from "@app/lib/metronome/constants";
import type { CachedContract } from "@app/lib/metronome/plan_type";
import type { BillingFrequency } from "@app/lib/metronome/types";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { MembershipSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * Returns true if the contract has any seat-billed subscription (workspace /
 * pro / max). Used by callers as a gate to decide whether to invoke
 * `syncSeatCount` — contracts without any seat subscription (e.g. enterprise
 * MAU plans) skip the sync entirely.
 */
export function hasContractSeatSubscription(contract: CachedContract): boolean {
  return (contract.subscriptions ?? []).some(
    (s) => getSeatTypeForProductId(s.subscription_rate.product) !== undefined
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
 * Sync the Metronome seat subscription quantities to the current active member
 * counts, dispatched per `seatType`. Always sets the absolute state — safe
 * against race conditions.
 *
 * For each subscription on the contract whose product matches a known seat
 * product (workspace / pro / max / free), we look up the membership seat type
 * that bills against it and:
 * - QUANTITY_ONLY: send the count of active members with that seat type.
 * - SEAT_BASED: fetch the currently assigned seat IDs via
 *   `getSubscriptionSeatsHistory`, then send the add/remove delta to reconcile
 *   against the desired set of user sIds.
 *
 * Called from:
 * - membership create/revoke/update hooks
 * - contract provisioning after creation or migration
 */
export async function syncSeatCount({
  metronomeCustomerId,
  contractId,
  workspace,
  startingAt,
  contract,
}: {
  metronomeCustomerId: string;
  contractId: string;
  workspace: LightWorkspaceType;
  startingAt?: string;
  contract?: CachedContract;
}): Promise<Result<void, Error>> {
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

  const seatSubscriptions = (resolvedContract.subscriptions ?? []).flatMap(
    (sub) => {
      const seatType = getSeatTypeForProductId(sub.subscription_rate.product);
      if (!seatType || !sub.id) {
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

  return new Ok(undefined);
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

  const subscriptions = contractResult.value.subscriptions ?? [];

  const results = await concurrentExecutor(
    subscriptions,
    async (sub) => {
      if (sub.quantity_management_mode !== "SEAT_BASED" || !sub.id) {
        return null;
      }
      const seatType = getSeatTypeForProductId(sub.subscription_rate.product);
      if (!seatType) {
        return null;
      }
      const awuAllocation = getAwuAllocationForSeatType(seatType);
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

/**
 * Extract the subscription ID for a given seat type from a contract.
 */
export function getSubscriptionIdForSeatTypeFromContract(
  contract: CachedContract,
  seatType: MembershipSeatType
): string | undefined {
  return (contract.subscriptions ?? []).find(
    (s) => getSeatTypeForProductId(s.subscription_rate.product) === seatType
  )?.id;
}

function getNextBillingPeriodStart(contract: CachedContract): Date | undefined {
  const nextStartingAt = (contract.subscriptions ?? [])
    .map((s) => s.billing_periods?.next?.starting_at)
    .find((d) => d !== undefined);
  // Ceil to midnight UTC to match how the invoice timestamp is displayed.
  // Billing period boundaries are anchored to the contract's creation time, not
  // midnight, so the raw timestamp needs the same normalization.
  return nextStartingAt
    ? ceilToMidnightUTC(new Date(nextStartingAt))
    : undefined;
}

/**
 * Handle a seat transition between two seat types.
 * Returns the date of the next billing period start if the transition is deferred,
 * otherwise undefined.
 *
 */
export async function handleSeatTransition({
  metronomeCustomerId,
  contractId,
  contract,
  userId,
  previousSeatType,
  newSeatType,
}: {
  metronomeCustomerId: string;
  contractId: string;
  contract: CachedContract;
  userId: string;
  previousSeatType: MembershipSeatType;
  newSeatType: MembershipSeatType;
}): Promise<Result<{ scheduledAt: Date | undefined }, Error>> {
  if (previousSeatType === newSeatType) {
    return new Ok({ scheduledAt: undefined });
  }

  if (
    (previousSeatType === "pro" || previousSeatType === "max") &&
    newSeatType === "free"
  ) {
    return new Err(new Error(`Seat downgrade to free is not allowed`));
  }

  const fromSubId = getSubscriptionIdForSeatTypeFromContract(
    contract,
    previousSeatType
  );
  const toSubId = getSubscriptionIdForSeatTypeFromContract(
    contract,
    newSeatType
  );

  // Assign seat if user upgrades from free to paid seat type.
  if (
    previousSeatType === "free" &&
    (newSeatType === "pro" || newSeatType === "max")
  ) {
    if (!toSubId) {
      return new Err(
        new Error(`No subscription found for seat type: ${newSeatType}`)
      );
    }
    const result = await updateSubscriptionSeats({
      metronomeCustomerId,
      contractId,
      fromSubscriptionId: toSubId,
      addSeatIds: [userId],
    });
    if (result.isErr()) {
      return new Err(result.error);
    }
    return new Ok({ scheduledAt: undefined });
  }

  // Pro → Max: immediate atomic transition.
  if (previousSeatType === "pro" && newSeatType === "max") {
    if (!fromSubId || !toSubId) {
      return new Err(
        new Error("Missing subscription ID for pro or max seat type")
      );
    }
    const result = await updateSubscriptionSeats({
      metronomeCustomerId,
      contractId,
      fromSubscriptionId: fromSubId,
      toSubscriptionId: toSubId,
      addSeatIds: [userId],
      removeSeatIds: [userId],
    });
    if (result.isErr()) {
      return new Err(result.error);
    }
    return new Ok({ scheduledAt: undefined });
  }

  // Max → Pro: deferred — schedule the transition at the next billing period
  // start so the user keeps Max access through the current period.
  if (previousSeatType === "max" && newSeatType === "pro") {
    if (!fromSubId || !toSubId) {
      return new Err(
        new Error("Missing subscription ID for max or pro seat type")
      );
    }
    const nextPeriodStart = getNextBillingPeriodStart(contract);
    if (!nextPeriodStart) {
      return new Err(
        new Error(
          "Cannot defer Max → Pro downgrade: no billing period found on contract"
        )
      );
    }
    const result = await updateSubscriptionSeats({
      metronomeCustomerId,
      contractId,
      fromSubscriptionId: fromSubId,
      toSubscriptionId: toSubId,
      addSeatIds: [userId],
      removeSeatIds: [userId],
      startingAt: nextPeriodStart.toISOString(),
    });
    if (result.isErr()) {
      return new Err(result.error);
    }
    return new Ok({ scheduledAt: nextPeriodStart });
  }

  logger.warn(
    { previousSeatType, newSeatType, userId, contractId },
    "[Metronome] Unhandled seat transition — no Metronome action taken"
  );
  return new Ok({ scheduledAt: undefined });
}

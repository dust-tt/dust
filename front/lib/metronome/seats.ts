import {
  getMetronomeContractById,
  getMetronomeSubscriptionAssignedSeatIds,
  updateSubscriptionQuantity,
  updateSubscriptionSeats,
} from "@app/lib/metronome/client";
import { getSeatTypeForProductId } from "@app/lib/metronome/constants";
import type { CachedContract } from "@app/lib/metronome/plan_type";
import { MembershipResource } from "@app/lib/resources/membership_resource";
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
 * product (workspace / pro / max), we look up the membership seat type that
 * bills against it and:
 * - QUANTITY_ONLY: send the count of active members with that seat type.
 * - SEAT_BASED: fetch the currently assigned seat IDs via
 *   `getSubscriptionSeatsHistory`, then send the add/remove delta to reconcile
 *   against the desired set of user sIds.
 *
 * Memberships with `seatType = "free"` never contribute to any quantity.
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

    // TODO Cleanup this - only required during migration, as all memberships are currently set to "free", but should be "workspace".
    const seatType = m.seatType === "free" ? "workspace" : m.seatType;

    const bucket = sIdsBySeatType.get(seatType);
    if (bucket) {
      bucket.push(userId);
    } else {
      sIdsBySeatType.set(seatType, [userId]);
    }
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
        return new Ok(undefined);
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
        subscriptionId,
        addSeatIds,
        removeSeatIds,
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

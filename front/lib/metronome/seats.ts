import {
  ceilToHourISO,
  createMetronomeCredit,
  findMetronomeCreditByUniquenessKey,
  getMetronomeContractById,
  getMetronomeSubscriptionAssignedSeatIds,
  updateMetronomeCreditEndDate,
  updateSubscriptionQuantity,
  updateSubscriptionSeats,
} from "@app/lib/metronome/client";
import {
  getCreditTypeAwuId,
  getProductFreeCreditId,
  getSeatTypeForProductId,
} from "@app/lib/metronome/constants";
import type { CachedContract } from "@app/lib/metronome/plan_type";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import logger from "@app/logger/logger";
import type { MembershipSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";

// One-shot AWU credit granted to each "free" seat user, drawn against any
// usage-tagged product for events carrying that user's user_id.
const FREE_USER_AWU_CREDITS_AMOUNT = 300;
// Metronome caps credit end dates, so we anchor 5 years out from now rather
// than a fixed far-future bound.
const FREE_USER_AWU_CREDITS_DURATION_YEARS = 5;

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

  // Initialize a bucket for every seat type that has a subscription on the
  // contract, so seat types with zero current memberships still drive a sync
  // (e.g. draining a Pro Seat subscription to 0 when the last "pro" member
  // moves to "max").
  const sIdsBySeatType = new Map<MembershipSeatType, string[]>();
  for (const { seatType } of seatSubscriptions) {
    sIdsBySeatType.set(seatType, []);
  }
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
  // contract — these will not be billed. "free" is intentionally excluded
  // (free seats never contribute to any quantity, per the function contract).
  const coveredSeatTypes = new Set(
    seatSubscriptions.map(({ seatType }) => seatType)
  );
  for (const [seatType, sIds] of sIdsBySeatType) {
    if (seatType === "free" || coveredSeatTypes.has(seatType)) {
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

  // Grant the one-shot free AWU credit to every "free" seat member that
  // doesn't already have one. Failures are logged but don't fail the sync —
  // the call is idempotent and will be retried on the next sync.
  const freeUserIds = sIdsBySeatType.get("free") ?? [];
  for (const userId of freeUserIds) {
    const ensureResult = await ensureFreeUserAwuCredit({
      workspace,
      userId,
    });
    if (ensureResult.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          userId,
          error: ensureResult.error,
        },
        "[Metronome] Failed to ensure free user credit"
      );
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

/**
 * Ensure a one-shot AWU free credit exists for a "free" seat user on the
 * given workspace. Idempotent — checks for an existing credit via its
 * uniqueness key before attempting to create.
 *
 * The credit is scoped to events carrying the user's `user_id` (via a
 * presentation specifier) and to any usage-tagged product. Workspaces without
 * a Metronome customer id are no-ops.
 */
export async function ensureFreeUserAwuCredit({
  workspace,
  userId,
  amountAwu = FREE_USER_AWU_CREDITS_AMOUNT,
}: {
  workspace: LightWorkspaceType;
  userId: string;
  amountAwu?: number;
}): Promise<Result<{ creditId: string | null; created: boolean }, Error>> {
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return new Ok({ creditId: null, created: false });
  }

  // Stable per (workspace, user) — used both as uniqueness key (server-side
  // idempotency) and as the lookup key for the pre-create existence check.
  const uniquenessKey = `free-user-credit-${workspace.sId}-${userId}`;
  const now = new Date();
  const startingAt = now.toISOString();
  const endingBeforeDate = new Date(now);
  endingBeforeDate.setUTCFullYear(
    endingBeforeDate.getUTCFullYear() + FREE_USER_AWU_CREDITS_DURATION_YEARS
  );
  const endingBefore = endingBeforeDate.toISOString();

  const existing = await findMetronomeCreditByUniquenessKey({
    metronomeCustomerId,
    uniquenessKey,
    coveringDate: startingAt,
  });
  if (existing.isErr()) {
    return new Err(existing.error);
  }
  if (existing.value) {
    logger.info(
      {
        workspaceId: workspace.sId,
        userId,
        metronomeCreditId: existing.value.id,
      },
      "[Metronome] Free user credit already exists, skipping create"
    );
    return new Ok({ creditId: existing.value.id, created: false });
  }

  const createResult = await createMetronomeCredit({
    metronomeCustomerId,
    productId: getProductFreeCreditId(),
    creditTypeId: getCreditTypeAwuId(),
    amount: amountAwu,
    startingAt,
    endingBefore,
    name: `Free credits for user ${userId}`,
    idempotencyKey: uniquenessKey,
    priority: 50,
    specifiers: [
      {
        presentation_group_values: { user_id: userId },
        product_tags: ["usage"],
      },
    ],
  });
  if (createResult.isErr()) {
    return new Err(createResult.error);
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      userId,
      metronomeCreditId: createResult.value?.id,
      amountAwu,
    },
    "[Metronome] Free user credit created"
  );
  return new Ok({ creditId: createResult.value?.id ?? null, created: true });
}

/**
 * Void any one-shot free AWU credit previously granted to this user. Called
 * when a user transitions out of the "free" seat type — the unused balance is
 * not transferable, so we cut the access end date to now. No-op if no
 * matching credit exists or the workspace is not Metronome-billed.
 */
export async function voidFreeUserAwuCredit({
  workspace,
  userId,
}: {
  workspace: LightWorkspaceType;
  userId: string;
}): Promise<Result<{ creditId: string | null; voided: boolean }, Error>> {
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return new Ok({ creditId: null, voided: false });
  }

  const uniquenessKey = `free-user-credit-${workspace.sId}-${userId}`;
  const now = new Date();
  const nowIso = now.toISOString();
  // Metronome requires end dates on hour boundaries. Ceil to the next hour
  // rather than floor: flooring would push the end into the past and
  // retroactively invalidate already-consumed usage from earlier in the
  // current hour. Ceiling keeps prior consumption intact at the cost of a
  // sub-hour window where the credit remains usable.
  const accessEndingBefore = ceilToHourISO(now);

  const existing = await findMetronomeCreditByUniquenessKey({
    metronomeCustomerId,
    uniquenessKey,
    coveringDate: nowIso,
  });
  if (existing.isErr()) {
    return new Err(existing.error);
  }
  if (!existing.value) {
    return new Ok({ creditId: null, voided: false });
  }

  const updateResult = await updateMetronomeCreditEndDate({
    metronomeCustomerId,
    creditId: existing.value.id,
    accessEndingBefore,
  });
  if (updateResult.isErr()) {
    return new Err(updateResult.error);
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      userId,
      metronomeCreditId: existing.value.id,
      accessEndingBefore,
    },
    "[Metronome] Free user credit voided"
  );
  return new Ok({ creditId: existing.value.id, voided: true });
}

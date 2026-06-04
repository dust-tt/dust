import {
  getMetronomeContractById,
  getMetronomeSubscriptionAssignedSeatIds,
  getMetronomeSubscriptionSeatState,
  updateSubscriptionQuantity,
  updateSubscriptionSeats,
} from "@app/lib/metronome/client";
import type { CachedContract } from "@app/lib/metronome/plan_type";
import {
  getAwuAllocationForSeatType,
  getDefaultSeatTypeForContract,
  getProductSeatTypes,
  getSeatSubscriptionsFromContract,
  getSeatTypeForSubscription,
  isMauContract,
} from "@app/lib/metronome/seat_types";
import type { BillingFrequency } from "@app/lib/metronome/types";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { SeatLimit } from "@app/lib/resources/workspace_seat_limit_resource";
import { WorkspaceSeatLimitResource } from "@app/lib/resources/workspace_seat_limit_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  bestEffortInvalidateCacheWithRedis,
  cacheWithRedis,
} from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type { MembershipSeatType } from "@app/types/memberships";
import { isMembershipSeatType } from "@app/types/memberships";
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
 * Per-user seat-type change request. Used as input to `classifySeatChange`.
 *
 * `pendingScheduledChange` is the existing future-dated row for this user
 * (if any). It influences the classifier's output: re-selecting one's
 * current seat with a pending change pending → `cancelled`.
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
 * Result returned by `classifySeatChange`. Tells the caller what DB state to
 * write next:
 *
 * - `noop`: no change required.
 * - `cancelled`: a previously-scheduled change should be cancelled (caller
 *   drops its DB future row via `cancelScheduledSeatChange`).
 * - `immediate`: the user should be moved to `newSeatType` right now (caller
 *   updates the active row in place via `updateMembershipSeat`; if a pending
 *   future row exists it should be cancelled first).
 * - `deferred`: the transition should be scheduled at `at` (caller calls
 *   `scheduleSeatChange`, which already replaces any pending future row).
 *
 * Once the DB is in the desired state, the caller invokes `syncSeatCount`
 * to reconcile Metronome with the DB.
 */
export type SeatChangeOutcome =
  | { kind: "noop" }
  | { kind: "cancelled" }
  | { kind: "immediate" }
  | { kind: "deferred"; at: Date };

/**
 * Pure classifier. Decides what DB write the caller should make, based on
 * the contract's allocations and any existing pending future change. Does
 * not call Metronome; reconciliation is `syncSeatCount`'s job.
 *
 * Branches:
 * - Same seat as current: `cancelled` if a pending future change exists,
 *   else `noop`.
 * - New allocation ≥ previous: `immediate` (the user gains/keeps access
 *   right away).
 * - New allocation < previous: `deferred` at the next billing-period start
 *   so the user keeps the richer access through the period they already
 *   paid for. Returns `undefined` when the contract has no next billing
 *   period to anchor the deferred transition to.
 */
export function classifySeatChange({
  contract,
  productSeatTypes,
  change,
}: {
  contract: CachedContract;
  productSeatTypes: Map<string, MembershipSeatType>;
  change: SeatChangeRequest;
}): SeatChangeOutcome | undefined {
  const { previousSeatType, newSeatType, pendingScheduledChange } = change;

  // Selecting the current seat. Either a no-op or — if there's a pending
  // future change — a cancellation of that pending change.
  if (previousSeatType === newSeatType) {
    return pendingScheduledChange ? { kind: "cancelled" } : { kind: "noop" };
  }

  const previousAllocation = getAwuAllocationForSeatType(
    contract,
    previousSeatType,
    productSeatTypes
  );
  const newAllocation = getAwuAllocationForSeatType(
    contract,
    newSeatType,
    productSeatTypes
  );
  if (newAllocation >= previousAllocation) {
    return { kind: "immediate" };
  }

  // Downgrade — defer to the start of the next billing period so the user
  // keeps the richer access they've already paid for. Billing-period
  // boundaries aren't anchored to midnight on the contract, so ceil to
  // midnight UTC to match how the invoice timestamp is displayed.
  const nextStartingAt = (contract.subscriptions ?? [])
    .map((s) => s.billing_periods?.next?.starting_at)
    .find((d) => d !== undefined);
  if (!nextStartingAt) {
    return undefined;
  }
  const date = new Date(nextStartingAt);
  const floored = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const at =
    floored.getTime() < date.getTime()
      ? new Date(floored.getTime() + 24 * 60 * 60 * 1000)
      : floored;
  return { kind: "deferred", at };
}

/**
 * Resolve the seat type a membership should move to on `contract`, per the
 * remap policy when switching contracts:
 *  - keep the current type if the contract still bills it;
 *  - if the current type is monthly and the contract bills its yearly
 *    equivalent (`<type>_yearly`), convert to yearly;
 *  - otherwise fall back to the contract's default tier (no `free`).
 *
 * Returns `undefined` when no target is resolvable (caller leaves the
 * membership untouched).
 */
export function resolveRemappedSeatType(
  currentSeatType: MembershipSeatType,
  contract: CachedContract,
  productSeatTypes: Map<string, MembershipSeatType>
): MembershipSeatType | undefined {
  const onContract = new Set(
    getSeatSubscriptionsFromContract(contract, productSeatTypes).keys()
  );
  if (onContract.has(currentSeatType)) {
    return currentSeatType;
  }
  if (!currentSeatType.endsWith("_yearly")) {
    const yearly = `${currentSeatType}_yearly`;
    if (isMembershipSeatType(yearly) && onContract.has(yearly)) {
      return yearly;
    }
  }
  return getDefaultSeatTypeForContract(contract, productSeatTypes, {
    useFreeSeat: false,
  });
}

/**
 * Remap existing memberships' seat types to the seat types billed by
 * `contract`, so that after a contract switch no membership ends up on a seat
 * type the new contract doesn't bill (which would leave it unbilled). Called
 * from `provisionMetronomeContract` BEFORE the seat sync, so the sync
 * reconciles the new contract against the remapped memberships.
 *
 * Timing follows the switch:
 *  - immediate switch (`swapAt === "current-hour"`): the seat type is updated
 *    in place now;
 *  - future switch: the change is scheduled at `startingAt` — the active row
 *    keeps the old seat type (the current contract keeps billing correctly)
 *    and a future row flips at `startingAt`, which the seat sync picks up as a
 *    future segment on the new contract.
 *
 * No-op for memberships already on a covered seat type. A membership with no
 * resolvable `UserResource` is logged and skipped; a DB error while applying a
 * change throws (internal error → 500), so the operator knows the remap was
 * incomplete rather than a member being silently left on an unbilled seat.
 */
export async function remapMembershipSeatTypesForContract({
  metronomeCustomerId,
  contractId,
  workspace,
  swapAt,
  startingAt,
  contract,
}: {
  metronomeCustomerId: string;
  contractId: string;
  workspace: LightWorkspaceType;
  swapAt: "current-hour" | "next-hour";
  startingAt: Date;
  contract?: CachedContract;
}): Promise<Result<undefined, Error>> {
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
  const onContract = getSeatSubscriptionsFromContract(
    resolvedContract,
    productSeatTypes
  );
  logger.info(
    {
      workspaceId: workspace.sId,
      contractId,
      swapAt,
      startingAt: startingAt.toISOString(),
      contractSeatTypes: [...onContract.keys()],
      contractProductIds: (resolvedContract.subscriptions ?? []).map(
        (s) => s.subscription_rate.product.id
      ),
      productSeatTypeMapSize: productSeatTypes.size,
    },
    "[Metronome][remap] Resolved contract seat types"
  );
  // Non-seat contracts (e.g. MAU / legacy) have no seat types to remap to.
  if (onContract.size === 0) {
    logger.info(
      { workspaceId: workspace.sId, contractId },
      "[Metronome][remap] No seat types on contract — skipping remap"
    );
    return new Ok(undefined);
  }

  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
  });
  logger.info(
    {
      workspaceId: workspace.sId,
      contractId,
      membershipCount: memberships.length,
      currentSeatTypes: memberships.map((m) => m.seatType),
    },
    "[Metronome][remap] Active memberships to consider"
  );
  if (memberships.length === 0) {
    return new Ok(undefined);
  }

  // `updateMembershipSeat` / `scheduleSeatChange` need a `UserResource`; the
  // membership only carries the user attributes. Batch-fetch them.
  const users = await UserResource.fetchByModelIds(
    memberships.map((m) => m.userId)
  );
  const userByModelId = new Map(users.map((u) => [u.id, u]));

  // Apply immediately when the contract already started — either the operator
  // swapped at the current hour, or backdated the start to the past. Scheduling
  // a seat change at a past timestamp would retroactively close the current row
  // and create one that any membership added since the backdated start already
  // supersedes (so the remap would silently no-op). A genuinely future start is
  // the only case that schedules.
  const applyImmediately =
    swapAt === "current-hour" || startingAt.getTime() <= Date.now();

  for (const membership of memberships) {
    const user = userByModelId.get(membership.userId);
    if (!user) {
      logger.warn(
        {
          workspaceId: workspace.sId,
          contractId,
          userModelId: membership.userId,
        },
        "[Metronome][remap] No UserResource for membership — skipping"
      );
      continue;
    }
    const target = resolveRemappedSeatType(
      membership.seatType,
      resolvedContract,
      productSeatTypes
    );
    if (!target || target === membership.seatType) {
      logger.info(
        {
          workspaceId: workspace.sId,
          contractId,
          userId: user.sId,
          currentSeatType: membership.seatType,
          target,
        },
        "[Metronome][remap] No seat-type change for membership"
      );
      continue;
    }
    logger.info(
      {
        workspaceId: workspace.sId,
        contractId,
        userId: user.sId,
        previousSeatType: membership.seatType,
        newSeatType: target,
        mode: applyImmediately ? "immediate" : "scheduled",
        scheduledAt: applyImmediately ? null : startingAt.toISOString(),
      },
      "[Metronome][remap] Remapping membership seat type"
    );
    // No try/catch: `updateMembershipSeat` / `scheduleSeatChange` are internal
    // methods, so we don't catch our own errors (a DB failure throws → 500,
    // surfacing that the remap didn't fully apply rather than silently leaving
    // a member on an unbilled seat).
    if (applyImmediately) {
      await membership.updateMembershipSeat({
        user,
        workspace,
        newSeatType: target,
        author: "no-author",
      });
    } else {
      await membership.scheduleSeatChange({
        user,
        workspace,
        newSeatType: target,
        scheduledAt: startingAt,
        author: "no-author",
      });
    }
  }

  return new Ok(undefined);
}

/**
 * Sync the Metronome seat subscription state to the DB. Reads the current
 * active memberships AND any scheduled future memberships, and reconciles
 * Metronome's seat assignments at every relevant timestamp (now + each
 * unique scheduled `startAt`).
 *
 * Always sets the absolute state per subscription — safe against race
 * conditions and idempotent on replay. No knowledge of specific seat-type
 * names is baked in: adding a new tier flows through as long as its
 * product carries the `DUST_SEAT_TYPE` custom field.
 *
 * Deferred transitions are written to Metronome with a future `starting_at`;
 * Metronome flips the segment automatically when the date is reached, so no
 * scheduler is required on our side. Re-running this sync at any point is
 * a no-op once Metronome and DB agree.
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
}: {
  metronomeCustomerId: string;
  contractId: string;
  workspace: LightWorkspaceType;
  // Forced `starting_at` for the "now" reconciliation. Most callers leave it
  // undefined (uses Metronome's default, i.e. immediately). Scheduled future
  // segments always use their own `startAt` regardless of this value.
  startingAt?: string;
  contract?: CachedContract;
}): Promise<Result<undefined, Error>> {
  let didMutateSeatData = false;

  try {
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
    // Only entitled seat subscriptions are billable. Every seat product exists
    // on every (non-legacy) contract, but setting a quantity on a non-entitled
    // subscription bills nothing — so `getSeatSubscriptionsFromContract` keeps
    // only the entitled ones (and all of them on legacy contracts that don't
    // express seat entitlement). A membership left on a non-entitled seat is
    // then treated the same as one whose subscription is absent: skipped here
    // and surfaced in the "not covered" warning below.
    const seatSubscriptions = [
      ...getSeatSubscriptionsFromContract(resolvedContract, productSeatTypes),
    ].flatMap(([seatType, sub]) => (sub.id ? [{ sub, seatType }] : []));

    if (seatSubscriptions.length === 0) {
      logger.warn(
        { workspaceId: workspace.sId, contractId },
        "[Metronome] No seat subscription found on contract — cannot sync seats"
      );
      return new Err(new Error("No seat subscription found on contract"));
    }

    // Read current + future DB state. Future memberships are scheduled seat
    // transitions: each row has `startAt > now` and represents the seat
    // type the user will be on from `startAt` forward. The companion "current"
    // row (with `endAt = startAt`) still appears in `getActiveMemberships`.
    const [{ memberships: activeMemberships }, futureMemberships, seatLimits] =
      await Promise.all([
        MembershipResource.getActiveMemberships({ workspace }),
        MembershipResource.getScheduledFutureMemberships({ workspace }),
        // Per-seat-type min/max configuration (only `minSeats` today). Used to
        // clamp the count sent to Metronome up to the configured floor.
        WorkspaceSeatLimitResource.fetchByWorkspace({ workspace }),
      ]);

    // userSId → current seat type (the seat they are on right now).
    const currentSeatByUserSId = new Map<string, MembershipSeatType>();
    for (const m of activeMemberships) {
      const userSId = m.user?.sId;
      if (userSId) {
        currentSeatByUserSId.set(userSId, m.seatType);
      }
    }

    type ScheduledChange = {
      userSId: string;
      newSeatType: MembershipSeatType;
      at: Date;
    };
    const scheduledChanges: ScheduledChange[] = [];
    for (const m of futureMemberships) {
      const userSId = m.user?.sId;
      if (userSId) {
        scheduledChanges.push({
          userSId,
          newSeatType: m.seatType,
          at: m.startAt,
        });
      }
    }

    // Surface memberships whose seat type has no matching entitled subscription
    // on the contract (absent, or present but not entitled) — those users will
    // not be billed.
    const coveredSeatTypes = new Set(
      seatSubscriptions.map(({ seatType }) => seatType)
    );
    const uncoveredUsersBySeatType = new Map<MembershipSeatType, string[]>();
    for (const [userSId, seatType] of currentSeatByUserSId) {
      if (!coveredSeatTypes.has(seatType)) {
        const bucket = uncoveredUsersBySeatType.get(seatType) ?? [];
        bucket.push(userSId);
        uncoveredUsersBySeatType.set(seatType, bucket);
      }
    }
    for (const [seatType, userSIds] of uncoveredUsersBySeatType) {
      logger.warn(
        {
          workspaceId: workspace.sId,
          contractId,
          seatType,
          memberCount: userSIds.length,
          userIds: userSIds,
        },
        "[Metronome] Memberships with seat type not covered by any entitled contract subscription — they will not be billed"
      );
    }

    // Reconcile each DISTINCT effective moment exactly once: the base moment
    // (the contract start `startingAt`, or now for an immediate sync) plus
    // every scheduled-change moment, deduped and in ascending order (so we
    // never overwrite a later segment with an earlier one). The base moment
    // often coincides with a scheduled remap (a future switch schedules the
    // remap at the contract start); deduping prevents reconciling that segment
    // twice, which would double-apply the unassigned-seat floor.
    const baseMs = startingAt ? Date.parse(startingAt) : Date.now();
    const effectiveTimestampsMs = Array.from(
      new Set([baseMs, ...scheduledChanges.map((c) => c.at.getTime())])
    ).sort((a, b) => a - b);

    // Compute the desired seat type per user at a given timestamp, by walking
    // scheduled changes from earliest up to (and including) `tMs`.
    const seatTypeAt = (
      userSId: string,
      tMs: number
    ): MembershipSeatType | undefined => {
      let seatType = currentSeatByUserSId.get(userSId);
      for (const c of scheduledChanges) {
        if (c.userSId === userSId && c.at.getTime() <= tMs) {
          seatType = c.newSeatType;
        }
      }
      return seatType;
    };

    // Returns desired sIds for `subSeatType` at `tMs`. Includes users whose
    // currently-active row maps to `subSeatType` AND who have not (yet)
    // scheduled themselves off it by `tMs`, plus users who scheduled
    // themselves onto it.
    const allUserSIds = new Set<string>([
      ...currentSeatByUserSId.keys(),
      ...scheduledChanges.map((c) => c.userSId),
    ]);
    const desiredSIdsAt = (
      subSeatType: MembershipSeatType,
      tMs: number
    ): string[] => {
      const sIds: string[] = [];
      for (const userSId of allUserSIds) {
        if (seatTypeAt(userSId, tMs) === subSeatType) {
          sIds.push(userSId);
        }
      }
      return sIds;
    };

    for (const { sub, seatType } of seatSubscriptions) {
      const subscriptionId = sub.id!;
      const quantityMode = sub.quantity_management_mode ?? "QUANTITY_ONLY";
      const seatLimit = seatLimits.get(seatType);

      if (quantityMode === "SEAT_BASED") {
        // One reconcile per distinct effective moment. `desiredSIds` is
        // evaluated at the SAME moment the segment is written to — so a future
        // contract start reflects the membership state at the start (post-remap)
        // rather than "now".
        for (const tMs of effectiveTimestampsMs) {
          const isImmediateBase = tMs === baseMs && !startingAt;
          // Immediate base sync: let Metronome default to "now" for both the
          // write (`starting_at`) and the read (`covering_date`). Any other
          // moment (forced start or a scheduled change) pins to that instant.
          const segmentStartingAt = isImmediateBase
            ? undefined
            : new Date(tMs).toISOString();
          const coveringDate = isImmediateBase ? undefined : new Date(tMs);
          const result = await reconcileSeatBasedSegment({
            metronomeCustomerId,
            contractId,
            subscriptionId,
            seatType,
            desiredSIds: desiredSIdsAt(seatType, tMs),
            seatLimit,
            startingAt: segmentStartingAt,
            coveringDate,
            workspaceId: workspace.sId,
          });
          if (result.isErr()) {
            return new Err(result.error);
          }
          didMutateSeatData = didMutateSeatData || result.value;
        }
      } else {
        // QUANTITY_ONLY: only sync the "now" total. Scheduled changes within
        // a quantity-only seat tier are not modeled — they're rare in practice
        // (free / unlimited tiers) and Metronome doesn't bill them per-seat.
        const actualQuantity = desiredSIdsAt(seatType, Date.now()).length;
        // Clamp up to the configured billing floor: below `minSeats` we still
        // bill the floor.
        const quantity = clampSeatCountToMin(actualQuantity, seatLimit);
        logger.info(
          {
            workspaceId: workspace.sId,
            contractId,
            subscriptionId,
            seatType,
            actualQuantity,
            quantity,
            minSeats: seatLimit?.minSeats,
          },
          quantity !== actualQuantity
            ? "[Metronome] Updating seat quantity (clamped up to configured min)"
            : "[Metronome] Updating seat quantity"
        );
        const updateResult = await updateSubscriptionQuantity({
          metronomeCustomerId,
          contractId,
          subscriptionId,
          quantity,
          startingAt,
        });
        if (updateResult.isErr()) {
          return new Err(updateResult.error);
        }
        didMutateSeatData = true;
      }
    }

    return new Ok(undefined);
  } finally {
    if (didMutateSeatData) {
      await invalidateCachedSeatDataByUserId({
        metronomeCustomerId,
        contractId,
      });
    }
  }
}

/**
 * Clamp a seat count up to the configured `minSeats` billing floor. Counts at
 * or above the floor (or with no limit configured) are returned unchanged.
 */
function clampSeatCountToMin(
  count: number,
  seatLimit: SeatLimit | undefined
): number {
  return seatLimit ? Math.max(count, seatLimit.minSeats) : count;
}

/**
 * Reconcile one SEAT_BASED segment for a single subscription. Reads the
 * current assignment from Metronome at `coveringDate` (defaults to now) and
 * applies only the delta. Idempotent against repeated invocations.
 *
 * When a `minSeats` floor is configured and fewer real users are assigned than
 * the floor, the shortfall is added as *unassigned* seats so the contracted
 * minimum is still billed. The unassigned count is reconciled to the exact
 * desired value (added or removed) so repeated runs converge.
 */
async function reconcileSeatBasedSegment({
  metronomeCustomerId,
  contractId,
  subscriptionId,
  seatType,
  desiredSIds,
  seatLimit,
  startingAt,
  coveringDate,
  workspaceId,
}: {
  metronomeCustomerId: string;
  contractId: string;
  subscriptionId: string;
  seatType: MembershipSeatType;
  desiredSIds: string[];
  seatLimit?: SeatLimit;
  startingAt?: string;
  coveringDate?: Date;
  workspaceId: string;
}): Promise<Result<boolean, Error>> {
  const currentResult = await getMetronomeSubscriptionSeatState({
    metronomeCustomerId,
    contractId,
    subscriptionId,
    coveringDate,
  });
  if (currentResult.isErr()) {
    return new Err(currentResult.error);
  }
  const { assignedSeatIds, unassignedSeats: currentUnassigned } =
    currentResult.value;

  const desired = new Set(desiredSIds);
  const current = new Set(assignedSeatIds);
  const addSeatIds = desiredSIds.filter((id) => !current.has(id));
  const removeSeatIds = assignedSeatIds.filter((id) => !desired.has(id));

  // Top up to the `minSeats` floor with unassigned seats when fewer real users
  // are assigned than the floor.
  const desiredUnassigned = Math.max(
    0,
    (seatLimit?.minSeats ?? 0) - desiredSIds.length
  );

  // Metronome auto-fills unassigned seats when seat IDs are added: each added
  // seat consumes one unassigned seat (total quantity unchanged) before
  // increasing the total. So by the time our explicit unassigned delta is
  // applied, the unassigned pool is already reduced by the number of seats we
  // assign in this same edit (floored at 0). Reconcile against that post-fill
  // baseline, NOT the raw current count — otherwise we'd double-count by both
  // letting Metronome auto-fill AND explicitly removing/adding a seat, which is
  // what caused the unassigned pool to balloon on every sync.
  // (`removeSeatIds` decrease the total quantity rather than returning seats to
  // the unassigned pool, so they don't affect this baseline.)
  const unassignedAfterAutoFill = Math.max(
    0,
    currentUnassigned - addSeatIds.length
  );
  const addUnassignedSeats = Math.max(
    0,
    desiredUnassigned - unassignedAfterAutoFill
  );
  const removeUnassignedSeats = Math.max(
    0,
    unassignedAfterAutoFill - desiredUnassigned
  );

  // Snapshot of the current vs. desired seat state, logged on every reconcile
  // (including no-ops) so the assigned/unassigned/total counts are always
  // visible when debugging billing discrepancies.
  const currentAssigned = assignedSeatIds.length;
  const desiredAssigned = desiredSIds.length;
  const seatStateLog = {
    workspaceId,
    contractId,
    subscriptionId,
    seatType,
    minSeats: seatLimit?.minSeats,
    currentAssigned,
    currentUnassigned,
    currentTotal: currentAssigned + currentUnassigned,
    desiredAssigned,
    desiredUnassigned,
    desiredTotal: desiredAssigned + desiredUnassigned,
    startingAt,
  };

  if (
    addSeatIds.length === 0 &&
    removeSeatIds.length === 0 &&
    addUnassignedSeats === 0 &&
    removeUnassignedSeats === 0
  ) {
    logger.info(
      seatStateLog,
      "[Metronome] Seat-based subscription already in sync — no changes"
    );
    return new Ok(false);
  }

  logger.info(
    {
      ...seatStateLog,
      addCount: addSeatIds.length,
      removeCount: removeSeatIds.length,
      unassignedAfterAutoFill,
      addUnassignedSeats,
      removeUnassignedSeats,
    },
    "[Metronome] Updating seat-based subscription assignments"
  );

  const updateResult = await updateSubscriptionSeats({
    metronomeCustomerId,
    contractId,
    fromSubscriptionId: subscriptionId,
    addSeatIds,
    removeSeatIds,
    addUnassignedSeats,
    removeUnassignedSeats,
    startingAt,
  });
  if (updateResult.isErr()) {
    return new Err(updateResult.error);
  }
  return new Ok(true);
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
 * Returns an Err on any contract or seat-ID fetch failure.
 */
export async function buildSeatDataByUserId({
  metronomeCustomerId,
  contractId,
}: {
  metronomeCustomerId: string;
  contractId: string;
}): Promise<Result<Map<string, SeatData>, Error>> {
  const contractResult = await getMetronomeContractById({
    metronomeCustomerId,
    metronomeContractId: contractId,
  });
  if (contractResult.isErr()) {
    logger.warn(
      { error: contractResult.error, metronomeCustomerId, contractId },
      "[Metronome] Failed to fetch contract"
    );
    return new Err(contractResult.error);
  }

  const contract = contractResult.value;
  const subscriptions = contract.subscriptions ?? [];
  const productSeatTypes = await getProductSeatTypes();

  const results = await concurrentExecutor(
    subscriptions,
    async (sub) => {
      if (sub.quantity_management_mode !== "SEAT_BASED" || !sub.id) {
        return new Ok(null);
      }
      const seatType = getSeatTypeForSubscription(sub, productSeatTypes);
      if (!seatType) {
        return new Ok(null);
      }
      const awuAllocation = getAwuAllocationForSeatType(
        contract,
        seatType,
        productSeatTypes
      );
      if (awuAllocation === 0) {
        return new Ok(null);
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
        return new Err(seatIdsResult.error);
      }

      const freq = sub.subscription_rate.billing_frequency;
      return new Ok({
        seatIds: seatIdsResult.value,
        awuAllocation,
        billingFrequency: freq === "MONTHLY" || freq === "ANNUAL" ? freq : null,
      });
    },
    { concurrency: 10 }
  );

  const seatDataByUserId = new Map<string, SeatData>();
  for (const result of results) {
    if (result.isErr()) {
      return new Err(result.error);
    }
    const subSeatData = result.value;
    if (subSeatData) {
      for (const seatId of subSeatData.seatIds) {
        seatDataByUserId.set(seatId, {
          awuAllocation: subSeatData.awuAllocation,
          billingFrequency: subSeatData.billingFrequency,
        });
      }
    }
  }

  return new Ok(seatDataByUserId);
}

const SEAT_DATA_CACHE_TTL_MS = 60 * 1000;

const seatDataCacheResolver = ({
  metronomeCustomerId,
  contractId,
}: {
  metronomeCustomerId: string;
  contractId: string;
}) => `${metronomeCustomerId}-${contractId}`;

async function fetchSeatDataRecord(args: {
  metronomeCustomerId: string;
  contractId: string;
}): Promise<Record<string, SeatData>> {
  const seatDataResult = await buildSeatDataByUserId(args);
  // Throw at the cache boundary so a transient fetch failure is not cached.
  if (seatDataResult.isErr()) {
    throw seatDataResult.error;
  }
  return Object.fromEntries(seatDataResult.value);
}

export const getCachedSeatDataByUserId = cacheWithRedis(
  fetchSeatDataRecord,
  seatDataCacheResolver,
  { ttlMs: SEAT_DATA_CACHE_TTL_MS }
);

const invalidateCachedSeatDataByUserId = bestEffortInvalidateCacheWithRedis(
  fetchSeatDataRecord,
  seatDataCacheResolver,
  "members-usage seat data"
);

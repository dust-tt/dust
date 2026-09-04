import {
  clearPerUserCreditBalanceAlerts,
  upsertPerUserCreditBalanceAlerts,
} from "@app/lib/metronome/alerts/per_user_credit_balance";
import type { SubscriptionSeatState } from "@app/lib/metronome/client";
import {
  addPerUserCreditToCustomer,
  adjustSeatCreditBalances,
  findSeatCreditSegmentForPeriod,
  getMetronomeContractById,
  getMetronomeSeatActiveSince,
  getMetronomeSubscriptionSeatState,
  listCustomerPerUserCreditIds,
  listCustomerPerUserCreditUserIds,
  listMetronomeSeatBalances,
  revokePerUserCustomerCredit,
  updateSubscriptionQuantity,
  updateSubscriptionSeats,
} from "@app/lib/metronome/client";
import {
  AWU_PRIORITY_FREE_SEAT_CREDIT,
  CONTRACT_CREDIT_TYPE_FREE_SEAT,
  FREE_SEAT_LIFETIME_AWU_CREDITS,
  getCreditTypeAwuId,
  getProductSeatSubscriptionCreditsId,
  toFreeMetronomeUserId,
} from "@app/lib/metronome/constants";
import type { CachedContract } from "@app/lib/metronome/plan_type";
import {
  getAwuAllocationForSeatType,
  getNextSeatCreditRenewalDate,
  getProductSeatTypes,
  getSeatSubscriptionsFromContract,
  getSeatTypeForSubscription,
  isMauContract,
} from "@app/lib/metronome/seat_types";
import {
  FREE_SEAT_CREDIT_NAME,
  MAX_SEAT_CREDIT_NAME,
  PRO_SEAT_CREDIT_NAME,
  USAGE_TAG,
} from "@app/lib/metronome/setup_common";
import type {
  BillingFrequency,
  MetronomeSeatBalance,
} from "@app/lib/metronome/types";
import { isCreditPricedPlanPrefix } from "@app/lib/plans/plan_codes";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { SeatLimit } from "@app/lib/resources/workspace_seat_limit_resource";
import { WorkspaceSeatLimitResource } from "@app/lib/resources/workspace_seat_limit_resource";
import { heartbeat } from "@app/lib/temporal";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  bestEffortInvalidateCacheWithRedis,
  cacheWithRedisResult,
} from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type { MembershipSeatType } from "@app/types/memberships";
import {
  isMembershipSeatType,
  isPaidSeatType,
  SEAT_TYPE_ORDER,
} from "@app/types/memberships";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
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
type SeatChangeRequest = {
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
type SeatChangeOutcome =
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
 * - `free` → `none`: `immediate`. A `free` seat carries no renewing, already-paid
 *   allowance to preserve, so removing it takes effect right away.
 * - Monthly → yearly switch (a monthly paid seat moving to a yearly cadence,
 *   e.g. `pro` → `pro_yearly` or `pro` → `max_yearly`): `deferred`, even when
 *   the target tier is higher. Committing to annual billing takes effect at
 *   the end of the current period, never mid-period.
 * - New allocation ≥ previous (and not the monthly→yearly case above):
 *   `immediate` (the user gains/keeps access right away).
 * - New allocation < previous: `deferred` to the next time the previous
 *   seat's AWU allowance renews, so the user keeps the richer access through
 *   the allowance they already paid for. Returns `undefined` when no renewal
 *   (or billing-period) date can be resolved to anchor the deferral.
 */
export function classifySeatChange({
  contract,
  productSeatTypes,
  change,
  now,
}: {
  contract: CachedContract;
  productSeatTypes: Map<string, MembershipSeatType>;
  change: SeatChangeRequest;
  now: Date;
}): SeatChangeOutcome | undefined {
  const { previousSeatType, newSeatType, pendingScheduledChange } = change;

  // Selecting the current seat. Either a no-op or — if there's a pending
  // future change — a cancellation of that pending change.
  if (previousSeatType === newSeatType) {
    return pendingScheduledChange ? { kind: "cancelled" } : { kind: "noop" };
  }

  // `free` → `none`: remove the seat immediately. A free seat carries a
  // one-shot allocation with no renewing, already-paid allowance to preserve,
  // so there's nothing to defer to — the member drops to no seat right away.
  // (The `free` tier is one-shot: once removed it can't be re-granted, which
  // `updateMembershipSeatAndTrack` enforces separately.)
  if (previousSeatType === "free" && newSeatType === "none") {
    return { kind: "immediate" };
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
  // A monthly→yearly switch commits the seat to annual billing. That
  // commitment must never take effect mid-period — even when the target tier
  // is higher (which the allocation comparison below would otherwise apply
  // immediately) — so it is deferred to the end of the current period, exactly
  // like a downgrade. Only a monthly paid seat can switch to yearly; adding a
  // yearly seat from `free`/`none` is a fresh subscription and stays immediate.
  const isMonthlyToYearlySwitch =
    isPaidSeatType(previousSeatType) &&
    !previousSeatType.endsWith("_yearly") &&
    newSeatType.endsWith("_yearly");

  // Keep or gain allowance — takes effect right away, unless it is the
  // monthly→yearly commitment above. This also covers removing a seat that
  // carried no allowance (e.g. workspace seats: 0 >= 0): there's nothing
  // already paid for to preserve, so the removal is immediate.
  if (newAllocation >= previousAllocation && !isMonthlyToYearlySwitch) {
    return { kind: "immediate" };
  }

  // Deferred: either losing allowance (downgrade, or removal of a seat that had
  // allowance) or a monthly→yearly switch. Defer until the previous seat's AWU
  // allowance next renews, so the user keeps the allowance they've already paid
  // for until it would have refreshed anyway. The renewal cadence is the
  // credit's `recurrence_frequency` (MONTHLY in new pricing, even for
  // annually-billed seats — see `getNextSeatCreditRenewalDate`), which is
  // independent of the billing period.
  //
  // Defensive: the previous seat is credit-bearing in the common case (`free` →
  // `none` is handled above as a no-op), but if the credit's recurrence can't
  // be resolved (e.g. a zero-allowance `workspace` seat switching to
  // `workspace_yearly`), fall back to the next billing-period start rather than
  // failing the change.
  const creditRenewalAt = getNextSeatCreditRenewalDate({
    contract,
    seatType: previousSeatType,
    productSeatTypes,
    now,
  });
  const fallbackNextStartingAt = (contract.subscriptions ?? [])
    .map((s) => s.billing_periods?.next?.starting_at)
    .find((d) => d !== undefined);
  const renewalAt =
    creditRenewalAt ??
    (fallbackNextStartingAt ? new Date(fallbackNextStartingAt) : undefined);
  if (!renewalAt) {
    return undefined;
  }

  // `renewalAt` is already the exact instant the allowance refreshes — no
  // rounding needed.
  return { kind: "deferred", at: renewalAt };
}

/**
 * Resolve the seat type a membership should move to on `contract`, per the
 * remap policy when switching contracts:
 *  - keep the current type if the contract still bills it;
 *  - if the current type is monthly and the contract bills its yearly
 *    equivalent (`<type>_yearly`), convert to yearly; conversely, if the
 *    current type is yearly and the contract bills only the monthly equivalent,
 *    convert to monthly;
 *  - otherwise delegate to `getDefaultSeatTypeForContract` (committed seat →
 *    free → none), using the caller-supplied `isReturningMember`,
 *    `seatLimits`, and `seatCounts`.
 *
 * `isReturningMember` defaults to `true` (conservative). Pass `false` only
 * when the user never held a real seat in this workspace (all prior rows had
 * `seatType = "none"`), allowing the fallback to assign `free`.
 *
 * Free-seat workspace caps (`freeSeatCounts` / `freeSeatLimits`) are not
 * checked here — those caps gate new-member creation, not contract remaps.
 */
export function resolveRemappedSeatType(
  currentSeatType: MembershipSeatType,
  contract: CachedContract,
  productSeatTypes: Map<string, MembershipSeatType>,
  { seatLimits }: { seatLimits?: Map<MembershipSeatType, SeatLimit> } = {}
): MembershipSeatType {
  const onContract = new Set(
    getSeatSubscriptionsFromContract(contract, productSeatTypes).keys()
  );
  // `free` is kept when the new contract still offers it; otherwise it lapses
  // to `none` (one-shot grant that doesn't transfer across contracts).
  if (currentSeatType === "free") {
    return onContract.has("free") ? "free" : "none";
  }
  // For paid seats, find the closest equivalent on the new contract.
  // `none` stays `none` (no seat to preserve).
  if (currentSeatType !== "none") {
    const currentOrder = SEAT_TYPE_ORDER[currentSeatType];
    // Candidates: seats on the contract at or above the user's current tier.
    const candidates = [...onContract].filter(
      (s) => s !== "none" && s !== "free" && SEAT_TYPE_ORDER[s] >= currentOrder
    );
    // Committed seats (`minSeats > 0`) take priority — they represent what the
    // workspace explicitly signed up for.
    const committed = candidates.filter(
      (s) => (seatLimits?.get(s)?.minSeats ?? 0) > 0
    );
    const pool = committed.length > 0 ? committed : candidates;
    if (pool.length > 0) {
      // Within the pool, prefer: same type > billing-frequency counterpart
      // (monthly↔yearly) > cheapest remaining (stable sort by name).
      if (pool.includes(currentSeatType)) {
        return currentSeatType;
      }
      const counterpart = currentSeatType.endsWith("_yearly")
        ? currentSeatType.slice(0, -"_yearly".length)
        : `${currentSeatType}_yearly`;
      if (isMembershipSeatType(counterpart) && pool.includes(counterpart)) {
        return counterpart;
      }
      return pool.sort(
        (a, b) => SEAT_TYPE_ORDER[a] - SEAT_TYPE_ORDER[b] || a.localeCompare(b)
      )[0];
    }
  }
  return "none";
}

const PROMOTABLE_SEAT_TYPES: ReadonlySet<MembershipSeatType> = new Set([
  "pro",
  "pro_yearly",
  "workspace",
  "workspace_yearly",
]);

/**
 * Promote `none` seat types onto paid seats the contract bills.
 *
 * `forceSeatType` (used by a legacy contract migration) preempts the committed
 * placement entirely: when set — and the contract bills it — EVERY `none` member
 * is moved straight onto it. This is how a migration puts all seat-less members
 * on a paid seat (e.g. `pro`), regardless of any committed allocation the
 * contract might have.
 *
 * Without `forceSeatType`, `none` members are placed into committed paid seats
 * (`minSeats > 0`) with spare capacity, in ascending tier order — a committed
 * seat is billed whether or not it is assigned, so filling it adds no cost. This
 * committed promotion is all-or-nothing: if a `none` member can't be placed, no
 * member is promoted (the input is returned unchanged), so we never bill a
 * partial set.
 */
export function promoteNoneSeatTypesForContract({
  contract,
  productSeatTypes,
  seatTypes,
  seatLimits,
  forceSeatType,
}: {
  contract: CachedContract;
  productSeatTypes: Map<string, MembershipSeatType>;
  seatTypes: MembershipSeatType[];
  seatLimits?: Map<MembershipSeatType, SeatLimit>;
  // Seat type to force every `none` member onto, preempting the committed-seat
  // placement below. Used by the legacy→Business migration to put `workspace`/
  // `none` members on `pro`. Ignored unless the contract bills it.
  forceSeatType?: MembershipSeatType;
}): MembershipSeatType[] {
  const onContract = new Set(
    getSeatSubscriptionsFromContract(contract, productSeatTypes).keys()
  );

  // A forced seat preempts committed placement: move every `none` straight onto
  // it, provided the contract bills it.
  if (forceSeatType && onContract.has(forceSeatType)) {
    return seatTypes.map((seatType) =>
      seatType === "none" ? forceSeatType : seatType
    );
  }

  const committedPaidSeatTypes = [...onContract]
    .filter(
      (seatType) =>
        PROMOTABLE_SEAT_TYPES.has(seatType) &&
        (seatLimits?.get(seatType)?.minSeats ?? 0) > 0
    )
    .sort(
      (a, b) => SEAT_TYPE_ORDER[a] - SEAT_TYPE_ORDER[b] || a.localeCompare(b)
    );

  const assignedBySeatType = new Map<MembershipSeatType, number>();
  for (const seatType of seatTypes) {
    if (seatType !== "none") {
      assignedBySeatType.set(
        seatType,
        (assignedBySeatType.get(seatType) ?? 0) + 1
      );
    }
  }
  const remainingBySeatType = new Map<MembershipSeatType, number>();
  for (const seatType of committedPaidSeatTypes) {
    const minSeats = seatLimits?.get(seatType)?.minSeats ?? 0;
    remainingBySeatType.set(
      seatType,
      Math.max(0, minSeats - (assignedBySeatType.get(seatType) ?? 0))
    );
  }

  const result = [...seatTypes];
  for (let i = 0; i < result.length; i++) {
    if (result[i] !== "none") {
      continue;
    }
    const target = committedPaidSeatTypes.find(
      (seatType) => (remainingBySeatType.get(seatType) ?? 0) > 0
    );
    if (!target) {
      return [...seatTypes];
    }
    remainingBySeatType.set(target, (remainingBySeatType.get(target) ?? 0) - 1);
    result[i] = target;
  }
  return result;
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
 * Members landing on `none` are then promoted into any committed paid seat the
 * new contract still has spare capacity for (see
 * `promoteNoneSeatTypesForContract`): a committed seat is billed whether or not
 * it is assigned, so filling it with an otherwise seat-less member adds no cost.
 *
 * When `promoteNoneSeatType` is set, every member that would otherwise stay on
 * `none` is instead forced onto that seat type (provided the new contract bills
 * it) — this preempts the committed-spare promotion above. It is how a legacy
 * contract migration puts every member on a paid seat (e.g. `pro` for a monthly
 * switch, `pro_yearly` for a yearly one).
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
  promoteNoneSeatType,
}: {
  metronomeCustomerId: string;
  contractId: string;
  workspace: LightWorkspaceType;
  swapAt: "current-hour" | "next-hour";
  startingAt: Date;
  contract?: CachedContract;
  // Seat type that every `none` member is forced onto, preempting the
  // committed-spare promotion (see `promoteNoneSeatTypesForContract`). Used by
  // the legacy→Business migration to force `workspace`/`none` members onto `pro`.
  promoteNoneSeatType?: MembershipSeatType;
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
      currentSeatTypes: [...new Set(memberships.map((m) => m.seatType))],
    },
    "[Metronome][remap] Active memberships to consider"
  );
  if (memberships.length === 0) {
    return new Ok(undefined);
  }

  // Apply immediately when the contract already started — either the operator
  // swapped at the current hour, or backdated the start to the past. Scheduling
  // a seat change at a past timestamp would retroactively close the current row
  // and create one that any membership added since the backdated start already
  // supersedes (so the remap would silently no-op). A genuinely future start is
  // the only case that schedules.
  const applyImmediately =
    swapAt === "current-hour" || startingAt.getTime() <= Date.now();

  // When scheduling (not applying immediately), a member already correctly
  // scheduled from a previous call must be detected here: `scheduleSeatChange`
  // never touches the *active* row's `seatType` (it only closes that row and
  // creates a separate future-dated one), so comparing against the active
  // row alone can never see a prior schedule — every not-yet-migrated member
  // would otherwise be re-scheduled (a full destroy+update+create) on every
  // single call to this function, for as long as their change stays pending.
  const [users, seatLimits, scheduledByUserId] = await Promise.all([
    UserResource.fetchByModelIds(memberships.map((m) => m.userId)),
    WorkspaceSeatLimitResource.fetchByWorkspace({ workspace }),
    applyImmediately
      ? Promise.resolve(new Map<ModelId, MembershipResource>())
      : MembershipResource.getScheduledMembershipsByUserIdInWorkspace({
          workspace,
          userIds: memberships.map((m) => m.userId),
        }),
  ]);
  const userByModelId = new Map(users.map((u) => [u.id, u]));

  const remapTargets = memberships.flatMap((membership) => {
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
      return [];
    }
    return [
      {
        membership,
        user,
        baseTarget: resolveRemappedSeatType(
          membership.seatType,
          resolvedContract,
          productSeatTypes,
          { seatLimits }
        ),
      },
    ];
  });

  const promotedTargets = promoteNoneSeatTypesForContract({
    contract: resolvedContract,
    productSeatTypes,
    seatTypes: remapTargets.map((t) => t.baseTarget),
    seatLimits,
    forceSeatType: promoteNoneSeatType,
  });

  for (const [
    index,
    { membership, user, baseTarget },
  ] of remapTargets.entries()) {
    const target = promotedTargets[index];
    const existingSchedule = scheduledByUserId.get(membership.userId);
    const alreadyScheduled =
      !applyImmediately &&
      existingSchedule?.seatType === target &&
      existingSchedule.startAt.getTime() === startingAt.getTime();
    if (target === membership.seatType || alreadyScheduled) {
      continue;
    }
    logger.info(
      {
        workspaceId: workspace.sId,
        contractId,
        userId: user.sId,
        previousSeatType: membership.seatType,
        newSeatType: target,
        promotedFromNone: baseTarget === "none" && target !== "none",
        mode: applyImmediately ? "immediate" : "scheduled",
        scheduledAt: applyImmediately ? null : startingAt.toISOString(),
      },
      "[Metronome][remap] Remapping membership seat type"
    );
    // No try/catch: `updateMembershipSeat` / `scheduleSeatChange` are internal
    // methods — a DB failure throws → 500, surfacing that the remap didn't
    // fully apply rather than silently leaving a member on an unbilled seat.
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

    await heartbeat();
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
// The free seat AWU grant is anchored on per-seat first-appearance, not on a
// recurring schedule: a recurring INDIVIDUAL credit either refills every period
// or closes its issuance window, so it can't grant "once per seat, ever,
// whenever the seat is assigned". Instead we grant a standalone customer credit
// scoped to the user via a `user_id` presentation specifier, idempotent on
// (workspaceId, userId). Customer credits survive contract transitions
// automatically — no carry-over needed, no expiry.
//
// `syncSeatCount` runs on every membership change and reconciles full state, so
// it calls this for ALL currently-free users on each sync. We first list the
// customer's existing per-user credits and skip users already granted — so a
// steady-state sync makes a single read instead of one API call per free user.
// The grant's `uniqueness_key` still guards against double-granting on the race
// between the read and a concurrent sync (a 409 returns `Ok(null)`). Listing
// includes archived credits so a past grant is not re-issued. This self-heals a
// grant that failed on a previous sync. Best-effort: a failure is logged but
// never fails (and retries) the seat reconciliation.
async function grantFreeSeatCredits({
  metronomeCustomerId,
  workspaceId,
  userIds,
  alreadyAssignedFreeUserIds,
  startingAt,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
  userIds: string[];
  alreadyAssignedFreeUserIds: Set<string>;
  startingAt: Date;
}): Promise<void> {
  if (userIds.length === 0) {
    return;
  }

  // Skip users that already have a credit. On a read failure we fall back to
  // attempting every user — the grant is still idempotent via its uniqueness
  // key, so we never double-grant, only make redundant (no-op) API calls.
  const alreadyGranted = await listCustomerPerUserCreditUserIds({
    metronomeCustomerId,
    contractCreditType: CONTRACT_CREDIT_TYPE_FREE_SEAT,
  });
  if (alreadyGranted.isErr()) {
    logger.warn(
      { workspaceId, error: alreadyGranted.error },
      "[Metronome] Could not list existing free seat credits; attempting all grants (idempotent)"
    );
  }
  const grantedUserIds = alreadyGranted.isOk()
    ? alreadyGranted.value
    : new Set<string>();
  // `listCustomerPerUserCreditUserIds` returns plain (normalized) sIds, so
  // compare directly — no need to re-derive the free-prefixed form.
  const toGrant = userIds.filter((userId) => !grantedUserIds.has(userId));

  // Grant the credit only for users that don't have one yet.
  await concurrentExecutor(
    toGrant,
    async (userId) => {
      const freeMetronomeId = toFreeMetronomeUserId(userId);
      const result = await addPerUserCreditToCustomer({
        metronomeCustomerId,
        productId: getProductSeatSubscriptionCreditsId(),
        creditTypeId: getCreditTypeAwuId(),
        contractCreditType: CONTRACT_CREDIT_TYPE_FREE_SEAT,
        amount: FREE_SEAT_LIFETIME_AWU_CREDITS,
        userId: freeMetronomeId,
        productTags: [USAGE_TAG],
        startingAt,
        name: `${FREE_SEAT_CREDIT_NAME} ${userId}`,
        priority: AWU_PRIORITY_FREE_SEAT_CREDIT,
        // Workspace+user scoped: customer credits survive across contracts, so
        // there is no need to scope per-contract. A given user in a workspace
        // gets exactly one lifetime free credit regardless of contract changes.
        uniquenessKey: `free-seat-credit:${workspaceId}:${userId}`,
      });
      if (result.isErr()) {
        logger.error(
          { workspaceId, userId, error: result.error },
          "[Metronome] Failed to grant free seat credit"
        );
      }
      await heartbeat();
    },
    { concurrency: 4 }
  );

  // Ensure the per-user credit-balance alerts for newly-free users — they
  // drive each user's low-balance / capped transitions as they deplete the
  // credit (the seat-balance alert can't, since this isn't a seat balance).
  // Scoped to users Metronome doesn't already show as assigned to the free
  // subscription: checking every current free user on every sync (this runs
  // on every membership change) doesn't scale, and — like the ex-free-seat
  // revoke check — a user whose alert setup was missed here is low-stakes and
  // self-corrects (e.g. the next time their seat type actually changes).
  // Best-effort: a failure is logged but not retried until the next sync.
  const newlyFreeUserIds = userIds.filter(
    (userId) => !alreadyAssignedFreeUserIds.has(userId)
  );
  await concurrentExecutor(
    newlyFreeUserIds,
    async (userId) => {
      const alertResult = await upsertPerUserCreditBalanceAlerts({
        metronomeCustomerId,
        workspaceId,
        userId: toFreeMetronomeUserId(userId),
        allowanceAwu: FREE_SEAT_LIFETIME_AWU_CREDITS,
      });
      if (alertResult.isErr()) {
        logger.error(
          { workspaceId, userId, error: alertResult.error },
          "[Metronome] Failed to upsert per-user free credit alerts"
        );
      }
      await heartbeat();
    },
    { concurrency: 4 }
  );
}

// Revoke free-seat credits for users who once had one but are no longer on a
// free seat (e.g. upgraded to pro): end the credit early so it stops drawing
// against their usage, and drop its low/empty alerts. The grant's uniqueness key
// is untouched so the user can never re-claim the same credit. Best-effort; runs
// each sync.
async function revokeFreeSeatCreditsForExFreeUsers({
  metronomeCustomerId,
  workspaceId,
  currentFreeUserIds,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
  currentFreeUserIds: Set<string>;
}): Promise<void> {
  // Only credit ids are needed here (to revoke) — not balances, which
  // Metronome computes for every credit and makes the listing meaningfully
  // heavier.
  const activeCreditsResult = await listCustomerPerUserCreditIds({
    metronomeCustomerId,
    contractCreditType: CONTRACT_CREDIT_TYPE_FREE_SEAT,
  });
  if (activeCreditsResult.isErr()) {
    logger.warn(
      { workspaceId, error: activeCreditsResult.error },
      "[Metronome] Could not list per-user credits to revoke; skipping"
    );
    return;
  }
  // `activeCreditsResult` is already keyed by the plain sId regardless of
  // whether the credit was stored under the old (plain) or new
  // (free-prefixed) format — `listCustomerPerUserCreditIds` normalizes both,
  // and it was already scoped to `CONTRACT_CREDIT_TYPE_FREE_SEAT`, so every
  // entry here is a free-seat credit. Anyone not in `currentFreeUserIds` is
  // no longer free and should be revoked.
  const toRevoke = [...activeCreditsResult.value.entries()].filter(
    ([userId]) => !currentFreeUserIds.has(userId)
  );
  if (toRevoke.length === 0) {
    return;
  }

  await concurrentExecutor(
    toRevoke,
    async ([userId, creditIds]) => {
      for (const creditId of creditIds) {
        const revokeResult = await revokePerUserCustomerCredit({
          metronomeCustomerId,
          creditId,
        });
        if (revokeResult.isErr()) {
          logger.error(
            { workspaceId, userId, creditId, error: revokeResult.error },
            "[Metronome] Failed to revoke ex-free-seat credit"
          );
        }
      }
      // Alerts are created with the free-prefixed user id (see
      // `grantFreeSeatCredits`'s `upsertPerUserCreditBalanceAlerts` call) —
      // must clear with the same form or `clearMetronomeAlert` targets a
      // uniqueness key that was never created.
      const clearResult = await clearPerUserCreditBalanceAlerts({
        metronomeCustomerId,
        workspaceId,
        userId: toFreeMetronomeUserId(userId),
      });
      if (clearResult.isErr()) {
        logger.error(
          { workspaceId, userId, error: clearResult.error },
          "[Metronome] Failed to clear ex-free-seat credit alerts"
        );
      }
      await heartbeat();
    },
    { concurrency: 4 }
  );
}

/**
 * The recurring per-seat AWU credit name for a seat type, or `null` when the
 * seat type has no recurring seat credit to transfer between:
 *  - `workspace`/`workspace_yearly`/`none`: no per-seat allowance;
 *  - `free`: its allowance is a one-shot per-user credit (archived on upgrade,
 *    see `revokeFreeSeatCreditsForExFreeUsers`), not a recurring seat credit.
 *
 * Monthly and yearly variants of a tier share the same credit name (they share
 * the recurring-credit definition — see `buildPerSeatCredits`).
 */
export function getSeatCreditNameForSeatType(
  seatType: MembershipSeatType
): string | null {
  switch (seatType) {
    case "pro":
    case "pro_yearly":
      return PRO_SEAT_CREDIT_NAME;
    case "max":
    case "max_yearly":
      return MAX_SEAT_CREDIT_NAME;
    case "free":
    case "workspace":
    case "workspace_yearly":
    case "none":
      return null;
    default:
      assertNever(seatType);
  }
}

type SeatCreditTransfer = {
  userSId: string;
  oldSeatType: MembershipSeatType;
  newSeatType: MembershipSeatType;
  oldCreditName: string;
  newCreditName: string;
  // Remaining (unconsumed) balance on the old seat credit — emptied from it.
  remaining: number;
  // Amount already consumed on the old seat credit — carried onto the new one.
  consumed: number;
};

/**
 * Pure detection of seat-credit transfers needed to align ledgers after
 * immediate moves between two recurring-credit seats (e.g. `pro` → `max`).
 *
 * A transfer is needed when a user is still assigned to one allowance seat in
 * Metronome but the DB has already moved them to a different allowance seat.
 * The caller then empties the old credit's unused balance (`remaining`, when
 * positive) and reconciles the new one to `allocation − consumed`, so the move
 * carries usage over instead of resetting it — e.g. 2000/8000 used on `pro`
 * becomes 2000/40000 used on `max` (remaining 6000 → 38000). This holds even
 * when the origin is fully consumed: 8000/8000 on `pro` becomes 8000/40000 on
 * `max` (remaining 0 → 32000), NOT a fresh 40000 on top of the 8000 already
 * spent (which would let the user spend 48000).
 *
 * Idempotency does NOT come from the origin balance — it comes from two other
 * places: once the sync reassigns the user to the new seat,
 * `metronomeSeatByUser` matches `desiredSeatByUser` and no transfer is
 * detected; and the destination adjustment reconciles to an absolute target
 * (`allocation − consumed`), so re-running before the reassignment propagates
 * converges to the same balance rather than double-debiting.
 *
 * Also covers same-allowance moves between billing frequencies (e.g. `max` →
 * `max_yearly`): they share a credit name but are distinct recurring credits,
 * so the consumed amount still carries from one pool to the other.
 */
export function computeSeatCreditTransfers({
  metronomeSeatByUser,
  desiredSeatByUser,
  balanceByUser,
  allocationBySeatType,
}: {
  metronomeSeatByUser: Map<string, MembershipSeatType>;
  desiredSeatByUser: Map<string, MembershipSeatType>;
  // The seat's remaining AWU balance (aggregate across its credit pools; after
  // prior origins are emptied this equals the current tier's balance).
  balanceByUser: Map<string, number>;
  // The origin tier's per-seat AWU allocation. Consumption is derived from this
  // (allocation − remaining), NOT from the seat's aggregate starting balance —
  // that aggregate includes prior tiers we emptied to zero, which would be
  // mis-counted as consumption (e.g. emptied pro's 8000 inflating a max→yearly
  // transfer).
  allocationBySeatType: Map<MembershipSeatType, number>;
}): SeatCreditTransfer[] {
  const transfers: SeatCreditTransfer[] = [];
  for (const [userSId, oldSeatType] of metronomeSeatByUser) {
    const newSeatType = desiredSeatByUser.get(userSId);
    if (!newSeatType || newSeatType === oldSeatType) {
      continue;
    }
    const oldCreditName = getSeatCreditNameForSeatType(oldSeatType);
    const newCreditName = getSeatCreditNameForSeatType(newSeatType);
    // Both ends must be recurring-credit seats. (Distinct seat types always map
    // to distinct recurring credits, even when they share a credit name — the
    // transfer targets credits by id, not name.)
    if (!oldCreditName || !newCreditName) {
      continue;
    }
    const remaining = balanceByUser.get(userSId);
    // No balance reading for this user → we can't derive how much was consumed,
    // so skip rather than guess. A zero or negative (overdrawn) balance is NOT
    // skipped: a fully-consumed origin is exactly when the consumed amount must
    // be carried onto the new seat — otherwise the new seat keeps its full fresh
    // allowance on top of what was already spent.
    if (remaining === undefined) {
      continue;
    }
    const allocation = allocationBySeatType.get(oldSeatType);
    if (allocation === undefined) {
      continue;
    }
    transfers.push({
      userSId,
      oldSeatType,
      newSeatType,
      oldCreditName,
      newCreditName,
      remaining,
      consumed: Math.max(0, allocation - remaining),
    });
  }
  return transfers;
}

async function findSeatCreditSegmentCached(
  cache: Map<
    string,
    { creditId: string; segmentId: string; segmentStartingAt: string } | null
  >,
  args: {
    metronomeCustomerId: string;
    metronomeContractId: string;
    recurringCreditId: string;
  }
): Promise<{
  creditId: string;
  segmentId: string;
  segmentStartingAt: string;
} | null> {
  const cached = cache.get(args.recurringCreditId);
  if (cached !== undefined) {
    return cached;
  }
  const res = await findSeatCreditSegmentForPeriod(args);
  const seg = res.isOk() ? res.value : null;
  cache.set(args.recurringCreditId, seg);
  return seg;
}

/**
 * The timestamp at which a per-seat manual ledger entry must be made: a time
 * the seat is provably active AND within the credit segment. Reads the seat's
 * active-segment start from Metronome (seats become active on hour boundaries,
 * a "now" change only from the next boundary) and clamps it up to the credit
 * segment start (the entry must also fall inside the segment). Returns `null`
 * when the seat has no active window to adjust in (caller skips).
 */
async function resolveSeatAdjustmentTimestamp({
  metronomeCustomerId,
  contractId,
  subscriptionId,
  seatId,
  creditSegmentStartingAt,
}: {
  metronomeCustomerId: string;
  contractId: string;
  subscriptionId: string;
  seatId: string;
  creditSegmentStartingAt: string;
}): Promise<Date | null> {
  const activeSinceRes = await getMetronomeSeatActiveSince({
    metronomeCustomerId,
    contractId,
    subscriptionId,
    seatId,
  });
  if (activeSinceRes.isErr() || !activeSinceRes.value) {
    return null;
  }
  // Metronome requires the entry timestamp to be on an hour boundary. Use the
  // later of the seat's active-since and the credit segment start (both already
  // hour-aligned) — the seat is active from there, so it's a valid entry time
  // (matches what the Metronome UI accepts: e.g. 08:00 for a seat whose segment
  // started at 08:00).
  const startMs = Math.max(
    activeSinceRes.value.getTime(),
    new Date(creditSegmentStartingAt).getTime()
  );
  return new Date(startMs);
}

/**
 * Detect users who moved between two recurring-credit seats (Metronome still
 * has them on the old seat, the DB on the new one) and empty their old seat
 * credit. Returns the transfers whose old credit was successfully emptied, so
 * the caller can credit the new seat once it's been assigned. Origins with no
 * unused balance (fully consumed or overdrawn) are returned without an
 * adjustment — there is nothing to reclaim, but their consumed amount is still
 * carried onto the new seat.
 *
 * Runs BEFORE seat reconciliation while the old seat is still assigned: a
 * manual ledger entry requires the seat to be active at the adjustment
 * timestamp. Best-effort: a failure to read or empty one user's credit is
 * logged and that user is left out of the returned list (their new credit is
 * then not debited — the move stays usage-fresh rather than double-charged).
 */
async function emptyOriginSeatCreditsForTransfers({
  metronomeCustomerId,
  contractId,
  workspaceId,
  subscriptionIdBySeatType,
  recurringCreditIdBySeatType,
  allocationBySeatType,
  desiredSeatByUser,
  seatStateBySubscriptionId,
}: {
  metronomeCustomerId: string;
  contractId: string;
  workspaceId: string;
  subscriptionIdBySeatType: Map<MembershipSeatType, string>;
  recurringCreditIdBySeatType: Map<MembershipSeatType, string>;
  allocationBySeatType: Map<MembershipSeatType, number>;
  desiredSeatByUser: Map<string, MembershipSeatType>;
  // Metronome's current ("now") seat state per subscription, fetched once by
  // the caller and shared with its immediate-base reconcile pass instead of
  // querying Metronome twice for the same data.
  seatStateBySubscriptionId: Map<string, SubscriptionSeatState>;
}): Promise<SeatCreditTransfer[]> {
  // Metronome's current seat assignment per user (old state, before sync).
  const metronomeSeatByUser = new Map<string, MembershipSeatType>();
  for (const [seatType, subscriptionId] of subscriptionIdBySeatType) {
    const state = seatStateBySubscriptionId.get(subscriptionId);
    if (!state) {
      continue;
    }
    for (const userSId of state.assignedSeatIds) {
      metronomeSeatByUser.set(userSId, seatType);
    }
  }

  // A real transfer candidate is a user whose seat type is actually changing
  // between two types that both carry a recurring credit (pro/max and their
  // _yearly variants — see `getSeatCreditNameForSeatType`). Balances are only
  // needed to know how much to carry over for a CONFIRMED transfer, so if
  // there are no candidates at all, skip that (expensive, bulk) fetch
  // entirely instead of always fetching the whole eligible population.
  const transferCandidateUserIds = [...metronomeSeatByUser.entries()].flatMap(
    ([userSId, oldSeatType]) => {
      const newSeatType = desiredSeatByUser.get(userSId);
      return newSeatType &&
        newSeatType !== oldSeatType &&
        getSeatCreditNameForSeatType(oldSeatType) &&
        getSeatCreditNameForSeatType(newSeatType)
        ? [userSId]
        : [];
    }
  );
  if (transferCandidateUserIds.length === 0) {
    logger.info(
      { workspaceId, contractId },
      "[Metronome] No seat-type transfer candidates — skipping balance fetch"
    );
    return [];
  }

  const balancesRes = await listMetronomeSeatBalances({
    metronomeCustomerId,
    metronomeContractId: contractId,
    seatIds: transferCandidateUserIds,
  });
  if (balancesRes.isErr()) {
    logger.error(
      { workspaceId, contractId, error: balancesRes.error },
      "[Metronome] Failed to read seat balances for credit transfer — skipping"
    );
    return [];
  }
  const awuCreditTypeId = getCreditTypeAwuId();
  const balanceByUser = new Map<string, number>();
  for (const seat of balancesRes.value) {
    const awu = seat.balances.find((b) => b.credit_type_id === awuCreditTypeId);
    if (awu) {
      balanceByUser.set(seat.seat_id, awu.balance);
    }
  }

  const transfers = computeSeatCreditTransfers({
    metronomeSeatByUser,
    desiredSeatByUser,
    balanceByUser,
    allocationBySeatType,
  });

  const segmentCache = new Map<
    string,
    { creditId: string; segmentId: string; segmentStartingAt: string } | null
  >();
  const emptied: SeatCreditTransfer[] = [];
  for (const t of transfers) {
    await heartbeat();
    // A fully-consumed (or overdrawn) origin has no unused balance to reclaim,
    // so there is nothing to empty — but the consumed amount must still be
    // carried onto the new seat. Keep it in the returned transfers and skip the
    // origin adjustment.
    if (t.remaining <= 0) {
      emptied.push(t);
      continue;
    }
    const recurringCreditId = recurringCreditIdBySeatType.get(t.oldSeatType);
    if (!recurringCreditId) {
      logger.warn(
        { workspaceId, contractId, userId: t.userSId, credit: t.oldCreditName },
        "[Metronome] No recurring credit id for origin seat — skipping transfer"
      );
      continue;
    }
    const seg = await findSeatCreditSegmentCached(segmentCache, {
      metronomeCustomerId,
      metronomeContractId: contractId,
      recurringCreditId,
    });
    if (!seg) {
      logger.error(
        { workspaceId, contractId, userId: t.userSId, credit: t.oldCreditName },
        "[Metronome] No origin seat credit segment for transfer — skipping"
      );
      continue;
    }
    const subscriptionId = subscriptionIdBySeatType.get(t.oldSeatType);
    const timestamp = subscriptionId
      ? await resolveSeatAdjustmentTimestamp({
          metronomeCustomerId,
          contractId,
          subscriptionId,
          seatId: t.userSId,
          creditSegmentStartingAt: seg.segmentStartingAt,
        })
      : null;
    if (!timestamp) {
      logger.warn(
        { workspaceId, contractId, userId: t.userSId, credit: t.oldCreditName },
        "[Metronome] No active window for origin seat — skipping transfer"
      );
      continue;
    }
    logger.info(
      {
        workspaceId,
        contractId,
        userId: t.userSId,
        credit: t.oldCreditName,
        segmentStartingAt: seg.segmentStartingAt,
        adjustmentTimestamp: timestamp.toISOString(),
        amount: -t.remaining,
      },
      "[Metronome] Emptying origin seat credit for transfer"
    );
    const adjustRes = await adjustSeatCreditBalances({
      metronomeCustomerId,
      metronomeContractId: contractId,
      creditId: seg.creditId,
      segmentId: seg.segmentId,
      perSeatAmounts: { [t.userSId]: -t.remaining },
      reason: `Seat change ${t.oldSeatType}→${t.newSeatType}: empty origin credit`,
      timestamp,
      alignToHour: false,
    });
    if (adjustRes.isErr()) {
      logger.error(
        { workspaceId, contractId, userId: t.userSId, error: adjustRes.error },
        "[Metronome] Failed to empty origin seat credit — skipping transfer"
      );
      continue;
    }
    emptied.push(t);
  }
  return emptied;
}

/**
 * Set the new seat credit to its carried balance for each transfer whose origin
 * credit was emptied. Runs AFTER seat reconciliation, once the new seat is
 * assigned (the adjustment requires the seat to be active).
 *
 * The target balance is reconciled to an absolute value — `allocation −
 * consumed` — rather than blindly debited by `consumed`. A manual ledger entry
 * is a delta, so we read the seat's current balance on the new credit (at the
 * adjustment time) and apply the difference. This makes the move idempotent and
 * correctly restores the balance when returning to a credit that was emptied on
 * a previous move (e.g. `max → max_yearly → max`): the destination always ends
 * at `allocation − consumed`, whatever state it was left in. Best-effort.
 */
async function carryConsumptionToNewSeatCredits({
  metronomeCustomerId,
  contractId,
  workspaceId,
  transfers,
  subscriptionIdBySeatType,
  recurringCreditIdBySeatType,
  allocationBySeatType,
}: {
  metronomeCustomerId: string;
  contractId: string;
  workspaceId: string;
  transfers: SeatCreditTransfer[];
  subscriptionIdBySeatType: Map<MembershipSeatType, string>;
  recurringCreditIdBySeatType: Map<MembershipSeatType, string>;
  allocationBySeatType: Map<MembershipSeatType, number>;
}): Promise<void> {
  const awuCreditTypeId = getCreditTypeAwuId();
  const segmentCache = new Map<
    string,
    { creditId: string; segmentId: string; segmentStartingAt: string } | null
  >();
  for (const t of transfers) {
    // Heartbeat at the top of the loop so every iteration is covered
    // regardless of which `continue` branch below it takes — a bulk seat-type
    // change can carry over many users' consumption in one sync.
    await heartbeat();
    const recurringCreditId = recurringCreditIdBySeatType.get(t.newSeatType);
    const targetAllocation = allocationBySeatType.get(t.newSeatType);
    if (!recurringCreditId || targetAllocation === undefined) {
      logger.warn(
        { workspaceId, contractId, userId: t.userSId, credit: t.newCreditName },
        "[Metronome] No recurring credit / allocation for new seat — origin already emptied"
      );
      continue;
    }
    const seg = await findSeatCreditSegmentCached(segmentCache, {
      metronomeCustomerId,
      metronomeContractId: contractId,
      recurringCreditId,
    });
    if (!seg) {
      logger.error(
        { workspaceId, contractId, userId: t.userSId, credit: t.newCreditName },
        "[Metronome] No destination seat credit segment for transfer — origin already emptied"
      );
      continue;
    }
    // The new seat was just assigned (active from the next hour boundary), so
    // adjust at its actual active-window start rather than the current hour.
    const subscriptionId = subscriptionIdBySeatType.get(t.newSeatType);
    const timestamp = subscriptionId
      ? await resolveSeatAdjustmentTimestamp({
          metronomeCustomerId,
          contractId,
          subscriptionId,
          seatId: t.userSId,
          creditSegmentStartingAt: seg.segmentStartingAt,
        })
      : null;
    if (!timestamp) {
      logger.warn(
        { workspaceId, contractId, userId: t.userSId, credit: t.newCreditName },
        "[Metronome] No active window for new seat — origin already emptied"
      );
      continue;
    }

    // Read the seat's current balance on the new credit at the adjustment time,
    // then compute the delta to reach `allocation − consumed`. Queried by
    // explicit seatIds: an unfiltered call silently omits most seats on
    // contracts with a few hundred+ seats.
    const balancesRes = await listMetronomeSeatBalances({
      metronomeCustomerId,
      metronomeContractId: contractId,
      coveringDate: timestamp,
      seatIds: [t.userSId],
    });
    if (balancesRes.isErr()) {
      logger.error(
        {
          workspaceId,
          contractId,
          userId: t.userSId,
          error: balancesRes.error,
        },
        "[Metronome] Failed to read new seat balance for transfer — origin already emptied"
      );
      continue;
    }
    const currentBalance = balancesRes.value
      .find((s) => s.seat_id === t.userSId)
      ?.balances.find((b) => b.credit_type_id === awuCreditTypeId)?.balance;
    if (currentBalance === undefined) {
      logger.warn(
        { workspaceId, contractId, userId: t.userSId, credit: t.newCreditName },
        "[Metronome] New seat balance not found at adjustment time — origin already emptied"
      );
      continue;
    }

    const desiredBalance = Math.max(0, targetAllocation - t.consumed);
    const delta = desiredBalance - currentBalance;
    if (delta === 0) {
      continue;
    }
    logger.info(
      {
        workspaceId,
        contractId,
        userId: t.userSId,
        credit: t.newCreditName,
        adjustmentTimestamp: timestamp.toISOString(),
        currentBalance,
        desiredBalance,
        delta,
      },
      "[Metronome] Setting new seat credit to carried balance"
    );
    const adjustRes = await adjustSeatCreditBalances({
      metronomeCustomerId,
      metronomeContractId: contractId,
      creditId: seg.creditId,
      segmentId: seg.segmentId,
      perSeatAmounts: { [t.userSId]: delta },
      reason: `Seat change ${t.oldSeatType}→${t.newSeatType}: carry over consumed AWU`,
      timestamp,
      alignToHour: false,
    });
    if (adjustRes.isErr()) {
      logger.error(
        { workspaceId, contractId, userId: t.userSId, error: adjustRes.error },
        "[Metronome] Failed to set new seat credit to carried balance"
      );
    }
  }
}

/**
 * Reclaim the origin seat credit's NEXT-period pre-grant after a seat change.
 *
 * Recurring per-seat credits are materialized one period AHEAD: when period N
 * starts, Metronome creates the credit's N+1 segment and grants the origin
 * seat's allocation to whoever is on it. A mid-period origin→new move only
 * empties/carries the CURRENT (N) segment (`emptyOriginSeatCreditsForTransfers`
 * / `carryConsumptionToNewSeatCredits` both read the segment covering "now"), so
 * the origin's N+1 pre-grant survives untouched. When N+1 begins, the user holds
 * that orphaned origin allocation ON TOP of the new seat's allocation — a fresh,
 * no-usage stack (e.g. pro 8000 + max 40000) that needs no sync failure and no
 * stray seat assignment to appear. This empties that pre-grant too.
 *
 * At sync time the N+1 segment holds ONLY the origin pre-grant — the new seat's
 * N+1 grant is created when N+1 actually starts — so we remove the seat's whole
 * N+1 balance, capped at the origin allocation so it can never go negative. That
 * cap also makes it idempotent: once removed, the next read is 0 and the delta
 * is 0. Best-effort; a per-user failure is logged and skipped.
 */
async function emptyOriginNextPeriodCredits({
  metronomeCustomerId,
  contractId,
  workspaceId,
  contract,
  productSeatTypes,
  transfers,
  recurringCreditIdBySeatType,
  allocationBySeatType,
}: {
  metronomeCustomerId: string;
  contractId: string;
  workspaceId: string;
  contract: CachedContract;
  productSeatTypes: Map<string, MembershipSeatType>;
  transfers: SeatCreditTransfer[];
  recurringCreditIdBySeatType: Map<MembershipSeatType, string>;
  allocationBySeatType: Map<MembershipSeatType, number>;
}): Promise<void> {
  const awuCreditTypeId = getCreditTypeAwuId();
  const now = new Date();
  const segmentCache = new Map<
    string,
    { creditId: string; segmentId: string; segmentStartingAt: string } | null
  >();
  for (const t of transfers) {
    await heartbeat();
    const originCreditId = recurringCreditIdBySeatType.get(t.oldSeatType);
    const originAllocation = allocationBySeatType.get(t.oldSeatType);
    if (
      !originCreditId ||
      originAllocation === undefined ||
      originAllocation <= 0
    ) {
      continue;
    }
    // Start of the origin credit's pre-materialized N+1 segment. Undefined for a
    // non-recurring origin (nothing is pre-granted, so nothing to reclaim).
    const nextRenewalAt = getNextSeatCreditRenewalDate({
      contract,
      seatType: t.oldSeatType,
      productSeatTypes,
      now,
    });
    if (!nextRenewalAt) {
      continue;
    }
    // The seat's AWU balance as it will stand at the start of the next period.
    const balancesRes = await listMetronomeSeatBalances({
      metronomeCustomerId,
      metronomeContractId: contractId,
      coveringDate: nextRenewalAt,
      seatIds: [t.userSId],
    });
    if (balancesRes.isErr()) {
      logger.error(
        { workspaceId, contractId, userId: t.userSId, error: balancesRes.error },
        "[Metronome] Failed to read next-period seat balance — skipping"
      );
      continue;
    }
    const nextBalance = balancesRes.value
      .find((s) => s.seat_id === t.userSId)
      ?.balances.find((b) => b.credit_type_id === awuCreditTypeId)?.balance;
    if (nextBalance === undefined || nextBalance <= 0) {
      continue;
    }
    const amount = Math.min(originAllocation, nextBalance);
    const segKey = `${originCreditId}:${nextRenewalAt.toISOString()}`;
    let seg = segmentCache.get(segKey);
    if (seg === undefined) {
      const segRes = await findSeatCreditSegmentForPeriod({
        metronomeCustomerId,
        metronomeContractId: contractId,
        recurringCreditId: originCreditId,
        coveringDate: nextRenewalAt,
      });
      seg = segRes.isOk() ? segRes.value : null;
      segmentCache.set(segKey, seg);
    }
    if (!seg) {
      logger.warn(
        {
          workspaceId,
          contractId,
          userId: t.userSId,
          credit: t.oldCreditName,
          nextRenewalAt: nextRenewalAt.toISOString(),
        },
        "[Metronome] No next-period origin segment — skipping next-period empty"
      );
      continue;
    }
    logger.info(
      {
        workspaceId,
        contractId,
        userId: t.userSId,
        credit: t.oldCreditName,
        segmentStartingAt: seg.segmentStartingAt,
        adjustmentTimestamp: nextRenewalAt.toISOString(),
        amount: -amount,
      },
      "[Metronome] Emptying origin seat credit for transfer (next period)"
    );
    const adjustRes = await adjustSeatCreditBalances({
      metronomeCustomerId,
      metronomeContractId: contractId,
      creditId: seg.creditId,
      segmentId: seg.segmentId,
      perSeatAmounts: { [t.userSId]: -amount },
      reason: `Seat change ${t.oldSeatType}→${t.newSeatType}: empty origin credit (next period)`,
      timestamp: nextRenewalAt,
      alignToHour: false,
    });
    if (adjustRes.isErr()) {
      logger.error(
        { workspaceId, contractId, userId: t.userSId, error: adjustRes.error },
        "[Metronome] Failed to empty next-period origin seat credit"
      );
    }
  }
}

// Summary of the work `syncSeatCount` actually did, surfaced up to the poke
// plugin so an operator can see what happened without digging through logs.
export type SyncSeatCountSummary = {
  seatSubscriptionCount: number;
  distinctTimestampCount: number;
  reconcileSegmentCallCount: number;
  transferCount: number;
  freeUserCount: number;
  didMutateSeatData: boolean;
  durationMs: number;
};

function emptySyncSeatCountSummary(startedAt: number): SyncSeatCountSummary {
  return {
    seatSubscriptionCount: 0,
    distinctTimestampCount: 0,
    reconcileSegmentCallCount: 0,
    transferCount: 0,
    freeUserCount: 0,
    didMutateSeatData: false,
    durationMs: Date.now() - startedAt,
  };
}

export async function syncSeatCount({
  metronomeCustomerId,
  contractId,
  workspace,
  planCode,
  startingAt,
  contract,
  assumeEmptySeats,
  forceFreeCreditRevokeCheck,
}: {
  metronomeCustomerId: string;
  contractId: string;
  workspace: LightWorkspaceType;
  planCode: string;
  // Forced `starting_at` for the "now" reconciliation. Most callers leave it
  // undefined (uses Metronome's default, i.e. immediately). Scheduled future
  // segments always use their own `startAt` regardless of this value.
  startingAt?: string;
  contract?: CachedContract;
  // Skip the per-subscription seat-state reads and treat every segment as
  // empty. Only safe for a freshly provisioned contract (no prior assignments)
  // — passed by switchContract when the contract was newly created.
  assumeEmptySeats?: boolean;
  // Run the (expensive) ex-free-seat credit revoke check unconditionally,
  // instead of only when Metronome's "free" seat assignment list shows
  // someone moved away from free. Used by the poke "Sync Metronome Seat
  // Count" plugin, where an operator explicitly asked for a thorough pass —
  // not by the debounced/automatic sync, which relies on the cheap gate.
  forceFreeCreditRevokeCheck?: boolean;
}): Promise<Result<SyncSeatCountSummary, Error>> {
  let didMutateSeatData = false;
  const syncStartedAt = Date.now();
  logger.info(
    { workspaceId: workspace.sId, contractId, planCode, startingAt },
    "[Metronome] syncSeatCount starting"
  );

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

    if (!(await hasContractSeatSubscription(resolvedContract))) {
      logger.info(
        { workspaceId: workspace.sId, contractId },
        "[Metronome] syncSeatCount skipped — contract has no seat subscription"
      );
      return new Ok(emptySyncSeatCountSummary(syncStartedAt));
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
    const [
      { memberships: activeMemberships },
      futureMemberships,
      seatLimitSchedule,
    ] = await Promise.all([
      MembershipResource.getActiveMemberships({ workspace }),
      MembershipResource.getScheduledFutureMemberships({ workspace }),
      // Per-seat-type min/max configuration over time: the active segment plus
      // any scheduled-future changes. Used to clamp the count sent to Metronome
      // up to the configured floor at each effective moment.
      WorkspaceSeatLimitResource.fetchScheduleByWorkspace({ workspace }),
    ]);

    // TODO(pricing): Remove this + planCode param once we have no more shadow legacy contracts
    const legacy = !isCreditPricedPlanPrefix(planCode);

    // userSId → current seat type (the seat they are on right now).
    //
    // Only count memberships that are active in the same sense as the Stripe
    // seat count (`getMembersCountForWorkspace({ activeOnly: true })`): the seat
    // window is open AND `firstUsedAt` is set. This excludes provisioned members
    // who have never used the workspace, so Metronome and Stripe bill the same
    // set of seats.
    const currentSeatByUserSId = new Map<string, MembershipSeatType>();
    for (const m of activeMemberships) {
      const userSId = m.user?.sId;
      if (userSId && m.firstUsedAt !== null) {
        currentSeatByUserSId.set(userSId, m.seatType);
      }
    }

    type ScheduledChange = {
      userId: string;
      newSeatType: MembershipSeatType;
      at: Date;
    };
    const scheduledChanges: ScheduledChange[] = [];
    for (const m of futureMemberships) {
      const userId = m.user?.sId;
      // Same `firstUsedAt` filter as the current-seat map above: a scheduled
      // change carries the current row's `firstUsedAt` (see `scheduleSeatChange`),
      // so provisioned-but-never-used members (SCIM on enterprise contracts) are
      // scheduled by contract switches / migrations yet must stay uncounted, just
      // like Stripe. Without this the future segment would re-introduce them.
      if (userId && m.firstUsedAt !== null) {
        scheduledChanges.push({
          userId,
          newSeatType: m.seatType,
          at: m.startAt,
        });
      }
    }

    // Grouped by user so `seatTypeAt` below doesn't rescan every scheduled
    // change in the workspace for every user at every timestamp — with
    // `seatSubscriptions.length * effectiveTimestampsMs.length` calls each
    // walking all `users`, an unindexed scan over all `scheduledChanges` made
    // the whole reconcile loop O(subs * timestamps * users * scheduledChanges),
    // quadratic in workspace size whenever most users have a pending change
    // (e.g. mid-migration). Sorted ascending per user so `seatTypeAt` can walk
    // forward and stop at the first change past `tMs`.
    const scheduledChangesByUserId = new Map<string, ScheduledChange[]>();
    for (const change of scheduledChanges) {
      const existing = scheduledChangesByUserId.get(change.userId);
      if (existing) {
        existing.push(change);
      } else {
        scheduledChangesByUserId.set(change.userId, [change]);
      }
    }
    for (const changes of scheduledChangesByUserId.values()) {
      changes.sort((a, b) => a.at.getTime() - b.at.getTime());
    }

    // Surface memberships whose seat type has no matching entitled subscription
    // on the contract (absent, or present but not entitled) — those users will
    // not be billed.
    const coveredSeatTypes = new Set(
      seatSubscriptions.map(({ seatType }) => seatType)
    );
    const uncoveredUsersBySeatType = new Map<MembershipSeatType, string[]>();
    for (const [userSId, seatType] of currentSeatByUserSId) {
      // `none` is intentionally unbilled — skip silently.
      if (seatType === "none") {
        continue;
      }
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
    const nowMs = Date.now();
    // Scheduled seat-limit (commitment) change moments: every future segment
    // start is an effective date where the committed floor changes, so Metronome
    // must be programmed with the new quantity from that instant — even if no
    // membership changes at the same moment.
    const seatLimitChangeMs: number[] = [];
    for (const segments of seatLimitSchedule.values()) {
      for (const seg of segments) {
        if (seg.startAt.getTime() > nowMs) {
          seatLimitChangeMs.push(seg.startAt.getTime());
        }
      }
    }
    const effectiveTimestampsMs = Array.from(
      new Set([
        baseMs,
        ...scheduledChanges.map((c) => c.at.getTime()),
        ...seatLimitChangeMs,
      ])
    ).sort((a, b) => a - b);
    logger.info(
      {
        workspaceId: workspace.sId,
        contractId,
        seatSubscriptionCount: seatSubscriptions.length,
        scheduledChangeCount: scheduledChanges.length,
        distinctTimestampCount: effectiveTimestampsMs.length,
        expectedSegmentReconcileCalls:
          seatSubscriptions.length * effectiveTimestampsMs.length,
      },
      "[Metronome] Reconcile plan computed"
    );

    // The seat limit (min/max) effective for `seatType` at `tMs`, walking its
    // scheduled segments. Undefined when no limit applies at that moment.
    const seatLimitAt = (
      seatType: MembershipSeatType,
      tMs: number
    ): SeatLimit | undefined => {
      const segments = seatLimitSchedule.get(seatType);
      if (!segments) {
        return undefined;
      }
      for (const seg of segments) {
        if (
          seg.startAt.getTime() <= tMs &&
          (seg.endAt === null || seg.endAt.getTime() > tMs)
        ) {
          return { minSeats: seg.minSeats, maxSeats: seg.maxSeats };
        }
      }
      return undefined;
    };

    // Compute the desired seat type per user at a given timestamp, by walking
    // that user's own scheduled changes (ascending) from earliest up to (and
    // including) `tMs`.
    const seatTypeAt = (
      userSId: string,
      tMs: number
    ): MembershipSeatType | undefined => {
      let seatType = currentSeatByUserSId.get(userSId);
      const changes = scheduledChangesByUserId.get(userSId);
      if (changes) {
        for (const c of changes) {
          if (c.at.getTime() > tMs) {
            break;
          }
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
      ...scheduledChanges.map((c) => c.userId),
    ]);
    const desiredSIdsAt = (
      subSeatType: MembershipSeatType,
      tMs: number
    ): string[] => {
      const sIds: string[] = [];
      for (const userSId of allUserSIds) {
        const userSeatType = seatTypeAt(userSId, tMs);
        // On legacy contracts, "none" members are Platform Seat members that
        // predate the seat system — count them alongside explicit "workspace" seats.
        const match = userSeatType === subSeatType || legacy;
        if (match) {
          sIds.push(userSId);
        }
      }
      return sIds;
    };

    // Align seat-credit ledgers for immediate moves between two recurring-credit
    // seats (e.g. `pro` → `max`): carry the consumed AWU onto the new seat's
    // credit instead of resetting it. Only for the immediate "now" sync — a
    // forced `startingAt` is a contract switch / future remap, where seat
    // credits are reconciled by the new contract rather than transferred.
    //
    // Split around the seat loop because a manual ledger entry requires the
    // seat to be active at the adjustment timestamp: the old seat is emptied
    // here (still assigned), the new one credited after it's been assigned.
    // subscriptionId per recurring-credit seat type (pro/max families), used by
    // the credit-transfer steps below to resolve each seat's active window.
    const subscriptionIdBySeatType = new Map<MembershipSeatType, string>(
      seatSubscriptions.flatMap(({ sub, seatType }) =>
        sub.id && getSeatCreditNameForSeatType(seatType)
          ? [[seatType, sub.id] as const]
          : []
      )
    );
    // The recurring credit backing each seat type, resolved via the credit's
    // `subscription_config.subscription_id`. Two seat tiers can share a credit
    // NAME across the monthly and yearly products (e.g. two "Pro Seat
    // Credits"), so the ledger adjustment must target the credit by id, not by
    // name, or it can hit the wrong pool (where the seat isn't active).
    const recurringCreditIdBySeatType = new Map<MembershipSeatType, string>();
    const allocationBySeatType = new Map<MembershipSeatType, number>();
    for (const { sub, seatType } of seatSubscriptions) {
      if (!sub.id || !getSeatCreditNameForSeatType(seatType)) {
        continue;
      }
      const recurringCredit = (resolvedContract.recurring_credits ?? []).find(
        (c) => c.subscription_config?.subscription_id === sub.id
      );
      if (recurringCredit?.id) {
        recurringCreditIdBySeatType.set(seatType, recurringCredit.id);
      }
      allocationBySeatType.set(
        seatType,
        getAwuAllocationForSeatType(
          resolvedContract,
          seatType,
          productSeatTypes
        )
      );
    }
    let pendingCreditTransfers: SeatCreditTransfer[] = [];
    // Per-subscription "now" seat state, fetched once here and reused by the
    // transfer prep below, the immediate-base reconcile pass, and the
    // free-seat revoke check further down — otherwise each would separately
    // query Metronome for the exact same data.
    const seatStateBySubscriptionId = new Map<string, SubscriptionSeatState>();
    if (!startingAt) {
      const seatStateStartedAt = Date.now();
      // Free isn't in `subscriptionIdBySeatType` (no recurring credit — see
      // `getSeatCreditNameForSeatType`), but its assignment list is still
      // useful below to cheaply detect who moved away from a free seat.
      const freeSubscriptionId = seatSubscriptions.find(
        ({ seatType }) => seatType === "free"
      )?.sub.id;
      const subscriptionIdsToFetch = [
        ...subscriptionIdBySeatType,
        ...(freeSubscriptionId ? [["free", freeSubscriptionId] as const] : []),
      ];
      for (const [seatType, subscriptionId] of subscriptionIdsToFetch) {
        const stateRes = await getMetronomeSubscriptionSeatState({
          metronomeCustomerId,
          contractId,
          subscriptionId,
        });
        if (stateRes.isErr()) {
          logger.error(
            {
              workspaceId: workspace.sId,
              contractId,
              seatType,
              error: stateRes.error,
            },
            "[Metronome] Failed to read current seat state — skipping tier for credit transfer"
          );
          continue;
        }
        seatStateBySubscriptionId.set(subscriptionId, stateRes.value);
      }
      logger.info(
        {
          workspaceId: workspace.sId,
          contractId,
          subscriptionCount: seatStateBySubscriptionId.size,
          durationMs: Date.now() - seatStateStartedAt,
        },
        "[Metronome] Current seat state fetched"
      );

      const transfersStartedAt = Date.now();
      pendingCreditTransfers = await emptyOriginSeatCreditsForTransfers({
        metronomeCustomerId,
        contractId,
        workspaceId: workspace.sId,
        subscriptionIdBySeatType,
        recurringCreditIdBySeatType,
        allocationBySeatType,
        desiredSeatByUser: currentSeatByUserSId,
        seatStateBySubscriptionId,
      });
      logger.info(
        {
          workspaceId: workspace.sId,
          contractId,
          transferCount: pendingCreditTransfers.length,
          durationMs: Date.now() - transfersStartedAt,
        },
        "[Metronome] emptyOriginSeatCreditsForTransfers done"
      );
      didMutateSeatData =
        didMutateSeatData || pendingCreditTransfers.length > 0;
    }

    const reconcileLoopStartedAt = Date.now();
    let reconcileSegmentCallCount = 0;
    for (const { sub, seatType } of seatSubscriptions) {
      const subscriptionId = sub.id!;
      const quantityMode = sub.quantity_management_mode ?? "QUANTITY_ONLY";
      const subscriptionEndingBeforeMs = sub.ending_before
        ? Date.parse(sub.ending_before)
        : undefined;

      const shouldSkipTimestamp = (tMs: number): boolean => {
        if (
          subscriptionEndingBeforeMs === undefined ||
          tMs < subscriptionEndingBeforeMs
        ) {
          return false;
        }
        logger.info(
          {
            workspaceId: workspace.sId,
            contractId,
            subscriptionId,
            seatType,
            tMs,
            endingBefore: sub.ending_before,
          },
          "[Metronome] Skipping seat reconciliation at or after subscription end"
        );
        return true;
      };

      if (quantityMode === "SEAT_BASED") {
        // One reconcile per distinct effective moment. `desiredSIds` and the
        // seat limit are BOTH evaluated at the SAME moment the segment is
        // written to — so a future contract start reflects the membership state
        // at the start (post-remap), and a scheduled commitment change reflects
        // the floor active from that instant. A commitment change that leaves
        // membership unchanged therefore only moves the *unassigned* seats (the
        // floor top-up), since the assigned real users stay the same.
        for (const tMs of effectiveTimestampsMs) {
          if (shouldSkipTimestamp(tMs)) {
            continue;
          }
          const isImmediateBase = tMs === baseMs && !startingAt;
          // Immediate base sync: let Metronome default to "now" for both the
          // write (`starting_at`) and the read (`covering_date`). Any other
          // moment (forced start or a scheduled change) pins to that instant.
          const segmentStartingAt = isImmediateBase
            ? undefined
            : new Date(tMs).toISOString();
          const coveringDate = isImmediateBase ? undefined : new Date(tMs);
          const segmentStartedAt = Date.now();
          const result = await reconcileSeatBasedSegment({
            metronomeCustomerId,
            contractId,
            subscriptionId,
            seatType,
            desiredSIds: desiredSIdsAt(seatType, tMs),
            seatLimit: seatLimitAt(seatType, tMs),
            startingAt: segmentStartingAt,
            coveringDate,
            workspaceId: workspace.sId,
            assumeEmptySeats,
            cachedSeatState: isImmediateBase
              ? seatStateBySubscriptionId.get(subscriptionId)
              : undefined,
          });
          reconcileSegmentCallCount++;
          logger.info(
            {
              workspaceId: workspace.sId,
              contractId,
              subscriptionId,
              seatType,
              tMs,
              durationMs: Date.now() - segmentStartedAt,
            },
            "[Metronome] reconcileSeatBasedSegment call done"
          );
          await heartbeat();
          if (result.isErr()) {
            return new Err(result.error);
          }
          didMutateSeatData = didMutateSeatData || result.value;
        }
      } else {
        // QUANTITY_ONLY: send the total for "now" plus a future-dated total at
        // every effective moment where it changes (a scheduled commitment or
        // membership change). Consecutive equal quantities are skipped so we
        // only write real transitions. `maxSeats` is deliberately NOT applied
        // here — it is an assignment-time cap, and billing must always reflect
        // the actual assigned count so members holding a seat are never
        // unbilled.
        let lastQuantity: number | undefined;
        for (const tMs of effectiveTimestampsMs) {
          if (shouldSkipTimestamp(tMs)) {
            continue;
          }
          const isImmediateBase = tMs === baseMs && !startingAt;
          const segmentStartingAt = isImmediateBase
            ? startingAt
            : new Date(tMs).toISOString();
          const actualQuantity = desiredSIdsAt(seatType, tMs).length;
          // Clamp up to the configured billing floor: below `minSeats` we still
          // bill the floor.
          const quantity = clampSeatCountToMin(
            actualQuantity,
            seatLimitAt(seatType, tMs)
          );
          if (quantity === lastQuantity) {
            continue;
          }
          lastQuantity = quantity;
          logger.info(
            {
              workspaceId: workspace.sId,
              contractId,
              subscriptionId,
              seatType,
              actualQuantity,
              quantity,
              startingAt: segmentStartingAt,
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
            startingAt: segmentStartingAt,
          });
          await heartbeat();
          if (updateResult.isErr()) {
            return new Err(updateResult.error);
          }
          didMutateSeatData = true;
        }
      }
    }
    logger.info(
      {
        workspaceId: workspace.sId,
        contractId,
        reconcileSegmentCallCount,
        durationMs: Date.now() - reconcileLoopStartedAt,
      },
      "[Metronome] Seat-subscription reconcile loop done"
    );

    // New seats are now assigned, so their credits exist: carry the consumed
    // AWU emptied from the origin seats onto them (see above).
    if (pendingCreditTransfers.length > 0) {
      const carryStartedAt = Date.now();
      await carryConsumptionToNewSeatCredits({
        metronomeCustomerId,
        contractId,
        workspaceId: workspace.sId,
        transfers: pendingCreditTransfers,
        subscriptionIdBySeatType,
        recurringCreditIdBySeatType,
        allocationBySeatType,
      });
      logger.info(
        {
          workspaceId: workspace.sId,
          contractId,
          transferCount: pendingCreditTransfers.length,
          durationMs: Date.now() - carryStartedAt,
        },
        "[Metronome] carryConsumptionToNewSeatCredits done"
      );

      // Recurring credits are materialized one period ahead, so the origin
      // seat's pre-grant on the NEXT period's segment survives the move and
      // re-stacks when that period starts. Empty it too — see
      // `emptyOriginNextPeriodCredits`.
      const nextPeriodStartedAt = Date.now();
      await emptyOriginNextPeriodCredits({
        metronomeCustomerId,
        contractId,
        workspaceId: workspace.sId,
        contract: resolvedContract,
        productSeatTypes,
        transfers: pendingCreditTransfers,
        recurringCreditIdBySeatType,
        allocationBySeatType,
      });
      logger.info(
        {
          workspaceId: workspace.sId,
          contractId,
          transferCount: pendingCreditTransfers.length,
          durationMs: Date.now() - nextPeriodStartedAt,
        },
        "[Metronome] emptyOriginNextPeriodCredits done"
      );
    }

    // Per-user AWU grant/revoke for free members. Driven off DB membership
    // state, NOT off a Metronome free-seat subscription: free seats are never
    // billed and may not be an entitled SEAT_BASED subscription on the
    // contract, so this runs independently of the seat-subscription loop
    // above. Best-effort and idempotent. Grant deduped by the grant's uniqueness
    // key; revoke archives the credit + drops alerts for users who left the free
    // seat (the uniqueness key stays claimed, so they can't re-claim).
    //
    // Skipped entirely on a legacy contract: `free` is a CP/AWU-era seat type
    // that a legacy contract never entitles (see `canAssignFreeSeat`), and the
    // invariant that no membership on a legacy contract ever has
    // `seatType === "free"` holds — so there is nothing to grant, alert, or
    // revoke here, and no need to even compute `currentFreeUserIds`.
    const freeSeatStartedAt = Date.now();
    let currentFreeUserIds = new Set<string>();
    if (legacy) {
      logger.info(
        { workspaceId: workspace.sId, contractId },
        "[Metronome] Legacy contract — skipping free-seat credit grant/revoke entirely"
      );
    } else {
      // Computed directly from `seatTypeAt`, NOT via `desiredSIdsAt`:
      // `desiredSIdsAt` folds every user in on a legacy contract (`|| legacy`,
      // for billing "none"/legacy Platform Seat members under the one
      // "workspace" subscription) — irrelevant here since this whole branch
      // is skipped when `legacy` is true, but kept explicit for clarity.
      currentFreeUserIds = new Set(
        [...allUserSIds].filter(
          (userId) => seatTypeAt(userId, baseMs) === "free"
        )
      );

      // Metronome's actual "free" subscription assignment (already fetched
      // above, alongside every other subscription's "now" state) — used to
      // scope both the alert-upsert step below and the revoke check further
      // down to only the users who actually changed, instead of reprocessing
      // everyone free on every single sync. Undefined when the contract
      // doesn't have "free" entitled, or this is the pending-contract
      // pre-provision pass (no live state to compare against yet).
      const freeSubscriptionId = seatSubscriptions.find(
        ({ seatType }) => seatType === "free"
      )?.sub.id;
      const freeSeatState = freeSubscriptionId
        ? seatStateBySubscriptionId.get(freeSubscriptionId)
        : undefined;
      const alreadyAssignedFreeUserIds = new Set(
        freeSeatState?.assignedSeatIds ?? []
      );

      await grantFreeSeatCredits({
        metronomeCustomerId,
        workspaceId: workspace.sId,
        userIds: [...currentFreeUserIds],
        alreadyAssignedFreeUserIds,
        startingAt: new Date(baseMs),
      });

      // Revoking a stale free-seat credit is low-stakes (a user can only ever
      // have earned one by actually holding a free seat) — unlike the grant, it
      // isn't worth an unconditional Metronome credit-listing call on every
      // sync (this runs on every membership change). Instead, use the "free"
      // subscription's already-fetched seat assignment (Metronome's actual
      // current state) to see who's assigned to free there but no longer
      // desired as free in our DB, and only call the (expensive) revoke check
      // when that set is non-empty. If we don't have that data (contract
      // doesn't have "free" entitled, or this is the pending-contract
      // pre-provision pass), skip the check entirely rather than falling back
      // to the always-expensive path.
      const movedAwayFromFree = freeSeatState
        ? freeSeatState.assignedSeatIds.filter(
            (id) => !currentFreeUserIds.has(id)
          )
        : [];
      if (movedAwayFromFree.length > 0 || forceFreeCreditRevokeCheck) {
        logger.info(
          {
            workspaceId: workspace.sId,
            contractId,
            forceFreeCreditRevokeCheck,
          },
          "[Metronome] Running ex-free-seat credit revoke check"
        );
        await revokeFreeSeatCreditsForExFreeUsers({
          metronomeCustomerId,
          workspaceId: workspace.sId,
          currentFreeUserIds,
        });
      } else {
        logger.info(
          { workspaceId: workspace.sId, contractId },
          "[Metronome] No users moved away from a free seat — skipping free-credit revoke check"
        );
      }
    }
    const summary: SyncSeatCountSummary = {
      seatSubscriptionCount: seatSubscriptions.length,
      distinctTimestampCount: effectiveTimestampsMs.length,
      reconcileSegmentCallCount,
      transferCount: pendingCreditTransfers.length,
      freeUserCount: currentFreeUserIds.size,
      didMutateSeatData,
      durationMs: Date.now() - syncStartedAt,
    };
    logger.info(
      {
        workspaceId: workspace.sId,
        contractId,
        ...summary,
        freeSeatDurationMs: Date.now() - freeSeatStartedAt,
      },
      "[Metronome] syncSeatCount done"
    );

    return new Ok(summary);
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
 * `maxSeats` is intentionally not applied: it caps new assignments, never the
 * billed quantity — billing must reflect the seats actually held.
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
  assumeEmptySeats,
  cachedSeatState,
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
  // Skip the Metronome seat-state read and treat the segment as empty. Only
  // safe for a freshly provisioned contract (no prior assignments at any
  // timestamp) — set by switchContract when the contract was newly created
  // (not recovered).
  assumeEmptySeats?: boolean;
  // Reuse a seat state already fetched for this exact subscription + moment
  // (e.g. by `emptyOriginSeatCreditsForTransfers`'s "now" read) instead of
  // querying Metronome again for the same data.
  cachedSeatState?: SubscriptionSeatState;
}): Promise<Result<boolean, Error>> {
  let assignedSeatIds: string[];
  let currentUnassigned: number;
  if (assumeEmptySeats) {
    assignedSeatIds = [];
    currentUnassigned = 0;
  } else if (cachedSeatState) {
    assignedSeatIds = cachedSeatState.assignedSeatIds;
    currentUnassigned = cachedSeatState.unassignedSeats;
  } else {
    const currentResult = await getMetronomeSubscriptionSeatState({
      metronomeCustomerId,
      contractId,
      subscriptionId,
      coveringDate,
    });
    if (currentResult.isErr()) {
      return new Err(currentResult.error);
    }
    assignedSeatIds = currentResult.value.assignedSeatIds;
    currentUnassigned = currentResult.value.unassignedSeats;
  }

  // `maxSeats` is deliberately not enforced here: it caps new assignments
  // (`seat_limit_reached` upstream), never the synced state. Every member who
  // actually holds a seat must stay assigned and billed in Metronome — e.g.
  // when an admin lowers the cap below the current headcount.
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
  // ISO timestamp of the next credit reset. Null when no current billing period
  // is available. Equals billing_periods.current.ending_before since credits
  // are now anchored to the contract start date (same as the billing period).
  nextCreditResetAt: string | null;
};

// Seat data only feeds display surfaces that degrade gracefully, so failing
// fast beats burning rate-limit budget on retries when Metronome is throttling.
const SEAT_DATA_READ_MAX_RETRIES = 1;

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
    maxRetries: SEAT_DATA_READ_MAX_RETRIES,
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

      const seatStateResult = await getMetronomeSubscriptionSeatState({
        metronomeCustomerId,
        contractId,
        subscriptionId: sub.id,
        maxRetries: SEAT_DATA_READ_MAX_RETRIES,
      });
      if (seatStateResult.isErr()) {
        logger.warn(
          {
            error: seatStateResult.error,
            metronomeCustomerId,
            contractId,
            subscriptionId: sub.id,
            seatType,
          },
          "[Metronome] Failed to fetch seat IDs"
        );
        return new Err(seatStateResult.error);
      }
      const assignedSeatIds = seatStateResult.value.assignedSeatIds;

      const freq = sub.subscription_rate.billing_frequency;
      const nextCreditResetAt =
        sub.billing_periods?.current?.ending_before ?? null;
      return new Ok({
        seatIds: assignedSeatIds,
        awuAllocation,
        billingFrequency: freq === "MONTHLY" || freq === "ANNUAL" ? freq : null,
        nextCreditResetAt,
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
          nextCreditResetAt: subSeatData.nextCreditResetAt,
        });
      }
    }
  }

  return new Ok(seatDataByUserId);
}

const SEAT_DATA_CACHE_TTL_MS = 10 * 60 * 1000;

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
}): Promise<Result<Record<string, SeatData>, Error>> {
  const seatDataResult = await buildSeatDataByUserId(args);
  if (seatDataResult.isErr()) {
    return new Err(seatDataResult.error);
  }
  return new Ok(Object.fromEntries(seatDataResult.value));
}

// At most one Metronome fan-out in flight per contract fleet-wide: concurrent
// misses on other processes get null (callers degrade) instead of each firing
// their own contract + per-subscription seat reads. Best-effort past the
// distributed lock's 5s TTL: a fan-out slower than that lets a second fetcher
// start, so the bound is "a couple in flight", never a storm.
export const getCachedSeatDataByUserId = cacheWithRedisResult(
  fetchSeatDataRecord,
  seatDataCacheResolver,
  {
    cacheId: fetchSeatDataRecord.name,
    ttlMs: SEAT_DATA_CACHE_TTL_MS,
    useDistributedLock: true,
    skipIfLocked: true,
  }
);

const invalidateCachedSeatDataByUserId = bestEffortInvalidateCacheWithRedis(
  fetchSeatDataRecord,
  seatDataCacheResolver,
  "members-usage seat data"
);

const SEAT_BALANCES_CACHE_TTL_MS = 10 * 60 * 1000;

const seatBalancesCacheResolver = ({
  metronomeCustomerId,
  metronomeContractId,
  seatIds,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
  seatIds: string[];
}) =>
  `${metronomeCustomerId}-${metronomeContractId}-${[...seatIds].sort().join(",")}`;

async function fetchSeatBalances(args: {
  metronomeCustomerId: string;
  metronomeContractId: string;
  seatIds: string[];
}): Promise<Result<MetronomeSeatBalance[], Error>> {
  const balancesResult = await listMetronomeSeatBalances(args);
  if (balancesResult.isErr()) {
    return new Err(balancesResult.error);
  }
  return new Ok(balancesResult.value);
}

// Same fleet-wide single-flight rationale as `getCachedSeatDataByUserId`: concurrent
// misses on other processes get null (callers degrade) instead of each firing their
// own Metronome seat-balances fan-out for the same page of members.
export const getCachedSeatBalances = cacheWithRedisResult(
  fetchSeatBalances,
  seatBalancesCacheResolver,
  {
    cacheId: fetchSeatBalances.name,
    ttlMs: SEAT_BALANCES_CACHE_TTL_MS,
    useDistributedLock: true,
    skipIfLocked: true,
  }
);
